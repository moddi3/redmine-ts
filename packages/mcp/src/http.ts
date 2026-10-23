// Streamable HTTP as one web-standard handler, so Node, Bun and Workers serve it unchanged. Each
// request brings its own Redmine API key and gets a fresh server for that key against the one baseUrl
// the handler was made with: a client acts only as its own user, and only on that Redmine.

import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { createRedmine } from "@redmine-ts/sdk";
import type { RedmineConfig } from "@redmine-ts/sdk";
import { createRedmineMcpServer } from "./server.ts";

export const API_KEY_HEADER = "X-Redmine-API-Key";

/** What a browser sends in a preflight, besides the safelisted headers: the MCP transport's and ours. */
const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Accept",
  "MCP-Protocol-Version",
  "Mcp-Method",
  "Mcp-Name",
  API_KEY_HEADER,
].join(", ");

/** Chrome caps the age of a cached preflight at two hours. */
const CORS_MAX_AGE = "7200";

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
 * without an X-Redmine-API-Key header, and checks Host and Origin before that. For an allowed Origin
 * it answers the CORS preflight and adds CORS headers to every response.
 */
export function createRedmineMcpHandler(
  options: RedmineMcpHandlerOptions,
): (request: Request) => Promise<Response> {
  const { allowedOrigins = [], allowedHosts, onError, ...config } = options;
  // A bad baseUrl, version or limit throws here instead of failing every request.
  createRedmine(config);
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
  // fetch below hands the key over as authInfo, so every server the factory builds has one.
  const mcp = createMcpHandler(
    ({ authInfo }) =>
      createRedmineMcpServer({ ...config, auth: { apiKey: authInfo?.token ?? "" } }),
    { onerror: onError },
  );
  return async (request) => {
    const origin = request.headers.get("origin");
    const rejected =
      (hosts && hostHeaderValidationResponse(request, hosts)) ??
      (origin !== null && exactOrigins.has(origin)
        ? undefined
        : originValidationResponse(request, hostnames));
    if (rejected !== undefined) return rejected;
    // Origin is empty or allowed from here on; an empty one is no browser's.
    const cors = origin !== null && origin !== "" ? origin : undefined;
    if (cors !== undefined && isPreflight(request)) return preflight(cors);
    const apiKey = request.headers.get(API_KEY_HEADER)?.trim();
    const response = apiKey
      ? await mcp.fetch(request, { authInfo: { token: apiKey, clientId: "", scopes: [] } })
      : missingKey();
    return cors === undefined ? response : withCors(response, cors);
  };
}

function isPreflight(request: Request): boolean {
  return request.method === "OPTIONS" && request.headers.has("access-control-request-method");
}

/** The endpoint serves POST only. No credentials mode: the key is a header, and there are no cookies. */
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

/** Re-wraps the response over the same body, so an SSE stream still reaches the client event by event. */
function withCors(response: Response, origin: string): Response {
  const wrapped = new Response(response.body, response);
  wrapped.headers.set("Access-Control-Allow-Origin", origin);
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
