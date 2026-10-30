// Who may ask for a token. A client is a Client ID Metadata Document, an https URL the server fetches,
// or a registration the server sealed into the client_id itself, so no client is ever stored.

import type { JSONWebKeySet } from "jose";
import { z } from "zod";
import { isSigningAlg, peek, verifyAssertion } from "./assertion.ts";
import type { SigningAlg, Verified } from "./assertion.ts";
import type { Sealer } from "./seal.ts";
import { readText } from "./web.ts";

export interface Client {
  id: string;
  /** The name the client gives itself. */
  name: string | undefined;
  /** The host that serves the client's metadata document. Undefined for a registered client. */
  documentHost: string | undefined;
  redirectUris: readonly string[];
  authentication: ClientAuthentication;
}

/**
 * How a client proves itself at the token endpoint: with PKCE alone, or also with a JWT signed by a
 * key its metadata document publishes, inline or at a URL, and with the alg the document names.
 */
export type ClientAuthentication =
  | { method: "none" }
  | {
      method: "private_key_jwt";
      keys: { set: JSONWebKeySet } | { uri: string };
      alg: SigningAlg | undefined;
    };

/**
 * Why a client failed to authenticate: refused, for a proof or a document that is wrong, or
 * unreachable, when its document or key set could not be fetched.
 */
export type Unauthenticated = { refused: string } | { unreachable: string };

export interface ClientsOptions {
  sealer: Sealer;
  /**
   * Fetches metadata documents and the key sets they name. It must refuse private addresses where
   * the runtime can tell.
   */
  fetch: typeof fetch;
  /** Hostnames a client must belong to. Undefined admits any client. */
  allowedHosts: readonly string[] | undefined;
  /** What a client assertion's aud may name: the server's issuer and its token endpoint. */
  audiences: readonly string[];
}

/** Documents are small; the draft suggests 5 KB as the cap. */
const DOCUMENT_MAX_BYTES = 5 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const CACHE_MS = 5 * 60_000;
const CACHE_SIZE = 256;
/**
 * Documents one handler fetches at once, which is one process for the CLI and one isolate on Workers.
 * Each document is fetched about once per CACHE_MS, so sign-ins rarely need two at a time. The cap
 * bounds the sockets that unauthenticated authorize requests can make the server open.
 */
const DOCUMENT_FETCHES = 8;
/**
 * A fetch settles within its timeout, unless the request that started it was cancelled, as Workers
 * cancel the work of a request whose client disconnects. Its slot is then free after this long, and
 * requests that share it stop waiting.
 */
const FLIGHT_MS = FETCH_TIMEOUT_MS + 1000;
/**
 * While every slot is taken, a document or key set fetched within this time still serves its client,
 * so a flood of unknown client_ids or slow key sets cannot lock out a client the server has seen.
 */
const STALE_MS = 60 * 60_000;
const UNFETCHED = "its metadata document could not be fetched";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** ChatGPT's key set, one RSA key, is 438 bytes. */
const KEY_SET_MAX_BYTES = 16 * 1024;
/**
 * Key sets one handler fetches at once. Only a grant sealed for a client that declared
 * private_key_jwt makes the server fetch one, at the token endpoint, so a few slots of their own
 * keep a flood of sign-ins from delaying them.
 */
const KEY_SET_FETCHES = 4;
/** A kid the kept key set lacks fetches it again once it is this old, so random kids cannot. */
const KEY_SET_REFETCH_MS = 60_000;

/**
 * What resolve answers when the client needs a fetch that cannot answer in time, because every slot is
 * taken or its own fetch did not settle, and no document or key set fetched within STALE_MS can serve it.
 */
export const BUSY: unique symbol = Symbol("busy");
/** Most slots free within one fetch timeout. */
export const BUSY_RETRY_SECONDS: number = FETCH_TIMEOUT_MS / 1000;

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
  // Read only for private_key_jwt, so a public client's document is checked as before.
  token_endpoint_auth_signing_alg: z.unknown().optional(),
  jwks: z.unknown().optional(),
  jwks_uri: z.unknown().optional(),
  client_secret: z
    .undefined({ error: "a metadata document must not carry a client_secret" })
    .optional(),
});

const KeySet = z.object({
  keys: z.array(
    z.looseObject({ kty: z.string(), kid: z.string().optional(), use: z.string().optional() }),
  ),
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
  /**
   * Checks the client_assertion of a client whose grant was sealed for private_key_jwt, against the
   * keys its current document gives, or BUSY to try again in a moment.
   */
  authenticate(
    clientId: string,
    assertion: string,
  ): Promise<Verified | Unauthenticated | typeof BUSY>;
  /** Dynamic Client Registration (RFC 7591) for clients without a metadata document. */
  register(metadata: unknown): Promise<Registered>;
}

export function createClients({ sealer, fetch, allowedHosts, audiences }: ClientsOptions): Clients {
  const documents = new Map<string, { client: Client; fetched: number }>();
  const documentFlights = createFlights<Client | string>(DOCUMENT_FETCHES);
  const keySets = new Map<string, { set: JSONWebKeySet; fetched: number }>();
  const keySetFlights = createFlights<JSONWebKeySet | Unauthenticated>(KEY_SET_FETCHES);
  const admitted = (host: string) => allowedHosts === undefined || allowedHosts.includes(host);

  async function resolve(clientId: string): Promise<Client | string | typeof BUSY> {
    if (clientId.startsWith("https://")) return fetchDocument(clientId);
    const sealed = await sealer.open<Sealed>("registration", clientId);
    if (sealed === undefined) return "it is not a client this server registered or can fetch";
    if (!sealed.r.every((uri) => admitted(new URL(uri).hostname))) {
      return "its redirect URIs are not on allowed client hosts";
    }
    return {
      id: clientId,
      name: sealed.n,
      documentHost: undefined,
      redirectUris: sealed.r,
      authentication: PUBLIC,
    };
  }

  async function fetchDocument(clientId: string): Promise<Client | string | typeof BUSY> {
    const url = documentUrl(clientId);
    if (typeof url === "string") return url;
    if (!admitted(url.hostname)) return `${url.hostname} is not an allowed client host`;
    const cached = documents.get(clientId);
    if (cached !== undefined && cached.fetched + CACHE_MS > Date.now()) return cached.client;
    return documentFlights(
      clientId,
      (current) => load(clientId, url, current),
      () => recent(clientId),
    );
  }

  /** The document fetched within STALE_MS, for when no fetch can answer now, or BUSY. */
  function recent(clientId: string): Client | typeof BUSY {
    const kept = documents.get(clientId);
    return kept !== undefined && kept.fetched + STALE_MS > Date.now() ? kept.client : BUSY;
  }

  /**
   * Fetches and checks a document, and keeps a valid one. A failure keeps nothing, as draft 02 of
   * Client ID Metadata Documents forbids caching error responses and invalid documents (section 5.2).
   * It also drops the copy held before, so a busy server never serves a client whose document fails.
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
      remember(documents, clientId, { client: outcome, fetched: Date.now() }, CACHE_SIZE);
    }
    return outcome;
  }

  /**
   * GETs a URL a client named: without following redirects, within the timeout, and at most
   * `maxBytes` of it. The status is not repeated: it would tell the caller what answers there.
   */
  async function download(
    url: URL,
    maxBytes: number,
  ): Promise<{ text: string } | "unfetched" | "oversize"> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return "unfetched";
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      return "unfetched";
    }
    let text: string | undefined;
    try {
      text = await readText(response, maxBytes);
    } catch {
      // The timeout also ends a body that stalls after the headers.
      return "unfetched";
    }
    return text === undefined ? "oversize" : { text };
  }

  async function fetchAndCheck(clientId: string, url: URL): Promise<Client | string> {
    const body = await download(url, DOCUMENT_MAX_BYTES);
    if (body === "unfetched") return UNFETCHED;
    if (body === "oversize") return `its metadata document is over ${DOCUMENT_MAX_BYTES} bytes`;
    let parsed: z.infer<typeof Document>;
    try {
      parsed = Document.parse(JSON.parse(body.text));
    } catch {
      return "its metadata document is not valid client metadata";
    }
    if (parsed.client_id !== clientId) return "its metadata document names another client_id";
    const authentication = authenticationOf(parsed);
    if (typeof authentication === "string") return authentication;
    if (!parsed.redirect_uris.every(isRedirectUri)) {
      return "its metadata document lists a redirect URI that is not https or loopback";
    }
    return {
      id: clientId,
      name: parsed.client_name,
      documentHost: url.hostname,
      redirectUris: parsed.redirect_uris,
      authentication,
    };
  }

  /**
   * The key set at `uri`, kept for CACHE_MS. A `kid` it lacks fetches it again, at most once per
   * KEY_SET_REFETCH_MS, so a rotated key works within a minute. A failed fetch is not kept, and the
   * set fetched before stays until its time is up.
   */
  async function keySet(
    uri: string,
    kid: unknown,
  ): Promise<JSONWebKeySet | Unauthenticated | typeof BUSY> {
    const kept = keySets.get(uri);
    const age = kept === undefined ? Infinity : Date.now() - kept.fetched;
    if (
      kept !== undefined &&
      age < CACHE_MS &&
      (holds(kept.set, kid) || age < KEY_SET_REFETCH_MS)
    ) {
      return kept.set;
    }
    return keySetFlights(
      uri,
      async (current) => {
        const outcome = await fetchKeySet(new URL(uri));
        if (current() && "keys" in outcome) {
          remember(keySets, uri, { set: outcome, fetched: Date.now() }, CACHE_SIZE);
        }
        return outcome;
      },
      () => {
        const recent = keySets.get(uri);
        return recent !== undefined &&
          recent.fetched + STALE_MS > Date.now() &&
          holds(recent.set, kid)
          ? recent.set
          : BUSY;
      },
    );
  }

  async function fetchKeySet(url: URL): Promise<JSONWebKeySet | Unauthenticated> {
    const body = await download(url, KEY_SET_MAX_BYTES);
    if (body === "unfetched") return { unreachable: "the client's key set could not be fetched" };
    if (body === "oversize") {
      return { refused: `the client's key set is over ${KEY_SET_MAX_BYTES} bytes` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      parsed = undefined;
    }
    return signingKeys(parsed) ?? { refused: "the client's key set has no signing key" };
  }

  return {
    resolve,

    async authenticate(clientId, assertion) {
      const client = await resolve(clientId);
      if (client === BUSY) return BUSY;
      if (typeof client === "string") {
        return client === UNFETCHED
          ? { unreachable: "the client's metadata document could not be fetched" }
          : { refused: `the server refuses the client: ${client}` };
      }
      const { authentication } = client;
      if (authentication.method !== "private_key_jwt") {
        return { refused: "the client's metadata document no longer declares private_key_jwt" };
      }
      const keys =
        "set" in authentication.keys
          ? authentication.keys.set
          : await keySet(authentication.keys.uri, peek(assertion)?.kid);
      if (keys === BUSY || !("keys" in keys)) return keys;
      return verifyAssertion(assertion, { clientId, keys, alg: authentication.alg, audiences });
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
            "This server registers public clients only, which use token_endpoint_auth_method none. A client with keys can instead use, as its client_id, the URL of a metadata document that declares private_key_jwt",
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
 * Starts a fetch for a key, or shares the one under way, with at most `cap` under way at once. A
 * caller gets `late()` when every slot is taken, or when the shared fetch is not done in its time.
 * `start` is told whether its flight is still the key's current one, once it has awaited something:
 * a flight stays current, even past its time, until a newer flight for the key starts.
 */
type Flights<T> = <L>(
  key: string,
  start: (current: () => boolean) => Promise<T>,
  late: () => L,
) => Promise<T | L>;

function createFlights<T>(cap: number): Flights<T> {
  // At most `cap` flights are within their time, and they started last, so dropping the oldest when
  // the map is full drops only a flight past its time.
  const flights = new Map<string, { outcome: Promise<T>; until: number }>();
  return async (key, start, late) => {
    const now = Date.now();
    let flight = flights.get(key);
    if (flight === undefined || flight.until <= now) {
      let running = 0;
      for (const other of flights.values()) if (other.until > now) running++;
      if (running >= cap) return late();
      const current = () => flights.get(key) === started;
      const started = { outcome: start(current), until: now + FLIGHT_MS };
      const land = () => {
        if (current()) flights.delete(key);
      };
      started.outcome.then(land, land);
      remember(flights, key, started, CACHE_SIZE);
      flight = started;
    }
    return settled(flight.outcome, flight.until - now, late);
  };
}

/**
 * A shared fetch's outcome, or `late()` once its time is up, since a cancelled fetch never settles.
 * Its sharers then know nothing about the client, so they get no refusal.
 */
function settled<T, L>(outcome: Promise<T>, ms: number, late: () => L): Promise<T | L> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lapsed = new Promise<L>((resolve) => {
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

const PUBLIC: ClientAuthentication = { method: "none" };

/**
 * How a document's client authenticates: with no method or `none`, by PKCE alone; with
 * `private_key_jwt`, also with keys from exactly one of `jwks` and `jwks_uri`. Draft 02 of Client ID
 * Metadata Documents forbids shared secrets, and the server checks nothing else.
 */
function authenticationOf(document: z.infer<typeof Document>): ClientAuthentication | string {
  const method = document.token_endpoint_auth_method;
  if (method === undefined || method === "none") return PUBLIC;
  if (method !== "private_key_jwt") {
    return "its metadata document asks for a token_endpoint_auth_method other than none and private_key_jwt";
  }
  const alg = document.token_endpoint_auth_signing_alg;
  if (alg !== undefined && !isSigningAlg(alg)) {
    return "its metadata document asks for a token_endpoint_auth_signing_alg other than RS256, PS256 or ES256";
  }
  const { jwks, jwks_uri } = document;
  if (jwks !== undefined && jwks_uri !== undefined) {
    return "its metadata document gives both jwks and jwks_uri";
  }
  if (jwks_uri !== undefined) {
    const url = typeof jwks_uri === "string" ? keySetUrl(jwks_uri) : undefined;
    if (url === undefined) {
      return "its metadata document gives a jwks_uri that is not a public https URL";
    }
    return { method, keys: { uri: url.href }, alg };
  }
  if (jwks === undefined) {
    return "its metadata document declares private_key_jwt without jwks or jwks_uri";
  }
  const set = signingKeys(jwks);
  return set === undefined
    ? "its metadata document gives no signing key in jwks"
    : { method, keys: { set }, alg };
}

/** Whether `set` has a key under `kid`. An assertion without a kid may be checked against any key. */
function holds(set: JSONWebKeySet, kid: unknown): boolean {
  return kid === undefined || set.keys.some((key) => key.kid === kid);
}

/** A JWK Set's keys for signatures, which are those without `use` or with `sig`, if it has one. */
function signingKeys(value: unknown): JSONWebKeySet | undefined {
  const parsed = KeySet.safeParse(value);
  if (!parsed.success) return undefined;
  const keys = parsed.data.keys.filter(({ use }) => use === undefined || use === "sig");
  return keys.length === 0 ? undefined : { keys };
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
 * name.
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
  if (!bare(url)) return "its URL carries a port, credentials or a fragment";
  return publicHost(url.hostname) ? url : "its URL does not name a public host";
}

/** A jwks_uri the server may fetch: https on a public name, as for documents. */
function keySetUrl(uri: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return undefined;
  }
  return url.protocol === "https:" && bare(url) && publicHost(url.hostname) ? url : undefined;
}

/** Without a port, credentials or a fragment. */
function bare(url: URL): boolean {
  return url.port === "" && url.username === "" && url.password === "" && url.hash === "";
}

/**
 * IP literals and local names are refused here; a fetch that checks resolved addresses refuses the
 * rest.
 */
function publicHost(host: string): boolean {
  return (
    host.includes(".") &&
    !host.startsWith("[") &&
    !/^[\d.]+$/.test(host) &&
    !/\.(localhost|local|internal|home\.arpa|localdomain)$/.test(host)
  );
}
