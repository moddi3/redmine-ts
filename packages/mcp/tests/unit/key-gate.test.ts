import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vite-plus/test";
import { createRedmineMcpHandler } from "../../src/index.ts";
import type { RedmineMcpHandlerOptions } from "../../src/index.ts";

type Handler = (request: Request) => Promise<Response>;

const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

function fakeRedmine({ down = false, checkDelayMs = 0 } = {}) {
  const calls: string[] = [];
  const uploads: Uint8Array[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    calls.push(path);
    if (down) throw new TypeError("fetch failed");
    if (path === "/users/current.json") await sleep(checkDelayMs, request.signal);
    if (request.headers.get("x-redmine-api-key") !== "good-key") {
      return new Response(null, { status: 401 });
    }
    if (path === "/users/current.json") {
      return Response.json({ user: { id: 1, login: "alice", admin: false } });
    }
    if (path === "/uploads.json") {
      uploads.push(new Uint8Array(await request.arrayBuffer()));
      return Response.json({ upload: { id: 1, token: "1.abc" } }, { status: 201 });
    }
    if (path === "/issue_statuses.json") return Response.json({ issue_statuses: [] });
    return Response.json({}, { status: 404 });
  };
  return { fetch, calls, uploads };
}

function handler(redmine = {}, options: Partial<RedmineMcpHandlerOptions> = {}) {
  const { fetch, calls, uploads } = fakeRedmine(redmine);
  const errors: Error[] = [];
  const handle = createRedmineMcpHandler({
    baseUrl: "http://redmine.test",
    fetch,
    onError: (error) => errors.push(error),
    ...options,
  });
  return { handle, calls, uploads, errors };
}

const toolCall = (pad = 0) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "issue_statuses_list", arguments: {}, _meta: { pad: "x".repeat(pad) } },
  });

const toolsList = (pad = 0, id = 7) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list", params: { pad: "x".repeat(pad) } });

function post(
  key: string,
  chunksAndWaits: (string | number)[],
  { end = true, length = true, headers = {} } = {},
): Request {
  const encoder = new TextEncoder();
  const bytes = chunksAndWaits
    .map((part) => (typeof part === "string" ? encoder.encode(part).byteLength : 0))
    .reduce((sum, size) => sum + size, 0);
  return new Request("http://localhost:3737/mcp", {
    method: "POST",
    headers: {
      host: "localhost:3737",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      "x-redmine-api-key": key,
      ...(length ? { "content-length": String(end ? bytes : bytes + 1000) } : {}),
      ...headers,
    },
    body: new ReadableStream({
      async start(controller) {
        for (const part of chunksAndWaits) {
          if (typeof part === "number") await sleep(part);
          else controller.enqueue(encoder.encode(part));
        }
        if (end) controller.close();
      },
    }),
    duplex: "half",
  });
}

async function connect(
  handle: Handler,
  key: string,
  era: "legacy" | "modern" = "legacy",
): Promise<Client> {
  const client = new Client(
    { name: "key-gate-tests", version: "0.0.0" },
    era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {},
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost:3737/mcp"), {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const body = request.body && (await request.arrayBuffer());
        const headers = new Headers(request.headers);
        headers.set("host", "localhost:3737");
        headers.set("x-redmine-api-key", key);
        if (body) headers.set("content-length", String(body.byteLength));
        return handle(new Request(request, { method: request.method, headers, body }));
      },
    }),
  );
  return client;
}

describe("an X-Redmine-API-Key that Redmine refuses", () => {
  it.each([
    ["a declared length", {}],
    ["no declared length", { length: false }],
  ])(
    "gets 401 with id null for a body past 64 KiB with %s, and Redmine sees only the key check",
    async (_, shape) => {
      const { handle, calls, errors } = handler();
      const response = await handle(post("bogus", [toolCall(64 * 1024)], shape));
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        id: null,
        error: { message: expect.stringContaining("does not accept the API key") },
      });
      expect(calls).toEqual(["/users/current.json"]);
      expect(errors).toEqual([]);
    },
  );

  it("gets 401 for a body past 64 KiB that stalls, without waiting for the rest", async () => {
    const { handle } = handler();
    const response = await handle(post("bogus", [toolCall(100 * 1024)], { end: false }));
    expect(response.status).toBe(401);
  }, 1000);

  it("gets 401 about a second after a small body stalls", async () => {
    const { handle, calls } = handler();
    const started = Date.now();
    const response = await handle(post("bogus", ['{"jsonrpc":"2.0","id":7,'], { end: false }));
    expect(response.status).toBe(401);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    expect(Date.now() - started).toBeLessThan(1900);
    expect(calls).toEqual(["/users/current.json"]);
  }, 3000);

  it("holds the rest of a small body while a slow key check runs, so no tool runs", async () => {
    const { handle, calls } = handler({ checkDelayMs: 500 });
    const body = toolCall();
    const response = await handle(post("bogus", [body.slice(0, 30), 1300, body.slice(30)]));
    expect(response.status).toBe(401);
    expect(calls).toEqual(["/users/current.json"]);
  }, 4000);

  it.each(["legacy", "modern"] as const)(
    "gets 401 on the %s leg for a tool call past 64 KiB, before the tool runs",
    async (era) => {
      const { handle, calls } = handler();
      const client = await connect(handle, "bogus", era);
      await expect(
        client.callTool({
          name: "issue_statuses_list",
          arguments: {},
          _meta: { pad: "x".repeat(64 * 1024) },
        }),
      ).rejects.toThrow();
      expect(calls).toEqual(["/users/current.json"]);
    },
  );

  it("gets 401 with OAuth on, where the key goes before a bearer token", async () => {
    const { handle, calls } = handler(
      {},
      {
        publicUrl: "http://localhost:3737/mcp",
        verifier: { issuer: "https://auth.example", verify: async () => undefined },
      },
    );
    const response = await handle(
      post("bogus", [toolCall(100 * 1024)], { headers: { authorization: "Bearer abc" } }),
    );
    expect(response.status).toBe(401);
    expect(calls).toEqual(["/users/current.json"]);
  });

  it("is served as before for a small body that arrives, with no call to Redmine", async () => {
    const { handle, calls } = handler();
    const response = await handle(post("bogus", [toolsList(60 * 1024)]));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("attachments_upload");
    expect(calls).toEqual([]);
  });

  it("is never asked about once the SDK has answered: 413 by length, 415 by type", async () => {
    const { handle, calls } = handler();
    const tooLarge = post("bogus", ['{"jsonrpc":"2.0","id":7'], {
      end: false,
      headers: { "content-length": String(8 * 1024 * 1024) },
    });
    expect((await handle(tooLarge)).status).toBe(413);
    const text = post("bogus", ["x".repeat(100 * 1024)], {
      headers: { "content-type": "text/plain" },
    });
    expect((await handle(text)).status).toBe(415);
    await sleep(1200);
    expect(calls).toEqual([]);
  }, 3000);
});

describe("an X-Redmine-API-Key when Redmine does not answer", () => {
  it("gets 503 with id null for a body past 64 KiB, logged once, while small requests are served", async () => {
    const { handle, errors } = handler({ down: true });
    const large = await handle(post("good-key", [toolsList(100 * 1024)]));
    expect(large.status).toBe(503);
    expect(await large.json()).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { message: expect.stringContaining("Try again") },
    });
    expect(errors).toHaveLength(1);
    const client = await connect(handle, "good-key");
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    expect((await handle(post("good-key", [toolsList()]))).status).toBe(200);
    expect(errors).toHaveLength(1);
  });

  it("gets 503 for a small body still arriving after a second", async () => {
    const { handle } = handler({ down: true });
    const body = toolsList();
    const response = await handle(post("good-key", [body.slice(0, 30), 1300, body.slice(30)]));
    expect(response.status).toBe(503);
  }, 4000);

  it("logs nothing when the client leaves during the key check", async () => {
    const { handle, errors } = handler({ checkDelayMs: 1000 });
    const leaving = new AbortController();
    const request = new Request(post("good-key", [toolsList(100 * 1024)]), {
      signal: leaving.signal,
    });
    setTimeout(() => leaving.abort(), 50);
    await handle(request).catch(() => undefined);
    expect(errors).toEqual([]);
  });
});

describe("an X-Redmine-API-Key that Redmine accepts", () => {
  it("uploads a 5 MiB file through attachments_upload after one key check", async () => {
    const { handle, calls, uploads } = handler();
    const client = await connect(handle, "good-key");
    const file = new Uint8Array(5 * 1024 * 1024).map((_, index) => index % 251);
    const result = await client.callTool({
      name: "attachments_upload",
      arguments: { filename: "x.bin", content_base64: Buffer.from(file).toString("base64") },
    });
    expect(result.isError).toBeFalsy();
    expect(uploads).toHaveLength(1);
    expect(Buffer.from(uploads[0]!).equals(file)).toBe(true);
    expect(calls.filter((path) => path === "/users/current.json")).toHaveLength(1);
  });

  it("refuses a file one byte over 5 MiB with the tool's own error, not the request limit", async () => {
    const { handle, uploads } = handler();
    const client = await connect(handle, "good-key");
    const file = Buffer.alloc(5 * 1024 * 1024 + 1, 7);
    const result = await client.callTool({
      name: "attachments_upload",
      arguments: { filename: "x.bin", content_base64: file.toString("base64") },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("upload limit");
    expect(uploads).toEqual([]);
  });

  it("serves a small body still arriving after a second, after one key check", async () => {
    const { handle, calls } = handler();
    const body = toolsList();
    const response = await handle(post("good-key", [body.slice(0, 30), 1300, body.slice(30)]));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("attachments_upload");
    expect(calls).toEqual(["/users/current.json"]);
  }, 4000);

  it("serves a 2025-03-26 batch past 64 KiB after one key check", async () => {
    const { handle, calls } = handler();
    const batch = `[${[1, 2, 3].map((id) => toolsList(30 * 1024, id)).join(",")}]`;
    const response = await handle(
      post("good-key", [batch], { headers: { "mcp-protocol-version": "2025-03-26" } }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const id of [1, 2, 3]) expect(text).toContain(`"id":${id}`);
    expect(calls).toEqual(["/users/current.json"]);
  });
});
