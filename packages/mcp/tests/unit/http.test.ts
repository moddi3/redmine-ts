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
      expect(tools).toHaveLength(39);
      expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
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
