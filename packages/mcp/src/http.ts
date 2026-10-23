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

export interface RedmineMcpHandlerOptions extends Omit<RedmineConfig, "auth"> {
  /**
   * Hostnames a browser's Origin may carry, matched as the MCP SDK matches them: by hostname, with any
   * scheme and port. Another Origin gets 403. A request without Origin, as non-browser clients send it,
   * passes. Default: none.
   */
  allowedOrigins?: readonly string[];
  /** Hostnames the Host header may name, against DNS rebinding. Set it when listening on loopback. */
  allowedHosts?: readonly string[];
  /** Requests the MCP SDK rejects and failures outside a tool result. None of them carries the key. */
  onError?: (error: Error) => void;
}

/**
 * A fetch handler for the 2026-07-28 protocol and, statelessly, the 2025 revisions. It answers 401
 * without an X-Redmine-API-Key header, and checks Host and Origin before that.
 */
export function createRedmineMcpHandler(
  options: RedmineMcpHandlerOptions,
): (request: Request) => Promise<Response> {
  const { allowedOrigins = [], allowedHosts, onError, ...config } = options;
  // A bad baseUrl, version or limit throws here instead of failing every request.
  createRedmine(config);
  const origins = [...allowedOrigins];
  const hosts = allowedHosts && [...allowedHosts];
  // fetch below hands the key over as authInfo, so every server the factory builds has one.
  const mcp = createMcpHandler(
    ({ authInfo }) =>
      createRedmineMcpServer({ ...config, auth: { apiKey: authInfo?.token ?? "" } }),
    { onerror: onError },
  );
  return async (request) => {
    const rejected =
      (hosts && hostHeaderValidationResponse(request, hosts)) ??
      originValidationResponse(request, origins);
    if (rejected !== undefined) return rejected;
    const apiKey = request.headers.get(API_KEY_HEADER)?.trim();
    if (!apiKey) return missingKey();
    return mcp.fetch(request, { authInfo: { token: apiKey, clientId: "", scopes: [] } });
  };
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
