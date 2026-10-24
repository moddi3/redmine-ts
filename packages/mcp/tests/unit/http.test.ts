import { readFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vite-plus/test";
import { createRedmineMcpHandler } from "../../src/index.ts";
import type { BearerGrant, BearerVerifier, RedmineMcpHandlerOptions } from "../../src/index.ts";
import { texts } from "../connect.ts";

type Handler = (request: Request) => Promise<Response>;

/** A Redmine that knows two keys, records the key each request carried, and names a status after it. */
function fakeRedmine() {
  const keys: (string | null)[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const key = request.headers.get("x-redmine-api-key");
    keys.push(key);
    if (key !== "alice-key" && key !== "bob-key") return new Response(null, { status: 401 });
    if (new URL(request.url).pathname === "/issue_statuses.json") {
      return Response.json({
        issue_statuses: [{ id: 1, name: `New for ${key}`, is_closed: false, description: null }],
      });
    }
    return Response.json({}, { status: 404 });
  };
  return { fetch, keys };
}

function handler(options: Partial<RedmineMcpHandlerOptions> = {}) {
  const redmine = fakeRedmine();
  const errors: Error[] = [];
  const handle = createRedmineMcpHandler({
    baseUrl: "http://redmine.test",
    fetch: redmine.fetch,
    onError: (error) => errors.push(error),
    ...options,
  });
  return { handle, keys: redmine.keys, errors };
}

/** Calls the handler in place of the network, adding the Host and Content-Length a real fetch sends. */
function direct(handle: Handler, headers: Record<string, string> = {}): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body = request.body && (await request.arrayBuffer());
    const sent = new Headers(request.headers);
    sent.set("host", new URL(request.url).host);
    if (body) sent.set("content-length", String(body.byteLength));
    for (const [name, value] of Object.entries(headers)) sent.set(name, value);
    return handle(new Request(request, { method: request.method, headers: sent, body }));
  };
}

function stalled(headers: Record<string, string>): Request {
  const start = new TextEncoder().encode('{"jsonrpc":"2.0","id":7,"method":"tools/list"');
  return new Request("http://localhost:3737/mcp", {
    method: "POST",
    headers: { host: "localhost:3737", "content-type": "application/json", ...headers },
    body: new ReadableStream({ start: (controller) => controller.enqueue(start) }),
    duplex: "half",
  });
}

async function connect(
  handle: Handler,
  key: string,
  era: "legacy" | "modern" = "modern",
): Promise<Client> {
  const client = new Client(
    { name: "redmine-mcp-tests", version: "0.0.0" },
    era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {},
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost:3737/mcp"), {
      fetch: direct(handle, { "X-Redmine-API-Key": key }),
    }),
  );
  return client;
}

/** Defaults to tools/list in the 2025 shape, which needs no handshake on a stateless server. */
function post(
  handle: Handler,
  headers: Record<string, string>,
  body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
): Promise<Response> {
  return direct(handle, headers)("http://localhost:3737/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body,
  });
}

describe("createRedmineMcpHandler", () => {
  it.each([[{}], [{ "X-Redmine-API-Key": "  " }]])(
    "answers %j with 401 and a JSON-RPC error naming the header",
    async (headers) => {
      const { handle, keys } = handler();
      const response = await post(handle, headers);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        error: { message: expect.stringContaining("X-Redmine-API-Key header") },
      });
      expect(keys).toEqual([]);
    },
  );

  it.each([
    ["a string id", { jsonrpc: "2.0", id: "call-7", method: "tools/list" }, "call-7"],
    ["a number id", { jsonrpc: "2.0", id: 7, method: "tools/list" }, 7],
    ["a notification", { jsonrpc: "2.0", method: "notifications/initialized" }, null],
    ["a batch", [{ jsonrpc: "2.0", id: 7, method: "tools/list" }], null],
    ["a response", { jsonrpc: "2.0", id: 7, result: {} }, null],
  ])("answers the 401 for %s with that request's id, or null", async (_, body, id) => {
    const response = await post(handler().handle, {}, JSON.stringify(body));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id });
  });

  it("answers the 401 with the id of a body up to 64 KiB, and null past it or for broken JSON", async () => {
    const { handle } = handler();
    const padded = (bytes: number) => {
      const request = { jsonrpc: "2.0", id: 7, method: "tools/list", params: { pad: "" } };
      request.params.pad = "x".repeat(bytes - JSON.stringify(request).length);
      return JSON.stringify(request);
    };
    for (const [body, id] of [
      [padded(64 * 1024), 7],
      [padded(64 * 1024 + 1), null],
      ['{"jsonrpc":"2.0","id":7,', null],
    ] as const) {
      const response = await post(handle, {}, body);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id });
    }
  });

  it.each([
    ["no declared length", {}],
    ["a declared length over 64 KiB", { "content-length": String(64 * 1024 + 1) }],
  ])(
    "refuses at once, with id null, a body with %s that never ends",
    async (_, length) => {
      const { handle } = handler({ allowedHosts: ["localhost"] });
      for (const [headers, status] of [
        [{}, 401],
        [{ origin: "https://evil.example" }, 403],
        [{ host: "evil.example" }, 403],
      ] as const) {
        const response = await handle(stalled({ ...length, ...headers }));
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: null });
      }
    },
    1000,
  );

  it("refuses with id null a small body that stalls, instead of waiting for its end", async () => {
    const response = await handler().handle(stalled({ "content-length": "100" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: null });
  }, 3000);

  it("refuses a browser Origin that is not allowed with 403, before the key is checked", async () => {
    const { handle } = handler({ allowedOrigins: ["app.example.com"] });
    const response = await post(handle, { Origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { message: "Invalid Origin: evil.example" },
    });
    expect((await post(handle, { Origin: "null", "X-Redmine-API-Key": "alice-key" })).status).toBe(
      403,
    );
  });

  it("serves an allowed Origin and requests without Origin", async () => {
    const { handle } = handler({ allowedOrigins: ["app.example.com"] });
    const headers = { "X-Redmine-API-Key": "alice-key" };
    expect((await post(handle, { ...headers, Origin: "https://app.example.com" })).status).toBe(
      200,
    );
    expect((await post(handle, headers)).status).toBe(200);
  });

  describe("CORS", () => {
    const app = "https://app.example.com";
    const key = { "X-Redmine-API-Key": "alice-key" };
    const corsHeaders = (response: Response) =>
      [...response.headers].filter(([name]) => name.startsWith("access-control-"));

    function preflight(handle: Handler, headers: Record<string, string> = {}): Promise<Response> {
      return direct(handle, {
        Origin: app,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, mcp-protocol-version, x-redmine-api-key",
        ...headers,
      })("http://localhost:3737/mcp", { method: "OPTIONS" });
    }

    it("answers a preflight from an allowed Origin with 204, echoing that Origin", async () => {
      const { handle, keys } = handler({ allowedOrigins: ["app.example.com"] });
      const response = await preflight(handle);
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(response.headers.get("access-control-allow-origin")).toBe(app);
      expect(response.headers.get("access-control-allow-methods")).toBe("POST");
      expect(response.headers.get("vary")).toBe("Origin");
      expect(response.headers.get("access-control-max-age")).toBe("7200");
      expect(response.headers.has("access-control-allow-credentials")).toBe(false);
      const allowed = response.headers.get("access-control-allow-headers")!.toLowerCase();
      expect(allowed.split(", ")).toEqual(
        expect.arrayContaining([
          "content-type",
          "accept",
          "mcp-protocol-version",
          "mcp-method",
          "mcp-name",
          "x-redmine-api-key",
        ]),
      );
      expect(keys).toEqual([]);
    });

    it("echoes the exact Origin, with its scheme and port, never *", async () => {
      const { handle } = handler({ allowedOrigins: ["app.example.com"] });
      const other = "http://app.example.com:8080";
      const response = await preflight(handle, { Origin: other });
      expect(response.headers.get("access-control-allow-origin")).toBe(other);
    });

    it("refuses a preflight from an Origin that is not allowed, with no CORS headers", async () => {
      const { handle } = handler({ allowedOrigins: ["app.example.com"] });
      const response = await preflight(handle, { Origin: "https://evil.example" });
      expect(response.status).toBe(403);
      expect(corsHeaders(response)).toEqual([]);
      expect(response.headers.has("vary")).toBe(false);
      expect((await preflight(handler().handle)).status).toBe(403);
    });

    it("checks Host on a preflight, as a DNS-rebound page sends it", async () => {
      const { handle } = handler({
        allowedOrigins: ["app.example.com"],
        allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
      });
      const rebound = await preflight(handle, { Host: "evil.example:3737" });
      expect(rebound.status).toBe(403);
      expect(corsHeaders(rebound)).toEqual([]);
      expect((await preflight(handle, { Host: "127.0.0.1:3737" })).status).toBe(204);
    });

    it("treats an OPTIONS without Origin or without a requested method as no preflight", async () => {
      const { handle } = handler({ allowedOrigins: ["app.example.com"] });
      const options = (headers: Record<string, string>) =>
        direct(handle, headers)("http://localhost:3737/mcp", { method: "OPTIONS" });
      const noOrigin = await options({ "Access-Control-Request-Method": "POST" });
      expect(noOrigin.status).toBe(401);
      expect(corsHeaders(noOrigin)).toEqual([]);
      const noMethod = await options({ Origin: app });
      expect(noMethod.status).toBe(401);
      expect(noMethod.headers.get("access-control-allow-methods")).toBeNull();
    });

    it("adds the Origin to an SSE stream that stays a stream, and to a JSON response", async () => {
      const { handle } = handler({ allowedOrigins: ["app.example.com"] });
      const sse = await post(handle, { ...key, Origin: app });
      expect(sse.status).toBe(200);
      expect(sse.headers.get("content-type")).toBe("text/event-stream");
      expect(corsHeaders(sse)).toEqual([
        ["access-control-allow-origin", app],
        ["access-control-expose-headers", "WWW-Authenticate"],
      ]);
      expect(sse.headers.get("vary")).toBe("Origin");
      expect(await sse.text()).toContain('"tools"');

      const json = await direct(handle, { ...key, Origin: app })("http://localhost:3737/mcp");
      expect(json.status).toBe(405);
      expect(json.headers.get("content-type")).toContain("application/json");
      expect(json.headers.get("access-control-allow-origin")).toBe(app);
      expect(json.headers.get("vary")).toBe("Origin");
    });

    it("adds the Origin to the 401 for a missing key, so a page can read the message", async () => {
      const { handle } = handler({ allowedOrigins: ["app.example.com"] });
      const response = await post(handle, { Origin: app });
      expect(response.status).toBe(401);
      expect(response.headers.get("access-control-allow-origin")).toBe(app);
      expect(response.headers.get("vary")).toBe("Origin");
    });

    it("sends no CORS headers for a refused Origin or for a request without Origin", async () => {
      const { handle } = handler({ allowedOrigins: ["app.example.com"] });
      const refused = await post(handle, { ...key, Origin: "https://evil.example" });
      expect(refused.status).toBe(403);
      expect(corsHeaders(refused)).toEqual([]);
      const absent = await post(handle, key);
      expect(absent.status).toBe(200);
      expect(corsHeaders(absent)).toEqual([]);
      expect(absent.headers.has("vary")).toBe(false);
      expect(corsHeaders(await post(handle, {}))).toEqual([]);
    });

    it("matches an allowed origin exactly and a hostname by hostname alone", async () => {
      const { handle } = handler({
        allowedOrigins: ["https://app.example.com", "inspector.example.com"],
      });
      const origins = [
        ["https://app.example.com", 200],
        ["http://app.example.com", 403],
        ["https://app.example.com:8443", 403],
        ["https://other.example.com", 403],
        ["http://inspector.example.com:6274", 200],
        ["https://inspector.example.com", 200],
      ] as const;
      for (const [origin, status] of origins) {
        const response = await post(handle, { ...key, Origin: origin });
        expect([origin, response.status]).toEqual([origin, status]);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          status === 200 ? origin : null,
        );
      }
      expect((await preflight(handle, { Origin: "http://app.example.com" })).status).toBe(403);
    });

    it("throws on an origin entry with a path, uppercase or a trailing slash when created", () => {
      for (const entry of [
        "https://app.example.com/",
        "https://app.example.com/x",
        "HTTPS://app.example.com",
        "https://App.example.com",
      ]) {
        expect(() =>
          createRedmineMcpHandler({ baseUrl: "http://redmine.test", allowedOrigins: [entry] }),
        ).toThrow("is not an origin");
      }
    });
  });

  it("refuses with 403 a Host outside allowedHosts, as a DNS-rebound page sends it", async () => {
    const { handle } = handler({ allowedHosts: ["localhost", "127.0.0.1", "[::1]"] });
    const key = { "X-Redmine-API-Key": "alice-key" };
    const rebound = await post(handle, { ...key, Host: "evil.example:3737" });
    expect(rebound.status).toBe(403);
    expect(await rebound.json()).toMatchObject({
      error: { message: "Invalid Host: evil.example" },
    });
    expect((await post(handle, { ...key, Host: "127.0.0.1:3737" })).status).toBe(200);
    expect((await post(handler().handle, { ...key, Host: "mcp.example.com" })).status).toBe(200);
  });

  it("answers a refused Host or Origin with a JSON-RPC error naming the request's id", async () => {
    const { handle } = handler({ allowedHosts: ["localhost"] });
    const body = JSON.stringify({ jsonrpc: "2.0", id: "call-7", method: "tools/list" });
    for (const [headers, message] of [
      [{ Host: "evil.example" }, "Invalid Host: evil.example"],
      [{ Origin: "https://evil.example" }, "Invalid Origin: evil.example"],
    ] as const) {
      const response = await post(handle, headers, body);
      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        id: "call-7",
        error: { code: -32000, message },
      });
    }
  });

  it("sends each client's own key to Redmine, also when their calls overlap", async () => {
    const { handle, keys } = handler();
    const alice = await connect(handle, "alice-key");
    const bob = await connect(handle, "bob-key");
    const results = await Promise.all(
      [alice, bob, alice].map((client) =>
        client.callTool({ name: "issue_statuses_list", arguments: {} }),
      ),
    );
    expect(
      results.map(
        (result) => (result.structuredContent as { items: { name: string }[] }).items[0]?.name,
      ),
    ).toEqual(["New for alice-key", "New for bob-key", "New for alice-key"]);
    expect(keys).toHaveLength(3);
  });

  it.each(["legacy", "modern"] as const)(
    "serves a %s-era client the tools of its access mode",
    async (era) => {
      const { handle, keys } = handler({ access: "read-only" });
      const client = await connect(handle, "alice-key", era);
      expect(client.getNegotiatedProtocolVersion()).toBe(
        era === "modern" ? "2026-07-28" : "2025-11-25",
      );
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(43);
      expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
      // An HTTP server has no files directory, so nothing it lists can touch local files.
      expect(tools.map((tool) => tool.name)).not.toContain("attachments_save");
      const forced = await client.callTool({ name: "issues_delete", arguments: { issue_id: 1 } });
      expect(texts(forced)[0]).toContain('"read-only"');
      expect(keys).toEqual([]);
    },
  );

  it("passes Redmine's 401 on as a tool error and never echoes the key", async () => {
    const { handle, keys, errors } = handler();
    const client = await connect(handle, "stolen-key-0d1e2a3d");
    const result = await client.callTool({ name: "issue_statuses_list", arguments: {} });
    expect(result.isError).toBe(true);
    expect(texts(result)[0]).toContain("X-Redmine-API-Key header");
    expect(keys).toEqual(["stolen-key-0d1e2a3d"]);
    expect(JSON.stringify([result, errors.map((error) => error.message)])).not.toContain(
      "stolen-key",
    );
  });

  it("throws on a bad baseUrl when created, not on each request", () => {
    expect(() => createRedmineMcpHandler({ baseUrl: "ftp://redmine.test" })).toThrow();
  });

  it("imports no node: builtins, so Bun and Workers run it unchanged", () => {
    const seen = new Set<string>();
    const visit = (file: URL): void => {
      if (seen.has(file.href)) return;
      seen.add(file.href);
      for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)) {
        expect(specifier, file.pathname).not.toMatch(/^node:/);
        if (specifier!.startsWith(".") && specifier!.endsWith(".ts"))
          visit(new URL(specifier!, file));
      }
    };
    visit(new URL("../../src/index.ts", import.meta.url));
    expect([...seen].map((file) => file.split("/").at(-1))).toEqual(
      expect.arrayContaining([
        "http.ts",
        "server.ts",
        "tools.ts",
        "catalog-tools.ts",
        "seal.ts",
        "clients.ts",
        "pages.ts",
      ]),
    );
  });
});

describe("createRedmineMcpHandler with a verifier", () => {
  const publicUrl = "https://redmine.example.com/redmine/mcp";
  const now = () => Math.floor(Date.now() / 1000);
  const grants: Record<string, BearerGrant> = {
    alice: {
      credential: { bearer: "redmine-token-of-alice" },
      scopes: ["redmine:write"],
      resource: publicUrl,
      expiresAt: now() + 600,
      clientId: "client",
    },
    expired: {
      credential: { bearer: "x" },
      scopes: ["redmine:read"],
      resource: publicUrl,
      expiresAt: now() - 1,
      clientId: "client",
    },
    foreign: {
      credential: { bearer: "x" },
      scopes: ["redmine:read"],
      resource: "https://other.example.com/mcp",
      expiresAt: now() + 600,
      clientId: "client",
    },
    unscoped: {
      credential: { bearer: "x" },
      scopes: ["profile"],
      resource: publicUrl,
      expiresAt: now() + 600,
      clientId: "client",
    },
  };
  const verifier: BearerVerifier = {
    issuer: "https://auth.example.com",
    verify: async (token) => grants[token],
  };

  /** A Redmine that names a status after the bearer token it got. */
  function bearerRedmine() {
    const seen: (string | null)[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const authorization = new Request(input, init).headers.get("authorization");
      seen.push(authorization);
      return Response.json({
        issue_statuses: [{ id: 1, name: `New for ${authorization}`, is_closed: false }],
      });
    };
    return { fetch, seen };
  }

  function gated(options: Partial<RedmineMcpHandlerOptions> = {}) {
    const redmine = bearerRedmine();
    const handle = createRedmineMcpHandler({
      baseUrl: "http://redmine.test",
      fetch: redmine.fetch,
      publicUrl,
      verifier,
      ...options,
    });
    const call = (headers: Record<string, string>, method = "tools/list", path = "/redmine/mcp") =>
      handle(
        new Request(`http://127.0.0.1:3737${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...headers,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params: method === "tools/call" ? { name: "issue_statuses_list", arguments: {} } : {},
          }),
        }),
      );
    return { handle, call, seen: redmine.seen };
  }

  it("serves the protected resource metadata naming the verifier's issuer", async () => {
    const { handle } = gated({ access: "no-delete" });
    for (const path of [
      "/.well-known/oauth-protected-resource/redmine/mcp",
      "/redmine/mcp/.well-known/oauth-protected-resource",
    ]) {
      const response = await handle(new Request(`http://127.0.0.1:3737${path}`));
      expect(await response.json()).toEqual({
        resource: publicUrl,
        authorization_servers: ["https://auth.example.com"],
        scopes_supported: ["redmine:read", "redmine:write"],
        bearer_methods_supported: ["header"],
        resource_name: "Redmine",
      });
    }
    // An external authorization server publishes its own metadata.
    const server = await handle(
      new Request("http://127.0.0.1:3737/.well-known/oauth-authorization-server/redmine/mcp"),
    );
    expect(server.status).toBe(404);
  });

  it("challenges a request without credentials, naming no error, as RFC 6750 asks", async () => {
    const response = await gated().call({});
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource", scope="redmine:read redmine:write redmine:delete"`,
    );
    expect(await response.json()).toMatchObject({
      error: "invalid_token",
      error_description: expect.stringContaining("X-Redmine-API-Key"),
    });
  });

  it.each([
    ["an unknown", "nobody"],
    ["an expired", "expired"],
    ["another resource's", "foreign"],
  ])("answers 401 invalid_token for %s token", async (_, token) => {
    const { call, seen } = gated();
    const response = await call({ Authorization: `Bearer ${token}` });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(
      /^Bearer error="invalid_token", .*resource_metadata="/,
    );
    expect(seen).toEqual([]);
  });

  it.each([
    ["Bearer alice extra", 401],
    ["Bearer alice, Bearer bob", 401],
    ["Bearer", 401],
    ["Basic YWxpY2U6eA==", 401],
    ["bearer alice", 200],
    ["BEARER  alice", 200],
  ])("takes exactly one Bearer token: %j answers %i", async (authorization, status) => {
    const { call } = gated();
    expect((await call({ Authorization: authorization })).status).toBe(status);
  });

  it("answers 403 insufficient_scope for a token without a redmine scope", async () => {
    const response = await gated().call({ Authorization: "Bearer unscoped" });
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(response.headers.get("www-authenticate")).toContain(
      'scope="redmine:read redmine:write redmine:delete"',
    );
  });

  it("sends the grant's Redmine credential, never the token, in the token's access mode", async () => {
    const { call, seen } = gated();
    const listed = await call({ Authorization: "Bearer alice" });
    // redmine:write is no-delete: 76 tools, the deletes hidden.
    expect((await listed.text()).match(/"name":"/g)).toHaveLength(76);
    const called = await call({ Authorization: "Bearer alice" }, "tools/call");
    expect(await called.text()).toContain("New for Bearer redmine-token-of-alice");
    expect(seen).toEqual(["Bearer redmine-token-of-alice"]);
  });

  it("keeps the X-Redmine-API-Key header working, ahead of a bearer token", async () => {
    const { handle, keys } = handler({ publicUrl, verifier });
    const routed = await handle(
      new Request("http://127.0.0.1:3737/redmine/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "X-Redmine-API-Key": "alice-key",
          Authorization: "Bearer nobody",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "issue_statuses_list", arguments: {} },
        }),
      }),
    );
    expect(await routed.text()).toContain("New for alice-key");
    expect(keys).toEqual(["alice-key"]);
  });

  it("allows Authorization in a preflight and exposes WWW-Authenticate", async () => {
    const { handle, call } = gated({ allowedOrigins: ["https://app.example.com"] });
    const preflight = await handle(
      new Request("http://127.0.0.1:3737/redmine/mcp", {
        method: "OPTIONS",
        headers: {
          origin: "https://app.example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization, content-type",
        },
      }),
    );
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");
    const challenged = await call({ origin: "https://app.example.com" });
    expect(challenged.status).toBe(401);
    expect(challenged.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
  });

  it("refuses a verifier without publicUrl, both kinds of server at once, and plain http", () => {
    const create = (options: Partial<RedmineMcpHandlerOptions>) => () =>
      createRedmineMcpHandler({ baseUrl: "http://redmine.test", ...options });
    expect(create({ verifier })).toThrow("publicUrl");
    expect(create({ verifier, publicUrl: "http://redmine.example.com/mcp" })).toThrow("https");
    expect(create({ verifier, publicUrl: `${publicUrl}?x=1` })).toThrow("query");
    // The metadata advertises publicUrl as written, so only its canonical spelling is accepted.
    for (const [written, canonical] of [
      [`${publicUrl}/`, publicUrl],
      ["https://Redmine.Example.com/redmine/mcp", publicUrl],
      ["https://redmine.example.com:443/redmine/mcp", publicUrl],
      ["https://redmine.example.com/redmine/./mcp", publicUrl],
      ["https://mcp.example.com/", "https://mcp.example.com"],
    ]) {
      expect(create({ verifier, publicUrl: written })).toThrow(`must be written as ${canonical}`);
    }
    expect(create({ verifier, publicUrl: "https://mcp.example.com" })).not.toThrow();
    expect(
      create({
        verifier,
        publicUrl,
        oauth: { secret: "s".repeat(32), apiKeyLogin: true, fetchClientMetadata: fetch },
      }),
    ).toThrow("exclude each other");
  });
});

describe("createRedmineMcpHandler with a public URL and no OAuth", () => {
  it("serves the endpoint at its path only and keeps the header mode's 401", async () => {
    const { handle } = handler({ publicUrl: "http://127.0.0.1:3737/tracker/mcp" });
    const at = (path: string, headers: Record<string, string> = {}) =>
      handle(
        new Request(`http://127.0.0.1:3737${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...headers,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
        }),
      );
    expect((await at("/tracker/mcp", { "X-Redmine-API-Key": "alice-key" })).status).toBe(200);
    expect((await at("/tracker/mcp/")).status).toBe(401);
    expect((await at("/tracker/mcp")).headers.has("www-authenticate")).toBe(false);
    expect((await at("/mcp", { "X-Redmine-API-Key": "alice-key" })).status).toBe(404);
    expect((await at("/.well-known/oauth-protected-resource/tracker/mcp")).status).toBe(404);
  });
});
