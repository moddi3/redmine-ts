// Who may ask for a token. A client is a Client ID Metadata Document, an https URL the server fetches,
// or a registration the server sealed into the client_id itself, so no client is ever stored.

import { z } from "zod";
import type { Sealer } from "./seal.ts";
import { readText } from "./web.ts";

export interface Client {
  id: string;
  /** The name the client gives itself. */
  name: string | undefined;
  /** The host that serves the client's metadata document. Undefined for a registered client. */
  documentHost: string | undefined;
  redirectUris: readonly string[];
}

export interface ClientsOptions {
  sealer: Sealer;
  /** Fetches metadata documents. It must refuse private addresses where the runtime can tell. */
  fetch: typeof fetch;
  /** Hostnames a client must belong to. Undefined admits any client. */
  allowedHosts: readonly string[] | undefined;
}

/** Documents are small; the draft suggests 5 KB as the cap. */
const DOCUMENT_MAX_BYTES = 5 * 1024;
const DOCUMENT_TIMEOUT_MS = 5000;
const DOCUMENT_CACHE_MS = 5 * 60_000;
const DOCUMENT_CACHE_SIZE = 256;
/**
 * Documents one handler fetches at once, which is one process for the CLI and one isolate on Workers.
 * Each document is fetched about once per DOCUMENT_CACHE_MS, so sign-ins rarely need two at a time.
 * The cap bounds the sockets that unauthenticated authorize requests can make the server open.
 */
const DOCUMENT_FETCHES = 8;
/**
 * A fetch settles within its timeout, unless the request that started it was cancelled, as Workers
 * cancel the work of a request whose client disconnects. Its slot is then free after this long, and
 * requests that share it stop waiting.
 */
const FLIGHT_MS = DOCUMENT_TIMEOUT_MS + 1000;
/**
 * While every slot is taken, a document fetched within this time still serves its client, so a flood
 * of unknown client_ids cannot lock out a client the server has seen.
 */
const DOCUMENT_STALE_MS = 60 * 60_000;
const UNFETCHED = "its metadata document could not be fetched";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * What resolve answers when the client needs a fetch that cannot answer in time, because every slot is
 * taken or its own fetch did not settle, and no document fetched within DOCUMENT_STALE_MS can serve it.
 */
export const BUSY: unique symbol = Symbol("busy");
/** Most slots free within one fetch timeout. */
export const BUSY_RETRY_SECONDS: number = DOCUMENT_TIMEOUT_MS / 1000;

/** Names are shown on the consent page and sealed into registrations, so they stay short. */
const NAME_MAX_LENGTH = 100;
/** Keeps a registered client_id, which seals its redirect URIs, near 2 KB at most. */
const REGISTERED_REDIRECTS = 5;
const REDIRECT_MAX_LENGTH = 256;

const Document = z.object({
  client_id: z.string(),
  client_name: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional().catch(undefined),
  redirect_uris: z.array(z.string()).min(1).max(20),
  token_endpoint_auth_method: z.string().optional(),
  client_secret: z
    .undefined({ error: "a metadata document must not carry a client_secret" })
    .optional(),
});

const Registration = z.object({
  // An empty or long name is dropped, not refused: the client still registers.
  client_name: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional().catch(undefined),
  redirect_uris: z.array(z.string().max(REDIRECT_MAX_LENGTH)).min(1).max(REGISTERED_REDIRECTS),
  token_endpoint_auth_method: z.string().optional(),
});

interface Sealed {
  n?: string;
  r: string[];
}

export type Registered =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: "invalid_client_metadata" | "invalid_redirect_uri"; description: string };

export interface Clients {
  /** The client a client_id names, why it is refused, or BUSY to try again in a moment. */
  resolve(clientId: string): Promise<Client | string | typeof BUSY>;
  /** Dynamic Client Registration (RFC 7591) for clients without a metadata document. */
  register(metadata: unknown): Promise<Registered>;
}

export function createClients({ sealer, fetch, allowedHosts }: ClientsOptions): Clients {
  const documents = new Map<string, { client: Client; fetched: number }>();
  /** Fetches under way by client_id. Concurrent resolves of one client_id share its fetch. */
  const flights = new Map<string, { outcome: Promise<Client | string>; until: number }>();
  const admitted = (host: string) => allowedHosts === undefined || allowedHosts.includes(host);

  async function fetchDocument(clientId: string): Promise<Client | string | typeof BUSY> {
    const url = documentUrl(clientId);
    if (typeof url === "string") return url;
    if (!admitted(url.hostname)) return `${url.hostname} is not an allowed client host`;
    const now = Date.now();
    const cached = documents.get(clientId);
    if (cached !== undefined && cached.fetched + DOCUMENT_CACHE_MS > now) return cached.client;
    for (const [id, flight] of flights) if (flight.until <= now) flights.delete(id);
    let flight = flights.get(clientId);
    if (flight === undefined) {
      if (flights.size >= DOCUMENT_FETCHES) return recent(clientId);
      // A flight past its time may have been dropped and replaced by a newer one, which stays.
      const current = () => flights.get(clientId) === started;
      const started = { outcome: load(clientId, url, current), until: now + FLIGHT_MS };
      const land = () => {
        if (current()) flights.delete(clientId);
      };
      started.outcome.then(land, land);
      flights.set(clientId, started);
      flight = started;
    }
    return settled(flight.outcome, flight.until - now, () => recent(clientId));
  }

  /** The document fetched within DOCUMENT_STALE_MS, for when no fetch can answer now, or BUSY. */
  function recent(clientId: string): Client | typeof BUSY {
    const kept = documents.get(clientId);
    return kept !== undefined && kept.fetched + DOCUMENT_STALE_MS > Date.now() ? kept.client : BUSY;
  }

  /**
   * Fetches and checks a document, and keeps a valid one. A failure keeps nothing, as draft 02 of
   * Client ID Metadata Documents forbids caching error responses and invalid documents (section 5.2).
   * It also drops the copy held before, so a busy server never serves a client whose document fails.
   * Only the current flight writes, so a fetch that lands after its time leaves a newer document.
   */
  async function load(
    clientId: string,
    url: URL,
    current: () => boolean,
  ): Promise<Client | string> {
    const outcome = await fetchAndCheck(clientId, url);
    if (!current()) return outcome;
    if (typeof outcome === "string") {
      documents.delete(clientId);
    } else {
      remember(documents, clientId, { client: outcome, fetched: Date.now() }, DOCUMENT_CACHE_SIZE);
    }
    return outcome;
  }

  async function fetchAndCheck(clientId: string, url: URL): Promise<Client | string> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
      });
    } catch {
      return UNFETCHED;
    }
    // The status is not repeated: it would tell the caller what answers where the URL points.
    if (response.status !== 200) {
      await response.body?.cancel();
      return UNFETCHED;
    }
    let text: string | undefined;
    try {
      text = await readText(response, DOCUMENT_MAX_BYTES);
    } catch {
      // The timeout also ends a body that stalls after the headers.
      return UNFETCHED;
    }
    if (text === undefined) return `its metadata document is over ${DOCUMENT_MAX_BYTES} bytes`;
    let parsed: z.infer<typeof Document>;
    try {
      parsed = Document.parse(JSON.parse(text));
    } catch {
      return "its metadata document is not valid client metadata";
    }
    if (parsed.client_id !== clientId) return "its metadata document names another client_id";
    // Only public clients: a client that declares another method expects us to authenticate it.
    if (!publicClient(parsed.token_endpoint_auth_method)) {
      return "its metadata document asks for client authentication, and this server has public clients only";
    }
    if (!parsed.redirect_uris.every(isRedirectUri)) {
      return "its metadata document lists a redirect URI that is not https or loopback";
    }
    return {
      id: clientId,
      name: parsed.client_name,
      documentHost: url.hostname,
      redirectUris: parsed.redirect_uris,
    };
  }

  return {
    async resolve(clientId: string): Promise<Client | string | typeof BUSY> {
      if (clientId.startsWith("https://")) return fetchDocument(clientId);
      const sealed = await sealer.open<Sealed>("registration", clientId);
      if (sealed === undefined) return "it is not a client this server registered or can fetch";
      if (!sealed.r.every((uri) => admitted(new URL(uri).hostname))) {
        return "its redirect URIs are not on allowed client hosts";
      }
      return { id: clientId, name: sealed.n, documentHost: undefined, redirectUris: sealed.r };
    },

    async register(metadata: unknown): Promise<Registered> {
      const parsed = Registration.safeParse(metadata);
      if (!parsed.success) {
        return {
          ok: false,
          error: "invalid_client_metadata",
          description: `Send redirect_uris, 1 to ${REGISTERED_REDIRECTS} of them, each at most ${REDIRECT_MAX_LENGTH} characters, and optionally client_name, at most ${NAME_MAX_LENGTH}`,
        };
      }
      const { client_name, redirect_uris, token_endpoint_auth_method } = parsed.data;
      if (!REGISTERABLE_METHODS.has(token_endpoint_auth_method ?? "none")) {
        return {
          ok: false,
          error: "invalid_client_metadata",
          description:
            "This server registers public clients only: it answers token_endpoint_auth_method none, and cannot verify a key",
        };
      }
      if (!redirect_uris.every(isRedirectUri)) {
        return {
          ok: false,
          error: "invalid_redirect_uri",
          description: "Redirect URIs must be https, or http on localhost, without a fragment",
        };
      }
      if (!redirect_uris.every((uri) => admitted(new URL(uri).hostname))) {
        return {
          ok: false,
          error: "invalid_redirect_uri",
          description: "Redirect URIs must be on allowed client hosts",
        };
      }
      const sealed: Sealed = {
        r: redirect_uris,
        ...(client_name === undefined ? {} : { n: client_name }),
      };
      return {
        ok: true,
        body: {
          client_id: await sealer.seal("registration", sealed),
          client_id_issued_at: Math.floor(Date.now() / 1000),
          redirect_uris,
          ...(client_name === undefined ? {} : { client_name }),
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
      };
    },
  };
}

/**
 * Whether `requested` is `registered`, exactly, or the same loopback URI on another port, which
 * RFC 8252 asks for: Claude Code and Codex listen on a random port.
 */
export function redirectMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  let a: URL;
  let b: URL;
  try {
    a = new URL(registered);
    b = new URL(requested);
  } catch {
    return false;
  }
  return (
    a.protocol === "http:" &&
    LOOPBACK.has(a.hostname) &&
    b.protocol === a.protocol &&
    b.hostname === a.hostname &&
    b.pathname === a.pathname &&
    b.search === a.search &&
    b.hash === "" &&
    b.username === "" &&
    b.password === ""
  );
}

/**
 * A shared fetch's outcome, or `late()` once its time is up, since a cancelled fetch never settles.
 * Its sharers then know nothing about the client, so they get no refusal.
 */
function settled(
  outcome: Promise<Client | string>,
  ms: number,
  late: () => Client | typeof BUSY,
): Promise<Client | string | typeof BUSY> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lapsed = new Promise<Client | typeof BUSY>((resolve) => {
    timer = setTimeout(() => resolve(late()), ms);
  });
  return Promise.race([outcome, lapsed]).finally(() => clearTimeout(timer));
}

/** Sets `key` as the newest entry of a map that keeps at most `size`, dropping the oldest. */
function remember<V>(map: Map<string, V>, key: string, value: V, size: number): void {
  map.delete(key);
  if (map.size >= size) map.delete(map.keys().next().value!);
  map.set(key, value);
}

/** No method, or `none`: the client proves itself with PKCE alone. */
function publicClient(method: string | undefined): boolean {
  return method === undefined || method === "none";
}

/**
 * What a registration may ask for. The server is the registrar, so it may answer `none` to a client
 * that asked for a secret it never gets, as RFC 7591 allows, and an omitted method means
 * client_secret_basic there. Key-based methods are refused: their clients expect to prove a key. A
 * metadata document is the client's own declaration, so it gets no such rewrite.
 */
const REGISTERABLE_METHODS: ReadonlySet<string> = new Set([
  "none",
  "client_secret_basic",
  "client_secret_post",
]);

/** Whether `requested` is one of the client's redirect URIs. */
export function allowsRedirect(client: Client, requested: string): boolean {
  return client.redirectUris.some((registered) => redirectMatches(registered, requested));
}

/** An https URL, or http on a loopback host, as the MCP spec allows. */
function isRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash !== "" || url.username !== "" || url.password !== "") return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
}

/**
 * The client_id as a document URL the server may fetch: https, normalized, with a path, on a public
 * name. IP literals and local names are refused here; a fetch that checks resolved addresses refuses
 * the rest.
 */
function documentUrl(clientId: string): URL | string {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return "it is not a URL";
  }
  if (url.href !== clientId) return "its URL is not in normalized form";
  if (url.pathname === "/") return "its URL has no path";
  if (url.port !== "" || url.username !== "" || url.password !== "" || url.hash !== "") {
    return "its URL carries a port, credentials or a fragment";
  }
  const host = url.hostname;
  const local =
    !host.includes(".") ||
    host.startsWith("[") ||
    /^[\d.]+$/.test(host) ||
    /\.(localhost|local|internal|home\.arpa|localdomain)$/.test(host);
  return local ? "its URL does not name a public host" : url;
}
