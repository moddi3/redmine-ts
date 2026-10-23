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
