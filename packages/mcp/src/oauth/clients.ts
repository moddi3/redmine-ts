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
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

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
  client_name: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
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
  /** The client a client_id names, or why it is refused. */
  resolve(clientId: string): Promise<Client | string>;
  /** Dynamic Client Registration (RFC 7591) for clients without a metadata document. */
  register(metadata: unknown): Promise<Registered>;
}

export function createClients({ sealer, fetch, allowedHosts }: ClientsOptions): Clients {
  const documents = new Map<string, { client: Client; until: number }>();
  const admitted = (host: string) => allowedHosts === undefined || allowedHosts.includes(host);

  async function fetchDocument(clientId: string): Promise<Client | string> {
    const url = documentUrl(clientId);
    if (typeof url === "string") return url;
    if (!admitted(url.hostname)) return `${url.hostname} is not an allowed client host`;
    const cached = documents.get(clientId);
    if (cached !== undefined && cached.until > Date.now()) return cached.client;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
      });
    } catch {
      return "its metadata document could not be fetched";
    }
    // The status is not repeated: it would tell the caller what answers where the URL points.
    if (response.status !== 200) {
      await response.body?.cancel();
      return "its metadata document could not be fetched";
    }
    const text = await readText(response, DOCUMENT_MAX_BYTES);
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
    const client: Client = {
      id: clientId,
      name: parsed.client_name,
      documentHost: url.hostname,
      redirectUris: parsed.redirect_uris,
    };
    if (documents.size >= DOCUMENT_CACHE_SIZE) documents.delete(documents.keys().next().value!);
    documents.set(clientId, { client, until: Date.now() + DOCUMENT_CACHE_MS });
    return client;
  }

  return {
    async resolve(clientId: string): Promise<Client | string> {
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
      if (!publicClient(token_endpoint_auth_method)) {
        return {
          ok: false,
          error: "invalid_client_metadata",
          description:
            "This server registers public clients only: token_endpoint_auth_method must be none",
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

/** No method, or `none`: the client proves itself with PKCE alone. */
function publicClient(method: string | undefined): boolean {
  return method === undefined || method === "none";
}

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
