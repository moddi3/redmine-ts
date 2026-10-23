import { readFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vite-plus/test";
import { createRedmineMcpHandler } from "../../src/index.ts";
import type { RedmineMcpHandlerOptions } from "../../src/index.ts";
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

/** Calls the handler in place of the network, adding the Host header a real fetch puts on the wire. */
function direct(handle: Handler, headers: Record<string, string> = {}): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const sent = new Headers(request.headers);
    sent.set("host", new URL(request.url).host);
    for (const [name, value] of Object.entries(headers)) sent.set(name, value);
    return handle(new Request(request, { headers: sent }));
  };
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

/** One tools/list POST in the 2025 shape, which needs no handshake on a stateless server. */
function post(handle: Handler, headers: Record<string, string>): Promise<Response> {
  return direct(handle, headers)("http://localhost:3737/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
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
        id: null,
        error: { message: expect.stringContaining("X-Redmine-API-Key header") },
      });
      expect(keys).toEqual([]);
    },
  );

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
      expect.arrayContaining(["http.ts", "server.ts", "tools.ts", "catalog-tools.ts"]),
    );
  });
});
