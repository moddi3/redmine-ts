// Streamable HTTP as one web-standard handler, so Node, Bun and Workers serve it unchanged. Each
// request brings its own Redmine credential, an API key or an OAuth token, and gets a fresh server for
// it against the one baseUrl the handler was made with: a client acts only as its own user, and only on
// that Redmine.

import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  isJSONRPCRequest,
  OAuthError,
  OAuthErrorCode,
  readRequestBody,
  validateHostHeader,
  validateOriginHeader,
  verifyBearerToken,
} from "@modelcontextprotocol/server";
import type { AuthInfo, OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { createRedmine } from "@redmine-ts/sdk";
import type { Access, RedmineConfig } from "@redmine-ts/sdk";
import { accessFor, scopesFor } from "./oauth/scopes.ts";
import { createAuthorizationServer } from "./oauth/server.ts";
import type { AuthorizationServer, RedmineOAuthOptions } from "./oauth/server.ts";
import { comparablePath, CORS_MAX_AGE, publicDocument, publicPaths } from "./oauth/web.ts";
import type { PublicPaths } from "./oauth/web.ts";
import { createRedmineMcpServer } from "./server.ts";
import { strictest } from "./tools.ts";

export const API_KEY_HEADER = "X-Redmine-API-Key";

/** What a browser sends in a preflight, besides the safelisted headers: the MCP transport's and ours. */
const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Accept",
  "MCP-Protocol-Version",
  "Mcp-Method",
  "Mcp-Name",
  "Authorization",
  API_KEY_HEADER,
].join(", ");

/** What a token stands for, as a verifier resolves it. */
export interface BearerGrant {
  /** The credential the server sends to Redmine for the token's requests. Never the token itself. */
  credential: { bearer: string } | { apiKey: string };
  /**
   * Granted scopes: redmine:read, redmine:write, redmine:delete. Each includes the ones before it,
   * and the highest decides the access mode, capped by the handler's own.
   */
  scopes: readonly string[];
  /** The resource the token was issued for. Anything but the handler's publicUrl is refused. */
  resource: string;
  /** Seconds since the epoch. */
  expiresAt: number;
  clientId: string;
}

/** Accepts bearer tokens from an authorization server. */
export interface BearerVerifier {
  /** The issuer of the authorization server, listed in the protected resource metadata. */
  issuer: string;
  /**
   * The token's grant, or undefined for a token that is forged, expired or not this verifier's. It
   * rejects when it cannot tell, which answers 503.
   */
  verify(token: string): Promise<BearerGrant | undefined>;
}

export interface RedmineMcpHandlerOptions extends Omit<RedmineConfig, "auth"> {
  /**
   * Origins a browser page may call the handler from. An entry is a hostname, matched as the MCP SDK
   * matches it: any scheme and port, or an origin such as `https://app.example.com`, matched exactly.
   * An allowed request gets the CORS headers a browser needs to read the response. Another Origin gets
   * 403. A request without Origin, as non-browser clients send it, passes without CORS headers.
   * Default: none.
   */
  allowedOrigins?: readonly string[];
  /**
   * Hostnames the Host header may name, against DNS rebinding. Set it when listening on loopback, or
   * when you know every name clients reach the handler by.
   */
  allowedHosts?: readonly string[];
  /** Requests the MCP SDK rejects and failures outside a tool result. None of them carries the key. */
  onError?: (error: Error) => void;
  /**
   * The public URL of the MCP endpoint, such as `https://mcp.example.com/mcp` or
   * `https://redmine.example.com/mcp`: the OAuth resource identifier and the audience tokens must
   * name. With it, the handler serves that path and the OAuth paths derived from it, wherever the
   * request comes from, and answers 404 for any other path. Without it, every path is the endpoint.
   * Required with `oauth` and `verifier`, and then https, except on localhost.
   */
  publicUrl?: string;
  /**
   * The built-in OAuth authorization server, which signs people in through Redmine's own OAuth
   * (Redmine 6.1+). It serves its endpoints under publicUrl and accepts the tokens it issues.
   */
  oauth?: RedmineOAuthOptions;
  /**
   * Accepts `Authorization: Bearer` tokens from an authorization server elsewhere, instead of
   * `oauth`. With either, a request with neither a token nor the X-Redmine-API-Key header gets a 401
   * that points clients to the protected resource metadata.
   */
  verifier?: BearerVerifier;
}

/** The credential and access mode one request's server is built with. */
interface RequestAuth {
  auth: BearerGrant["credential"];
  access: Access;
}

const ORIGIN_SCHEME = /^https?:\/\//i;

/** RFC 6750's credentials: the scheme in any case, spaces, one b64token, nothing else. */
const BEARER = /^Bearer +([\w.~+/-]+=*)$/i;

/** An entry of allowedOrigins that names scheme, host and port, as a browser writes an Origin. */
export function isOrigin(value: string): boolean {
  try {
    return ORIGIN_SCHEME.test(value) && new URL(value).origin === value;
  } catch {
    return false;
  }
}

/**
 * A fetch handler for the 2026-07-28 protocol and, statelessly, the 2025 revisions. It answers 401
 * without an X-Redmine-API-Key header or, with a verifier, a valid bearer token, and checks Host and
 * Origin before that. For an allowed Origin it answers the CORS preflight and adds CORS headers to
 * every response.
 */
export function createRedmineMcpHandler(
  options: RedmineMcpHandlerOptions,
): (request: Request) => Promise<Response> {
  const { allowedOrigins = [], allowedHosts, onError, publicUrl, oauth, ...rest } = options;
  const { verifier: external, ...config } = rest;
  // A bad baseUrl, version or limit throws here instead of failing every request.
  createRedmine(config);
  const access = config.access ?? "full";
  if (oauth !== undefined && external !== undefined) {
    throw new TypeError("oauth and verifier exclude each other: use one authorization server");
  }
  const authorizing = oauth !== undefined || external !== undefined;
  const paths =
    publicUrl === undefined ? undefined : publicPaths(resourceUrl(publicUrl, authorizing));
  if (authorizing && paths === undefined) {
    throw new TypeError(
      "oauth and verifier need publicUrl, the URL clients reach the MCP endpoint at",
    );
  }
  const authorizationServer: AuthorizationServer | undefined =
    oauth &&
    paths &&
    createAuthorizationServer(oauth, {
      paths,
      redmineUrl: withSlash(new URL(config.baseUrl)),
      // As in the SDK: Workers refuse a bare fetch called as a method.
      fetch: config.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      version: config.version,
      access,
      onError,
    });
  const verifier = external ?? authorizationServer?.verifier;
  const exactOrigins = new Set(allowedOrigins.filter((entry) => ORIGIN_SCHEME.test(entry)));
  for (const entry of exactOrigins) {
    if (!isOrigin(entry)) {
      throw new TypeError(
        `allowedOrigins entry ${entry} is not an origin: write scheme, host and optional port, such as https://app.example.com`,
      );
    }
  }
  const hostnames = allowedOrigins.filter((entry) => !exactOrigins.has(entry));
  // Pages on the public origin, such as the consent page, are this server's own.
  if (paths !== undefined) exactOrigins.add(paths.origin);
  const hosts = allowedHosts && [...allowedHosts];
  // fetch below hands the credential over in authInfo.extra, so every server the factory builds has one.
  const mcp = createMcpHandler(
    ({ authInfo }) =>
      createRedmineMcpServer({ ...config, ...(authInfo?.extra?.redmine as RequestAuth) }),
    { onerror: onError },
  );
  const bearer =
    paths === undefined || verifier === undefined
      ? undefined
      : bearerGate(verifier, paths, access, onError);

  async function endpoint(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    const checked =
      origin !== null && exactOrigins.has(origin)
        ? undefined
        : validateOriginHeader(origin, hostnames);
    if (checked?.ok === false) return refuse(request, 403, checked.message);
    // Origin is empty or allowed from here on; an empty one is no browser's.
    const cors = origin !== null && origin !== "" ? origin : undefined;
    if (cors !== undefined && isPreflight(request)) return preflight(cors);
    const apiKey = request.headers.get(API_KEY_HEADER)?.trim();
    let response: Response;
    if (apiKey) {
      const redmine: RequestAuth = { auth: { apiKey }, access };
      response = await mcp.fetch(request, {
        authInfo: { token: apiKey, clientId: "", scopes: [], extra: { redmine } },
      });
    } else if (bearer === undefined) {
      response = await missingKey(request);
    } else {
      const authInfo = await bearer.authenticate(request);
      response = authInfo instanceof Response ? authInfo : await mcp.fetch(request, { authInfo });
    }
    return cors === undefined ? response : withCors(response, cors);
  }

  return async (request) => {
    const host = hosts && validateHostHeader(request.headers.get("host"), hosts);
    if (host?.ok === false) return refuse(request, 403, host.message);
    if (paths === undefined) return endpoint(request);
    // Only the path counts: behind a proxy, the URL's origin is the server's, not the public one.
    const path = comparablePath(new URL(request.url).pathname);
    if (path === paths.endpoint) return endpoint(request);
    if (bearer !== undefined && paths.resourceMetadata.includes(path)) {
      return publicDocument(request, bearer.metadata);
    }
    return (
      (await authorizationServer?.serve(request, path)) ??
      new Response("Not Found", { status: 404 })
    );
  };
}

/** publicUrl as a URL, refused when created rather than misrouting every request. */
function resourceUrl(publicUrl: string, oauth: boolean): URL {
  const problem = publicUrlProblem(publicUrl, oauth);
  if (problem !== undefined) throw new TypeError(`publicUrl ${problem}`);
  return new URL(publicUrl);
}

/** Why `publicUrl` cannot name the MCP endpoint, or undefined. The CLI checks with it too. */
export function publicUrlProblem(publicUrl: string, oauth: boolean): string | undefined {
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    return "is not a URL";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "must be an http or https URL";
  if (url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "") {
    return "must not carry a query, a fragment or credentials";
  }
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (oauth && url.protocol !== "https:" && !localhost) {
    return "must be https for OAuth, except on localhost";
  }
  // The metadata advertises this exact string as the resource, which clients compare as written.
  const canonical = publicPaths(url).identifier;
  if (publicUrl !== canonical) return `must be written as ${canonical}`;
  return undefined;
}

function withSlash(url: URL): URL {
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

/**
 * The resource server half of OAuth: the protected resource metadata, and a check that turns a
 * request's bearer token into the credential and mode its server is built with.
 */
function bearerGate(
  verifier: BearerVerifier,
  paths: PublicPaths,
  access: Access,
  onError: ((error: Error) => void) | undefined,
) {
  const resource = new URL(paths.identifier);
  const resourceMetadataUrl = paths.origin + paths.resourceMetadata.at(-1)!;
  const scopes = scopesFor(access);
  const tokens: OAuthTokenVerifier = {
    async verifyAccessToken(token) {
      const grant = await verifier.verify(token);
      if (grant === undefined) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "The token is invalid or has expired");
      }
      const granted = accessFor(grant.scopes);
      const redmine: RequestAuth | undefined = granted && {
        auth: grant.credential,
        access: strictest(access, granted),
      };
      return {
        token,
        clientId: grant.clientId,
        scopes: [...grant.scopes],
        expiresAt: grant.expiresAt,
        resource: new URL(grant.resource),
        ...(redmine === undefined ? {} : { extra: { redmine } }),
      };
    },
  };
  // Without any credential, the challenge names no error, as RFC 6750 asks.
  const missing = `Bearer resource_metadata="${resourceMetadataUrl}", scope="${scopes.join(" ")}"`;
  return {
    metadata: {
      resource: paths.identifier,
      authorization_servers: [verifier.issuer],
      scopes_supported: scopes,
      bearer_methods_supported: ["header"],
      resource_name: "Redmine",
    },
    async authenticate(request: Request): Promise<AuthInfo | Response> {
      const authorization = request.headers.get("authorization");
      if (authorization === null) {
        return Response.json(
          {
            error: OAuthErrorCode.InvalidToken,
            error_description: `Sign in with OAuth, or send the API key of a Redmine user in the ${API_KEY_HEADER} header.`,
          },
          { status: 401, headers: { "WWW-Authenticate": missing } },
        );
      }
      const challenge = { requiredScopes: scopes, resourceMetadataUrl };
      // One Bearer credential and nothing after it; the SDK's parser ignores trailing fields.
      const token = BEARER.exec(authorization)?.[1];
      if (token === undefined) {
        const malformed = new OAuthError(
          OAuthErrorCode.InvalidToken,
          "Send one token as Authorization: Bearer <token>",
        );
        return bearerAuthChallengeResponse(malformed, challenge);
      }
      try {
        const authInfo = await verifyBearerToken(`Bearer ${token}`, {
          verifier: tokens,
          expectedResource: resource,
          resourceMetadataUrl,
        });
        if (authInfo.extra !== undefined) return authInfo;
        const insufficient = new OAuthError(
          OAuthErrorCode.InsufficientScope,
          `The token grants none of ${scopes.join(", ")}`,
        );
        return bearerAuthChallengeResponse(insufficient, challenge);
      } catch (error) {
        if (error instanceof OAuthError) return bearerAuthChallengeResponse(error, challenge);
        // The verifier could not tell, such as when a grant store is down: closed, and retryable.
        onError?.(error instanceof Error ? error : new Error(String(error)));
        return Response.json(
          {
            error: "temporarily_unavailable",
            error_description: "Tokens cannot be checked right now. Try again in a moment.",
          },
          { status: 503 },
        );
      }
    },
  };
}

function isPreflight(request: Request): boolean {
  return request.method === "OPTIONS" && request.headers.has("access-control-request-method");
}

/** The endpoint serves POST only. No credentials mode: the key and the token are headers, not cookies. */
function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
      "Access-Control-Max-Age": CORS_MAX_AGE,
      Vary: "Origin",
    },
  });
}

/**
 * Re-wraps the response over the same body, so an SSE stream still reaches the client event by event.
 * A page reads WWW-Authenticate to find the authorization server.
 */
function withCors(response: Response, origin: string): Response {
  const wrapped = new Response(response.body, response);
  wrapped.headers.set("Access-Control-Allow-Origin", origin);
  wrapped.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
  wrapped.headers.append("Vary", "Origin");
  return wrapped;
}

const ID_BODY_LIMIT = 64 * 1024;
const ID_BODY_WAIT_MS = 1000;

async function requestId(request: Request): Promise<string | number | null> {
  const length = Number(request.headers.get("content-length"));
  if (!(length > 0 && length <= ID_BODY_LIMIT)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ID_BODY_WAIT_MS);
  });
  try {
    const body = await Promise.race([readRequestBody(request, ID_BODY_LIMIT), late]);
    if (body === null || body.tooLarge) return null;
    const message: unknown = JSON.parse(body.text);
    return isJSONRPCRequest(message) ? message.id : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function refuse(request: Request, status: number, message: string): Promise<Response> {
  const id = await requestId(request);
  return Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id }, { status });
}

/** No WWW-Authenticate: no scheme names a custom header, and a Bearer challenge sends clients to OAuth. */
function missingKey(request: Request): Promise<Response> {
  return refuse(
    request,
    401,
    `Send the API key of a Redmine user in the ${API_KEY_HEADER} header. Redmine shows it under My account, API access key.`,
  );
}
