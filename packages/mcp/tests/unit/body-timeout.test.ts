import { once } from "node:events";
import { createServer } from "node:http";
import { connect as dial } from "node:net";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createRedmineMcpHandler } from "../../src/index.ts";
import type { BearerVerifier, RedmineMcpHandlerOptions } from "../../src/index.ts";
import { toNodeListener } from "../../src/node-http.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const publicUrl = "http://localhost:3737/mcp";

const verifier: BearerVerifier = {
  issuer: "https://auth.example.com",
  verify: async (token) =>
    token === "alice"
      ? {
          credential: { bearer: "redmine-token-of-alice" },
          scopes: ["redmine:write"],
          resource: publicUrl,
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          clientId: "client",
        }
      : undefined,
};

/** A Redmine that accepts good-key and alice's token, and lists issue statuses after `slowMs`. */
function handler(options: Partial<RedmineMcpHandlerOptions> = {}, slowMs = 0) {
  const errors: Error[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const key = request.headers.get("x-redmine-api-key");
    if (key !== "good-key" && request.headers.get("authorization") === null) {
      return new Response(null, { status: 401 });
    }
    if (new URL(request.url).pathname === "/users/current.json") {
      return Response.json({ user: { id: 1, login: "alice", admin: false } });
    }
    await sleep(slowMs);
    return Response.json({ issue_statuses: [{ id: 1, name: "New", is_closed: false }] });
  };
  const handle = createRedmineMcpHandler({
    baseUrl: "http://redmine.test",
    fetch,
    onError: (error) => errors.push(error),
    ...options,
  });
  return { handle, errors };
}

const credentials = {
  key: { "x-redmine-api-key": "good-key" },
  bearer: { authorization: "Bearer alice" },
};

/** A POST whose body is sent as `parts`, a number being a pause in milliseconds. */
function post(
  headers: Record<string, string>,
  parts: (string | number)[],
  { end = true } = {},
): Request {
  const encoder = new TextEncoder();
  return new Request(publicUrl, {
    method: "POST",
    headers: {
      host: "localhost:3737",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      ...headers,
    },
    body: new ReadableStream({
      async start(controller) {
        for (const part of parts) {
          if (typeof part === "number") await sleep(part);
          else controller.enqueue(encoder.encode(part));
        }
        if (end) controller.close();
      },
    }),
    duplex: "half",
  });
}

const stalledUpload = `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"attachments_upload","arguments":{"filename":"x.bin","content_base64":"${"A".repeat(100 * 1024)}`;

const toolCall = JSON.stringify({
  jsonrpc: "2.0",
  id: 7,
  method: "tools/call",
  params: { name: "issue_statuses_list", arguments: {} },
});

const toolsList = JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} });

const late = "The request body took longer than 0.3 seconds to arrive.";

describe("a request body that does not arrive in time", () => {
  it.each(Object.entries(credentials))(
    "gets 408 with id null for a %s request that stops sending",
    async (_, headers) => {
      const { handle, errors } = handler({ publicUrl, verifier, bodyTimeoutMs: 300 });
      const started = Date.now();
      const response = await handle(post(headers, [stalledUpload], { end: false }));
      expect(response.status).toBe(408);
      expect(response.headers.get("connection")).toBeNull();
      expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: late },
      });
      expect(Date.now() - started).toBeGreaterThanOrEqual(300);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(errors.map((error) => error.message)).toEqual([late]);
    },
    3000,
  );

  it("gets 408 for a body that keeps trickling past the limit", async () => {
    const { handle } = handler({ bodyTimeoutMs: 300 });
    const trickle = [stalledUpload, ...Array.from({ length: 20 }, () => [50, "A"]).flat()];
    const response = await handle(post(credentials.key, trickle, { end: false }));
    expect(response.status).toBe(408);
  }, 3000);

  it.each(Object.entries(credentials))(
    "gets 408 for a %s request that sends no body at all",
    async (_, headers) => {
      const { handle } = handler({ publicUrl, verifier, bodyTimeoutMs: 300 });
      const response = await handle(post(headers, [], { end: false }));
      expect(response.status).toBe(408);
    },
    3000,
  );

  it("still gets 401 for a key Redmine refuses", async () => {
    const { handle } = handler({ bodyTimeoutMs: 300 });
    const response = await handle(
      post({ "x-redmine-api-key": "bogus" }, [stalledUpload], { end: false }),
    );
    expect(response.status).toBe(401);
  }, 3000);
});

describe("a request body that arrives in time", () => {
  it("is served though it pauses, once the key check passes", async () => {
    const { handle } = handler({ bodyTimeoutMs: 2000 });
    const response = await handle(
      post(credentials.key, [
        toolsList.slice(0, 30),
        700,
        toolsList.slice(30, 50),
        700,
        toolsList.slice(50),
      ]),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("attachments_upload");
  }, 4000);

  it.each(Object.entries(credentials))(
    "gets a %s tool result that takes longer than the limit, since only the body is timed",
    async (_, headers) => {
      const { handle, errors } = handler({ publicUrl, verifier, bodyTimeoutMs: 100 }, 400);
      const response = await handle(post(headers, [toolCall]));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("New");
      expect(errors).toEqual([]);
    },
    3000,
  );

  it.each([
    ["past the limit", { bodyTimeoutMs: 50 }],
    ["with a budget of 0", { maxBodyBytesInFlight: 0 }],
  ])(
    "keeps a 2026-07-28 subscriptions/listen stream open %s",
    async (_, options) => {
      const honoring = vi
        .spyOn(Server.prototype, "getCapabilities")
        .mockReturnValue({ tools: { listChanged: true } });
      try {
        const { handle } = handler(options);
        const listen = JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "subscriptions/listen",
          params: {
            notifications: { toolsListChanged: true },
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientInfo": {
                name: "body-timeout-tests",
                version: "0.0.0",
              },
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        });
        const response = await handle(
          post(
            {
              ...credentials.key,
              "mcp-protocol-version": "2026-07-28",
              "mcp-method": "subscriptions/listen",
            },
            [listen],
          ),
        );
        expect(response.status).toBe(200);
        const reader = response.body!.getReader();
        expect(new TextDecoder().decode((await reader.read()).value)).toContain(
          "notifications/subscriptions/acknowledged",
        );
        const next = await Promise.race([
          reader.read().then(() => "more"),
          sleep(300).then(() => "still open"),
        ]);
        expect(next).toBe("still open");
        await reader.cancel();
      } finally {
        honoring.mockRestore();
      }
    },
    3000,
  );
});

it.each([0, 0.5, -1, Number.NaN, 2 ** 31, null, "300"])(
  "throws on bodyTimeoutMs %s when created",
  (value) => {
    expect(() => handler({ bodyTimeoutMs: value as number })).toThrow(/bodyTimeoutMs/);
  },
);

it.each([1, 2 ** 31 - 1])("accepts bodyTimeoutMs %s", (value) => {
  expect(() => handler({ bodyTimeoutMs: value })).not.toThrow();
});

describe("over node:http", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(() => close?.());

  it("answers 408, then reads and drops the rest for 5 seconds and stops reading it", async () => {
    const { handle } = handler({ bodyTimeoutMs: 300 });
    const server = createServer(toNodeListener(handle, () => {}));
    // Node closes a connection it has read nothing from for this long plus a second.
    server.keepAliveTimeout = 1000;
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    close = () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      });
    const socket = dial((server.address() as AddressInfo).port, "127.0.0.1");
    await once(socket, "connect");
    socket.write(
      [
        "POST /mcp HTTP/1.1",
        "Host: localhost",
        "Content-Type: application/json",
        "Accept: application/json, text/event-stream",
        "MCP-Protocol-Version: 2025-11-25",
        "X-Redmine-API-Key: good-key",
        "Content-Length: 1000000",
        "",
        stalledUpload,
      ].join("\r\n"),
    );
    socket.on("error", () => undefined);
    const started = Date.now();
    const [data] = await once(socket, "data");
    const received = String(data);
    const answeredAt = Date.now();
    expect(received).toMatch(/^HTTP\/1\.1 408 /);
    expect(received.toLowerCase()).not.toContain("connection: close");
    expect(answeredAt - started).toBeLessThan(1500);
    const sending = setInterval(() => socket.write("A".repeat(1024)), 250);
    await new Promise((resolve) => socket.once("close", resolve));
    clearInterval(sending);
    expect(Date.now() - answeredAt).toBeGreaterThan(4500);
    expect(Date.now() - answeredAt).toBeLessThan(8500);
  }, 12_000);
});
