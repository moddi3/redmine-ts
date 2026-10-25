import { once } from "node:events";
import { createServer } from "node:http";
import { connect as tcp } from "node:net";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createRedmineMcpHandler } from "../../src/index.ts";
import type { BearerVerifier, RedmineMcpHandlerOptions } from "../../src/index.ts";
import { toNodeListener } from "../../src/node-http.ts";

const KiB = 1024;
const publicUrl = "http://localhost:3737/mcp";
const head = '{"jsonrpc":"2.0","id":7,"method":"tools/list","params":{"pad":"';
const tail = '"}}';
const toolsList = (pad: number) => head + "x".repeat(pad) + tail;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => void vi.restoreAllMocks());

const verifier: BearerVerifier = {
  issuer: "https://auth.example.com",
  verify: async () => ({
    credential: { bearer: "redmine-token" },
    scopes: ["redmine:read"],
    resource: publicUrl,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    clientId: "client",
  }),
};

const credentials = {
  key: { "x-redmine-api-key": "good-key" },
  bearer: { authorization: "Bearer alice" },
};

function handler(options: Partial<RedmineMcpHandlerOptions> = {}) {
  const errors: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.headers.get("x-redmine-api-key") !== "good-key") {
      return new Response(null, { status: 401 });
    }
    return Response.json({ user: { id: 1, login: "alice", admin: false } });
  };
  const handle = createRedmineMcpHandler({
    baseUrl: "http://redmine.test",
    fetch,
    onError: (error) => errors.push(error.message),
    ...options,
  });
  return { handle, errors };
}

/** A POST without Content-Length whose body the test sends piece by piece. */
function upload(headers: Record<string, string> = { "x-redmine-api-key": "good-key" }) {
  const encoder = new TextEncoder();
  let body!: ReadableStreamDefaultController<Uint8Array>;
  const request = new Request(publicUrl, {
    method: "POST",
    headers: {
      host: "localhost:3737",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      ...headers,
    },
    body: new ReadableStream<Uint8Array>({ start: (controller) => void (body = controller) }),
    duplex: "half",
  });
  return {
    request,
    send: (text: string) => body.enqueue(encoder.encode(text)),
    sendBytes: (bytes: Uint8Array) => body.enqueue(bytes),
    end: () => body.close(),
    leave: () => body.error(new Error("the client went away")),
  };
}

function whole(text: string, headers?: Record<string, string>): Request {
  const sent = upload(headers);
  sent.send(text);
  sent.end();
  return sent.request;
}

async function refusal(response: Response) {
  return {
    status: response.status,
    connection: response.headers.get("connection"),
    retryAfter: response.headers.get("retry-after"),
    body: await response.json(),
  };
}

/** Advances the clock the budget reads past the 5 seconds after which a body counts as stalled. */
function later(ms: number): void {
  const now = Date.now() + ms;
  vi.spyOn(Date, "now").mockReturnValue(now);
}

describe("the budget for request bodies in flight", () => {
  it("serves small requests with a budget of 0, since a body's first 64 KiB are free", async () => {
    const { handle } = handler({ maxBodyBytesInFlight: 0 });
    const response = await handle(whole(toolsList(60 * KiB)));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("attachments_upload");
    const client = new Client(
      { name: "budget-tests", version: "0.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(publicUrl), {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          request.headers.set("host", "localhost:3737");
          request.headers.set("x-redmine-api-key", "good-key");
          return handle(request);
        },
      }),
    );
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
  });

  it("drops a stalled body with 408 to make room for one that arrives", async () => {
    const { handle, errors } = handler({ maxBodyBytesInFlight: 300 * KiB });
    const stalled = upload();
    const dropped = handle(stalled.request);
    stalled.send(head + "x".repeat(200 * KiB));
    await sleep(50);
    later(6000);
    const arriving = await handle(whole(toolsList(250 * KiB)));
    expect(arriving.status).toBe(200);
    expect(await refusal(await dropped)).toMatchObject({
      status: 408,
      connection: null,
      body: { jsonrpc: "2.0", id: null, error: { message: expect.stringContaining("stopped") } },
    });
    expect(errors).toEqual(["Dropped a stalled request body with 408 to make room for another"]);
  });

  it("answers 503 with Retry-After while a body that holds the budget keeps moving, then frees it", async () => {
    const { handle, errors } = handler({ maxBodyBytesInFlight: 300 * KiB });
    const moving = upload();
    const served = handle(moving.request);
    moving.send(head + "x".repeat(200 * KiB));
    await sleep(50);
    later(6000);
    moving.send("x".repeat(130 * KiB));
    await sleep(20);
    expect(await refusal(await handle(whole(toolsList(100 * KiB))))).toMatchObject({
      status: 503,
      connection: null,
      retryAfter: "5",
      body: { jsonrpc: "2.0", id: null, error: { message: expect.stringContaining("Try again") } },
    });
    expect(errors).toEqual([
      `Refused a large request with 503: bodies in flight hold all ${300 * KiB} bytes`,
    ]);
    moving.send(tail);
    moving.end();
    expect((await served).status).toBe(200);
    expect((await handle(whole(toolsList(350 * KiB)))).status).toBe(200);
  });

  it("frees what a body held when its client leaves", async () => {
    const { handle } = handler({ maxBodyBytesInFlight: 300 * KiB });
    const leaving = upload();
    const left = handle(leaving.request);
    leaving.send(head + "x".repeat(200 * KiB));
    await sleep(50);
    leaving.leave();
    expect((await left).status).toBe(400);
    expect((await handle(whole(toolsList(350 * KiB)))).status).toBe(200);
  });

  it.each([
    ["an X-Redmine-API-Key", credentials.key],
    ["a bearer token", credentials.bearer],
  ])(
    "refuses with 413 a request with %s whose body alone is larger than the budget allows",
    async (_, headers) => {
      const { handle } = handler({ maxBodyBytesInFlight: 32 * KiB, publicUrl, verifier });
      expect(await refusal(await handle(whole(toolsList(100 * KiB), headers)))).toMatchObject({
        status: 413,
        connection: null,
        body: {
          id: null,
          error: { message: `Payload Too Large: Request body must not exceed ${96 * KiB} bytes` },
        },
      });
    },
  );

  it("answers broken JSON past 64 KiB as the MCP SDK does", async () => {
    const { handle } = handler();
    const response = await handle(whole(head + "x".repeat(100 * KiB)));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: -32700, message: "Parse error: Invalid JSON" },
    });
  });

  it("refuses a budget that is not a number of bytes when created", () => {
    expect(() => handler({ maxBodyBytesInFlight: -1 })).toThrow(RangeError);
    expect(() => handler({ maxBodyBytesInFlight: Number.NaN })).toThrow(RangeError);
  });

  it.each(Object.entries(credentials))(
    "reads a %s request's JSON body past 64 KiB once, without cloning the request",
    async (_, headers) => {
      const clone = vi.spyOn(Request.prototype, "clone");
      const { handle } = handler({ publicUrl, verifier });
      const response = await handle(whole(toolsList(100 * KiB), headers));
      expect(response.status).toBe(200);
      expect(clone).not.toHaveBeenCalled();
    },
  );

  it("drops the body stalled longest first, and only as many as the room needs", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { handle } = handler({ maxBodyBytesInFlight: 300 * KiB });
    const first = upload();
    const firstDone = handle(first.request);
    first.send(head + "x".repeat(164 * KiB));
    await sleep(50);
    now += 1000;
    const second = upload();
    const secondDone = handle(second.request);
    second.send(head + "x".repeat(164 * KiB));
    await sleep(50);
    now += 6000;
    expect((await handle(whole(toolsList(214 * KiB)))).status).toBe(200);
    expect((await firstDone).status).toBe(408);
    second.send(tail);
    second.end();
    expect((await secondDone).status).toBe(200);
  });

  it("answers 503 to an upload partway through its body when a body still growing holds the room", async () => {
    const { handle } = handler({ maxBodyBytesInFlight: 300 * KiB });
    const growing = upload();
    const grown = handle(growing.request);
    growing.send(head + "x".repeat(214 * KiB));
    const partway = upload();
    const refused = handle(partway.request);
    partway.send(head + "x".repeat(164 * KiB));
    await sleep(50);
    partway.send("x".repeat(100 * KiB));
    expect(await refusal(await refused)).toMatchObject({ status: 503, retryAfter: "5" });
    growing.send(tail);
    growing.end();
    expect((await grown).status).toBe(200);
  });

  it("answers 408 at the deadline to a stalled body nobody needs the room of, and frees what it held", async () => {
    const { handle, errors } = handler({ maxBodyBytesInFlight: 300 * KiB, bodyTimeoutMs: 300 });
    const stalled = upload();
    const started = Date.now();
    const dropped = handle(stalled.request);
    stalled.send(head + "x".repeat(264 * KiB));
    expect(await refusal(await dropped)).toMatchObject({
      status: 408,
      connection: null,
      body: {
        id: null,
        error: { message: "The request body took longer than 0.3 seconds to arrive." },
      },
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect(errors).toEqual(["The request body took longer than 0.3 seconds to arrive."]);
    expect((await handle(whole(toolsList(350 * KiB)))).status).toBe(200);
  });

  it.each([
    ["a budget of 32 KiB", { maxBodyBytesInFlight: 32 * KiB }, 96 * KiB],
    ["the default budget", {}, 7_056_044],
  ])(
    "with %s, serves a body of exactly the largest size and refuses one byte more with 413",
    async (_, options, largest) => {
      const { handle } = handler(options);
      const exact = toolsList(largest - head.length - tail.length);
      expect((await handle(whole(exact))).status).toBe(200);
      expect(await refusal(await handle(whole(exact + " ")))).toMatchObject({
        status: 413,
        body: {
          error: { message: `Payload Too Large: Request body must not exceed ${largest} bytes` },
        },
      });
    },
  );

  it("serves a body that runs past its declared Content-Length, as main does", async () => {
    const { handle } = handler();
    const sent = upload({ ...credentials.key, "content-length": "100" });
    sent.send(toolsList(100 * KiB));
    sent.end();
    expect((await handle(sent.request)).status).toBe(200);
  });

  const badUtf8 = (pad: number) =>
    new Uint8Array([
      ...new TextEncoder().encode(head + "x".repeat(pad)),
      0xff,
      0xfe,
      0xe2,
      0x82,
      ...new TextEncoder().encode(tail),
    ]);
  const batch = JSON.stringify(
    Array.from({ length: 101 }, (_, id) => ({
      jsonrpc: "2.0",
      id,
      method: "tools/list",
      params: {},
    })),
  );

  it.each([
    ["an empty body", "", 400],
    ["a BOM", "﻿" + toolsList(10), 200],
    ["a BOM before a body past 64 KiB", "﻿" + toolsList(100 * KiB), 200],
    ["invalid UTF-8", badUtf8(10), 200],
    ["invalid UTF-8 past 64 KiB", badUtf8(100 * KiB), 200],
    ["a batch of 101", batch, 400],
  ])("answers %s as main does, whole or two bytes at a time", async (_, body, status) => {
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const { handle } = handler({ publicUrl, verifier });
    for (const headers of Object.values(credentials)) {
      for (const size of [bytes.byteLength || 1, 2]) {
        const sent = upload(headers);
        for (let at = 0; at < bytes.byteLength; at += size)
          sent.sendBytes(bytes.subarray(at, at + size));
        sent.end();
        expect({ headers, size, status: (await handle(sent.request)).status }).toEqual({
          headers,
          size,
          status,
        });
      }
    }
  });

  describe("on Node", () => {
    let close: (() => void) | undefined;
    afterEach(() => close?.());

    async function listen(options: Partial<RedmineMcpHandlerOptions>) {
      const { handle } = handler(options);
      const server = createServer(toNodeListener(handle, () => undefined));
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      close = () => {
        server.closeAllConnections();
        server.close();
      };
      return (head: string) => {
        const socket = tcp((server.address() as AddressInfo).port, "127.0.0.1");
        const answers: string[] = [];
        socket.on("data", (data) => answers.push(String(data)));
        socket.on("error", () => undefined);
        socket.write(
          "POST /mcp HTTP/1.1\r\nHost: localhost:3737\r\nContent-Type: application/json\r\n" +
            "Accept: application/json, text/event-stream\r\nMCP-Protocol-Version: 2025-11-25\r\n" +
            `X-Redmine-API-Key: good-key\r\n${head}\r\n`,
        );
        const answered = async (count: number) => {
          while (answers.join("").split("HTTP/1.1 ").length - 1 < count) await once(socket, "data");
          return answers.join("");
        };
        return { socket, answered };
      };
    }

    const connection = async (head: string) => (await listen({ maxBodyBytesInFlight: 0 }))(head);

    const chunk = (text: string) => `${text.length.toString(16)}\r\n${text}\r\n`;

    it("closes the connection at once after refusing a body by its declared length", async () => {
      const { socket, answered } = await connection(`Content-Length: ${200 * KiB}\r\n`);
      socket.write(head);
      await once(socket, "close");
      expect(await answered(1)).toMatch(/^HTTP\/1\.1 413 [^]*connection: close/i);
    }, 3000);

    it("reads the rest of a body refused mid-read, so the connection serves the next request", async () => {
      const { socket, answered } = await connection("Transfer-Encoding: chunked\r\n");
      socket.write(chunk(head + "x".repeat(100 * KiB)));
      expect(await answered(1)).toMatch(/^HTTP\/1\.1 413 /);
      socket.write(chunk("x".repeat(100 * KiB)) + chunk(tail) + "0\r\n\r\n");
      const small = toolsList(10);
      socket.write(
        "POST /mcp HTTP/1.1\r\nHost: localhost:3737\r\nContent-Type: application/json\r\n" +
          "Accept: application/json, text/event-stream\r\nMCP-Protocol-Version: 2025-11-25\r\n" +
          `X-Redmine-API-Key: good-key\r\nContent-Length: ${small.length}\r\n\r\n${small}`,
      );
      expect((await answered(2)).split("HTTP/1.1 ")[2]).toMatch(/^200 /);
    }, 3000);

    it("closes the connection 5 seconds after a body refused mid-read stops arriving", async () => {
      const { socket, answered } = await connection("Transfer-Encoding: chunked\r\n");
      socket.write(chunk(head + "x".repeat(100 * KiB)));
      expect(await answered(1)).toMatch(/^HTTP\/1\.1 413 /);
      const refused = Date.now();
      await once(socket, "close");
      expect(Date.now() - refused).toBeGreaterThan(4500);
      expect(Date.now() - refused).toBeLessThan(6500);
    }, 8000);

    it("closes the connection 5 seconds after a 503 when the rest of the body never comes", async () => {
      const open = await listen({ maxBodyBytesInFlight: 100 * KiB });
      const holding = open(`Content-Length: ${160 * KiB}\r\n`);
      holding.socket.write(head + "x".repeat(154 * KiB));
      await sleep(100);
      const { socket, answered } = open(`Content-Length: ${160 * KiB}\r\n`);
      socket.write(head + "x".repeat(84 * KiB));
      const answer = await answered(1);
      expect(answer).toMatch(/^HTTP\/1\.1 503 /);
      expect(answer.toLowerCase()).toContain("retry-after: 5");
      const refused = Date.now();
      await once(socket, "close");
      expect(Date.now() - refused).toBeGreaterThan(4500);
      expect(Date.now() - refused).toBeLessThan(6500);
    }, 8000);
  });
});
