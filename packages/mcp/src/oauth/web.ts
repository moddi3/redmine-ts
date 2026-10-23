import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/server";

// Responses the OAuth paths share. Their documents and endpoints carry no ambient credentials, no
// cookie and no key, so any origin may read them, as the MCP SDK serves its own metadata.

/** Chrome caps the age of a cached preflight at two hours. */
export const CORS_MAX_AGE = "7200";

/** A preflight for a path any origin may call, allowing whatever headers it asks for. */
export function openPreflight(request: Request, methods: string): Response {
  const requested = request.headers.get("access-control-request-headers");
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      ...(requested === null ? {} : { "Access-Control-Allow-Headers": requested }),
      "Access-Control-Max-Age": CORS_MAX_AGE,
    },
  });
}

export function methodNotAllowed(methods: string): Response {
  return new Response(null, { status: 405, headers: { Allow: methods } });
}

/** A metadata document: GET and HEAD, readable from any origin. */
export function publicDocument(request: Request, body: unknown): Response {
  if (request.method === "OPTIONS") return openPreflight(request, "GET, HEAD");
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD");
  const response = Response.json(body, { headers: { "Access-Control-Allow-Origin": "*" } });
  return request.method === "HEAD" ? new Response(null, response) : response;
}

/** The body as text, or undefined when it is over `maxBytes`, which is then not read further. */
export async function readText(
  message: Request | Response,
  maxBytes: number,
): Promise<string | undefined> {
  if (Number(message.headers.get("content-length")) > maxBytes) {
    await message.body?.cancel();
    return undefined;
  }
  if (message.body === null) return "";
  const reader = message.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** A path without its trailing slash, so /mcp/ is /mcp, and the root stays /. */
export function comparablePath(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export interface PublicPaths {
  /** The resource identifier, the audience of tokens, and the issuer of the built-in server. */
  identifier: string;
  origin: string;
  endpoint: string;
  /**
   * The protected resource metadata: RFC 9728's path-inserted URL at the origin's root, and the same
   * document inside the mount, which the 401 challenge names so that it works without the root.
   */
  resourceMetadata: readonly string[];
  /**
   * The authorization server metadata of an issuer with a path, at every URL the 2026-07-28 spec has
   * clients try: RFC 8414's path-inserted one, then OpenID Connect's path-inserted and path-appended
   * ones.
   */
  authorizationServerMetadata: readonly string[];
  authorize: string;
  callback: string;
  token: string;
  register: string;
}

/**
 * Every path the handler serves, derived from the public URL of the MCP endpoint and never from Host
 * or X-Forwarded headers. Apart from the root well-known documents, all of them live under the
 * endpoint's own path, so a proxy forwards that path and the well-known ones, and the handler never
 * claims the rest of an origin it may share with Redmine.
 */
export function publicPaths(publicUrl: URL): PublicPaths {
  const path = comparablePath(publicUrl.pathname);
  const base = path === "/" ? "" : path;
  return {
    identifier: publicUrl.origin + base,
    origin: publicUrl.origin,
    endpoint: base || "/",
    resourceMetadata: [
      new URL(getOAuthProtectedResourceMetadataUrl(publicUrl)).pathname,
      `${base}/.well-known/oauth-protected-resource`,
    ],
    authorizationServerMetadata: [
      `/.well-known/oauth-authorization-server${base}`,
      `/.well-known/openid-configuration${base}`,
      `${base}/.well-known/openid-configuration`,
    ],
    authorize: `${base}/oauth/authorize`,
    callback: `${base}/oauth/redmine/callback`,
    token: `${base}/oauth/token`,
    register: `${base}/oauth/register`,
  };
}
