import {
  Client,
  InsufficientScopeError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type { AuthProvider } from "@modelcontextprotocol/client";
import { Server } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { createRedmineMcpHandler } from "../../src/index.ts";
import type { BearerGrant, BearerVerifier, RedmineMcpHandlerOptions } from "../../src/index.ts";
import { texts } from "../connect.ts";

type Handler = (request: Request) => Promise<Response>;

const publicUrl = "https://redmine.example.com/redmine/mcp";
const ALL = ["redmine:read", "redmine:write", "redmine:delete"];
const now = () => Math.floor(Date.now() / 1000);
const signedIn = (credential: BearerGrant["credential"], scopes: string[]): BearerGrant => ({
  credential,
  scopes,
  resource: publicUrl,
  expiresAt: now() + 600,
  clientId: "client",
});
const grants: Record<string, BearerGrant> = {
  alice: signedIn({ bearer: "redmine-token-of-alice" }, ["redmine:write"]),
  reader: signedIn({ bearer: "redmine-token-of-reader" }, ["redmine:read"]),
  revoked: signedIn({ bearer: "dead" }, ALL),
  resetkey: signedIn({ apiKey: "reset-key" }, ALL),
  "write-applied": signedIn({ bearer: "write-applied" }, ALL),
  "write-failed": signedIn({ bearer: "write-failed" }, ALL),
  "write-unanswered": signedIn({ bearer: "write-unanswered" }, ALL),
};
const verifier: BearerVerifier = {
  issuer: "https://auth.example.com",
  verify: async (token) => grants[token],
};
const revokedChallenge = `Bearer error="invalid_token", error_description="Redmine no longer accepts this sign-in. Sign in again.", scope="redmine:read redmine:write redmine:delete", resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`;
const scopeChallenge = (scopes: string, needed: string) =>
  `Bearer error="insufficient_scope", error_description="This request needs ${needed}, which the sign-in did not grant. Sign in again and allow it.", scope="${scopes}", resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`;

/**
 * A Redmine that answers a few milliseconds late, as a real one does, so a 2025-era tool call ends
 * after the SDK has returned its event stream. It names a status after the bearer token, creates any
 * issue and answers 403 for time entries. It refuses the revoked and resetkey credentials, and every
 * request of a write-* credential except its issue creation, which Redmine applies, fails with 503,
 * or never answers.
 */
function fakeRedmine() {
  const seen: (string | null)[] = [];
  const requests: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const request = new Request(input, init);
    const authorization = request.headers.get("authorization");
    const path = new URL(request.url).pathname;
    seen.push(authorization);
    requests.push(`${request.method} ${path}`);
    if (
      authorization === "Bearer dead" ||
      request.headers.get("x-redmine-api-key") === "reset-key"
    ) {
      return new Response(null, { status: 401 });
    }
    if (request.method === "POST" && path === "/issues.json") {
      if (authorization === "Bearer write-failed") return new Response(null, { status: 503 });
      if (authorization === "Bearer write-unanswered") throw new TypeError("fetch failed");
      return Response.json({ issue: { id: 9, subject: "x" } }, { status: 201 });
    }
    if (authorization?.startsWith("Bearer write-")) return new Response(null, { status: 401 });
    if (path === "/time_entries.json") return new Response(null, { status: 403 });
    return Response.json({
      issue_statuses: [{ id: 1, name: `New for ${authorization}`, is_closed: false }],
    });
  };
  return { fetch, seen, requests };
}

function gated(options: Partial<RedmineMcpHandlerOptions> = {}) {
  const redmine = fakeRedmine();
  const errors: Error[] = [];
  const handle = createRedmineMcpHandler({
    baseUrl: "http://redmine.test",
    fetch: redmine.fetch,
    publicUrl,
    verifier,
    onError: (error) => errors.push(error),
    ...options,
  });
  const send = (headers: Record<string, string>, body: unknown) =>
    handle(
      new Request("http://127.0.0.1:3737/redmine/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  return { handle, send, errors, seen: redmine.seen, requests: redmine.requests };
}

const tool = (id: number, name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

/** A 2026-07-28 request: the envelope in `_meta`, and the headers that name its method and tool. */
const modern = (method: string, params: Record<string, unknown>) => ({
  headers: {
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": method,
    ...(typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
  },
  body: {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "redmine-mcp-tests", version: "0.0.0" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  },
});

/** The official client on `era`, signed in through `authProvider`, and every response it got. */
async function bearerClient(
  handle: Handler,
  era: "legacy" | "modern",
  authProvider: AuthProvider,
): Promise<{ client: Client; responses: Response[] }> {
  const responses: Response[] = [];
  const client = new Client(
    { name: "redmine-mcp-tests", version: "0.0.0" },
    era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {},
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(publicUrl), {
      authProvider,
      fetch: async (input, init) => {
        const response = await handle(new Request(input, init));
        responses.push(response.clone());
        return response;
      },
    }),
  );
  return { client, responses };
}

describe("a bearer request Redmine refuses", () => {
  it.each(["legacy", "modern"] as const)(
    "answers 401 invalid_token to a %s-era call",
    async (era) => {
      const { handle, seen, errors } = gated();
      const { client, responses } = await bearerClient(handle, era, {
        token: async () => "revoked",
      });
      await expect(
        client.callTool({ name: "issue_statuses_list", arguments: {} }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      const refused = responses.at(-1)!;
      expect(refused.status).toBe(401);
      expect(refused.headers.get("www-authenticate")).toBe(revokedChallenge);
      const body = await refused.text();
      expect(JSON.parse(body)).toEqual({
        error: "invalid_token",
        error_description: "Redmine no longer accepts this sign-in. Sign in again.",
      });
      expect(body).not.toMatch(/revoked|dead/);
      expect(seen).toEqual(["Bearer dead"]);
      expect(errors).toEqual([]);
    },
  );

  it.each(["legacy", "modern"] as const)(
    "lets a %s-era client refresh after the 401 and retry the call",
    async (era) => {
      const { handle, seen } = gated();
      let token = "revoked";
      let refreshed = 0;
      const { client } = await bearerClient(handle, era, {
        token: async () => token,
        onUnauthorized: async () => {
          refreshed++;
          token = "alice";
        },
      });
      const result = await client.callTool({ name: "issue_statuses_list", arguments: {} });
      expect(refreshed).toBe(1);
      expect(result.isError).toBeUndefined();
      expect(texts(result)[0]).toContain("New for Bearer redmine-token-of-alice");
      expect(seen).toEqual(["Bearer dead", "Bearer redmine-token-of-alice"]);
    },
  );

  it("answers 401 invalid_token when the API key behind an API-key sign-in was reset", async () => {
    const { send, seen } = gated();
    const response = await send(
      { Authorization: "Bearer resetkey" },
      tool(1, "issue_statuses_list"),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(revokedChallenge);
    expect(seen).toEqual([null]);
  });

  it("answers 401 invalid_token to resources/read", async () => {
    const { send } = gated();
    const response = await send(
      { Authorization: "Bearer revoked" },
      { jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "redmine://issues/1" } },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(revokedChallenge);
  });

  it("answers 401 invalid_token to a write Redmine refused, since it applied nothing", async () => {
    const { send, requests } = gated();
    const response = await send(
      { Authorization: "Bearer revoked" },
      tool(1, "issues_create", { project_id: 1, subject: "x" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(revokedChallenge);
    expect(requests).toEqual(["POST /issues.json"]);
  });

  it.each([
    ["applied", "write-applied"],
    ["failed with 503", "write-failed"],
    ["got no answer to", "write-unanswered"],
  ])(
    "keeps the results of a request whose write Redmine %s before it refused a read",
    async (_, token) => {
      const { send, requests } = gated();
      const response = await send(
        { Authorization: `Bearer ${token}`, "MCP-Protocol-Version": "2025-03-26" },
        [tool(1, "issues_create", { project_id: 1, subject: "x" }), tool(2, "issue_statuses_list")],
      );
      expect(response.status).toBe(200);
      expect(response.headers.has("www-authenticate")).toBe(false);
      const text = await response.text();
      expect(text).toContain('"id":1');
      expect(text).toContain('"id":2');
      expect(requests).toContain("POST /issues.json");
      expect(requests).toContain("GET /issue_statuses.json");
    },
  );

  it("adds CORS to the 401, so a page can read the challenge", async () => {
    const { send } = gated({ allowedOrigins: ["https://app.example.com"] });
    const response = await send(
      { Authorization: "Bearer revoked", Origin: "https://app.example.com" },
      tool(1, "issue_statuses_list"),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(response.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
  });

  it("keeps Redmine's 403 a tool error: a token cannot grant what Redmine forbids", async () => {
    const { send } = gated();
    const response = await send({ Authorization: "Bearer alice" }, tool(1, "time_entries_list"));
    expect(response.status).toBe(200);
    expect(response.headers.has("www-authenticate")).toBe(false);
    expect(await response.text()).toContain("Redmine answered 403 for time_entries_list");
  });
});

describe("a bearer call beyond the token's scope", () => {
  it.each([
    ["reader", "issues_delete", { issue_id: 1 }, "redmine:delete"],
    ["alice", "issues_delete", { issue_id: 1 }, "redmine:delete"],
    ["reader", "raw_request", { method: "POST", path: "issues.json", body: {} }, "redmine:write"],
    ["alice", "raw_request", { method: "DELETE", path: "issues/1.json" }, "redmine:delete"],
  ])("answers 403 insufficient_scope when %s calls %s %j", async (token, name, args, needed) => {
    const { send, requests } = gated();
    const response = await send({ Authorization: `Bearer ${token}` }, tool(1, name, args));
    expect(response.status).toBe(403);
    const scopes = ALL.slice(0, ALL.indexOf(needed) + 1).join(" ");
    expect(response.headers.get("www-authenticate")).toBe(scopeChallenge(scopes, needed));
    expect(await response.json()).toEqual({
      error: "insufficient_scope",
      error_description: `This request needs ${needed}, which the sign-in did not grant. Sign in again and allow it.`,
    });
    expect(requests).toEqual([]);
  });

  it("makes a 2026-07-28 client step up from a raw_request its scope does not allow", async () => {
    const { handle, requests } = gated();
    const { client, responses } = await bearerClient(handle, "modern", {
      token: async () => "reader",
    });
    await expect(
      client.callTool({
        name: "raw_request",
        arguments: { method: "POST", path: "issues.json", body: {} },
      }),
    ).rejects.toBeInstanceOf(InsufficientScopeError);
    expect(responses.at(-1)!.status).toBe(403);
    expect(responses.at(-1)!.headers.get("www-authenticate")).toContain(
      'scope="redmine:read redmine:write"',
    );
    expect(requests).toEqual([]);
  });

  it("serves a call within the token's scope", async () => {
    const { send, requests } = gated();
    const response = await send(
      { Authorization: "Bearer reader" },
      tool(1, "raw_request", { method: "GET", path: "issue_statuses.json" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.has("www-authenticate")).toBe(false);
    expect((await response.text()).match(/^data: /gm)).toHaveLength(1);
    expect(requests).toEqual(["GET /issue_statuses.json"]);
  });

  it("challenges only for scopes the server's own mode grants", async () => {
    const { send, requests } = gated({ access: "no-delete" });
    const deleted = await send(
      { Authorization: "Bearer reader" },
      tool(1, "issues_delete", { issue_id: 1 }),
    );
    expect(deleted.status).toBe(200);
    expect(deleted.headers.has("www-authenticate")).toBe(false);
    expect(await deleted.text()).toContain('"isError":true');
    const posted = await send(
      { Authorization: "Bearer reader" },
      tool(2, "raw_request", { method: "POST", path: "issues.json", body: {} }),
    );
    expect(posted.status).toBe(403);
    expect(posted.headers.get("www-authenticate")).toBe(
      scopeChallenge("redmine:read redmine:write", "redmine:write"),
    );
    expect(requests).toEqual([]);
  });

  it("names the mode the token set, not the server's, when the server refuses too", async () => {
    const { send } = gated({ access: "no-delete" });
    const deleted = await send(
      { Authorization: "Bearer reader" },
      tool(1, "issues_delete", { issue_id: 1 }),
    );
    expect(await deleted.text()).toContain('which the \\"read-only\\" access mode refuses');
  });

  it("keeps a call the server's own mode refuses a tool error", async () => {
    const { send, requests } = gated({ access: "read-only" });
    const response = await send(
      { Authorization: "Bearer alice" },
      tool(1, "raw_request", { method: "POST", path: "issues.json", body: {} }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.has("www-authenticate")).toBe(false);
    expect(await response.text()).toContain('"isError":true');
    expect(requests).toEqual([]);
  });

  it("answers 403 for a 2025-03-26 batch that ran only reads before the refusal", async () => {
    const { send, requests } = gated();
    const response = await send(
      { Authorization: "Bearer reader", "MCP-Protocol-Version": "2025-03-26" },
      [tool(1, "issue_statuses_list"), tool(2, "issues_delete", { issue_id: 1 })],
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBe(
      scopeChallenge(ALL.join(" "), "redmine:delete"),
    );
    expect(requests).toEqual(["GET /issue_statuses.json"]);
  });

  it("keeps the results of a batch whose write Redmine applied next to a refusal", async () => {
    const { send, requests } = gated();
    const response = await send(
      { Authorization: "Bearer alice", "MCP-Protocol-Version": "2025-03-26" },
      [
        tool(1, "issues_create", { project_id: 1, subject: "x" }),
        tool(2, "issues_delete", { issue_id: 1 }),
      ],
    );
    expect(response.status).toBe(200);
    expect(response.headers.has("www-authenticate")).toBe(false);
    const text = await response.text();
    expect(text).toContain('"id":1');
    expect(text).toContain('"id":2');
    expect(requests).toEqual(["POST /issues.json"]);
  });
});

describe("a bearer subscriptions/listen", () => {
  const listen = modern("subscriptions/listen", { notifications: { toolsListChanged: true } });

  it("ends at once on this server, which honors no listen filter", async () => {
    const { send } = gated();
    const response = await send({ ...listen.headers, Authorization: "Bearer alice" }, listen.body);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("notifications/subscriptions/acknowledged");
    expect(text).toContain('"resultType":"complete"');
  }, 2000);

  it("is passed on as a stream that stays open when the server honors the filter", async () => {
    const honoring = vi
      .spyOn(Server.prototype, "getCapabilities")
      .mockReturnValue({ tools: { listChanged: true } });
    try {
      const { send } = gated();
      const response = await send(
        { ...listen.headers, Authorization: "Bearer alice" },
        listen.body,
      );
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      expect(first).toContain("notifications/subscriptions/acknowledged");
      const next = await Promise.race([
        reader.read().then(() => "more"),
        new Promise((resolve) => setTimeout(() => resolve("still open"), 100)),
      ]);
      expect(next).toBe("still open");
      await reader.cancel();
    } finally {
      honoring.mockRestore();
    }
  }, 2000);
});
