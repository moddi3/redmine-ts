// Streamable HTTP as one web-standard handler, so Node, Bun and Workers serve it unchanged. Each
// request brings its own Redmine credential, an API key or an OAuth token, and gets a fresh server for
// it against the one baseUrl the handler was made with: a client acts only as its own user, and only on
// that Redmine.

import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  OAuthError,
  OAuthErrorCode,
  originValidationResponse,
  verifyBearerToken,
} from "@modelcontextprotocol/server";
import type { AuthInfo, OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { createRedmine } from "@redmine-ts/sdk";
import type { Access, RedmineConfig } from "@redmine-ts/sdk";
import { accessFor, scopesFor } from "./oauth/scopes.ts";
import { CORS_MAX_AGE, publicDocument } from "./oauth/web.ts";
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
  /** The token's grant, or undefined for a token that is forged, expired or not this verifier's. */
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
  /** Hostnames the Host header may name, against DNS rebinding. Set it when listening on loopback. */
  allowedHosts?: readonly string[];
  /** Requests the MCP SDK rejects and failures outside a tool result. None of them carries the key. */
  onError?: (error: Error) => void;
  /**
   * The public URL of the MCP endpoint, such as `https://mcp.example.com/mcp` or
   * `https://redmine.example.com/mcp`: the OAuth resource identifier and the audience tokens must
   * name. With it, the handler serves that path and the OAuth paths derived from it, wherever the
   * request comes from, and answers 404 for any other path. Without it, every path is the endpoint.
   * Required with `verifier`, and then https, except on localhost.
   */
  publicUrl?: string;
  /**
   * Accepts `Authorization: Bearer` tokens next to the X-Redmine-API-Key header, and answers a
   * request with neither with a 401 that points clients to the protected resource metadata.
   */
  verifier?: BearerVerifier;
}

/** The credential and access mode one request's server is built with. */
interface RequestAuth {
  auth: BearerGrant["credential"];
  access: Access;
}

const ORIGIN_SCHEME = /^https?:\/\//i;

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
  const { allowedOrigins = [], allowedHosts, onError, publicUrl, verifier, ...config } = options;
  // A bad baseUrl, version or limit throws here instead of failing every request.
  createRedmine(config);
  const access = config.access ?? "full";
  const resource =
    publicUrl === undefined ? undefined : resourceUrl(publicUrl, verifier !== undefined);
  if (verifier !== undefined && resource === undefined) {
    throw new TypeError("verifier needs publicUrl, the URL clients reach the MCP endpoint at");
  }
  const exactOrigins = new Set(allowedOrigins.filter((entry) => ORIGIN_SCHEME.test(entry)));
  for (const entry of exactOrigins) {
    if (!isOrigin(entry)) {
      throw new TypeError(
        `allowedOrigins entry ${entry} is not an origin: write scheme, host and optional port, such as https://app.example.com`,
      );
    }
  }
  const hostnames = allowedOrigins.filter((entry) => !exactOrigins.has(entry));
  const hosts = allowedHosts && [...allowedHosts];
  // fetch below hands the credential over in authInfo.extra, so every server the factory builds has one.
  const mcp = createMcpHandler(
    ({ authInfo }) =>
      createRedmineMcpServer({ ...config, ...(authInfo?.extra?.redmine as RequestAuth) }),
    { onerror: onError },
  );
  const bearer =
    resource === undefined || verifier === undefined
      ? undefined
      : bearerGate(verifier, resource, access, onError);
  const routes = resource && {
    endpoint: comparablePath(resource.pathname),
    resourceMetadata: new URL(getOAuthProtectedResourceMetadataUrl(resource)).pathname,
  };

  async function endpoint(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    const rejected =
      origin !== null && exactOrigins.has(origin)
        ? undefined
        : originValidationResponse(request, hostnames);
    if (rejected !== undefined) return rejected;
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
      response = missingKey();
    } else {
      const authInfo = await bearer.authenticate(request);
      response = authInfo instanceof Response ? authInfo : await mcp.fetch(request, { authInfo });
    }
    return cors === undefined ? response : withCors(response, cors);
  }

  return async (request) => {
    const rejected = hosts && hostHeaderValidationResponse(request, hosts);
    if (rejected !== undefined) return rejected;
    if (routes === undefined) return endpoint(request);
    const path = comparablePath(new URL(request.url).pathname);
    if (path === routes.endpoint) return endpoint(request);
    if (bearer !== undefined && path === routes.resourceMetadata) {
      return publicDocument(request, bearer.metadata);
    }
    return new Response("Not Found", { status: 404 });
  };
}

/** publicUrl as a URL, refused when created rather than misrouting every request. */
function resourceUrl(publicUrl: string, oauth: boolean): URL {
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    throw new TypeError("publicUrl is not a URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("publicUrl must be an http or https URL");
  }
  if (url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "") {
    throw new TypeError("publicUrl must not carry a query, a fragment or credentials");
  }
  if (oauth && url.protocol !== "https:" && !isLocalhost(url)) {
    throw new TypeError("publicUrl must be https for OAuth, except on localhost");
  }
  return url;
}

function isLocalhost(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/** A path without its trailing slash, so /mcp/ is /mcp, and the root stays /. */
function comparablePath(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * The resource server half of OAuth: the protected resource metadata, and a check that turns a
 * request's bearer token into the credential and mode its server is built with.
 */
function bearerGate(
  verifier: BearerVerifier,
  resource: URL,
  access: Access,
  onError: ((error: Error) => void) | undefined,
) {
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
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
      resource: resource.href,
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
      try {
        const authInfo = await verifyBearerToken(authorization, {
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
        if (!(error instanceof OAuthError)) {
          onError?.(error instanceof Error ? error : new Error(String(error)));
        }
        return bearerAuthChallengeResponse(error, challenge);
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

/** No WWW-Authenticate: no scheme names a custom header, and a Bearer challenge sends clients to OAuth. */
function missingKey(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `Send the API key of a Redmine user in the ${API_KEY_HEADER} header. Redmine shows it under My account, API access key.`,
      },
      id: null,
    },
    { status: 401 },
  );
}
