import { once } from "node:events";
import { createServer } from "node:http";
import { connect as tcp } from "node:net";
import type { AddressInfo, Socket } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createBodyBudget } from "../../src/body-budget.ts";
import type { BodyBudget, BodyRead } from "../../src/body-budget.ts";
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
    expect(await refusal(await left)).toMatchObject({
      status: 400,
      body: {
        id: null,
        error: { code: -32700, message: "Parse error: the request body could not be read" },
      },
    });
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
  ])(
    "answers %s as main does, whole or two bytes at a time",
    async (_, body, status) => {
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
    },
    20_000,
  );

  it("answers a large body of invalid UTF-8 that is not JSON from the bytes sent, as main does", async () => {
    const { handle } = handler();
    const sent = upload();
    sent.sendBytes(new Uint8Array(3_000_000).fill(0xff));
    sent.end();
    const response = await handle(sent.request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: -32700, message: "Parse error: Invalid JSON" },
    });
  });

  it("holds 32 MiB of bodies in flight by default", async () => {
    const { handle, errors } = handler();
    const piece = new Uint8Array(7_000_000).fill(0x41);
    const uploads = Array.from({ length: 5 }, () => upload());
    const answers = uploads.map((sent) => handle(sent.request));
    for (const sent of uploads) {
      sent.sendBytes(piece);
      await sleep(20);
    }
    expect((await answers[4]!).status).toBe(503);
    expect(errors).toEqual([
      `Refused a large request with 503: bodies in flight hold all ${32 * 1024 * KiB} bytes`,
    ]);
    for (const sent of uploads.slice(0, 4)) sent.leave();
    await Promise.all(answers);
  }, 10_000);

  it("gives a body 300 seconds by default", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { handle } = handler({ publicUrl, verifier });
      const sent = upload(credentials.bearer);
      let answer: Response | undefined;
      void handle(sent.request).then((response) => (answer = response));
      sent.send(head);
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(299_999);
      expect(answer).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(answer?.status).toBe(408);
      expect(await answer?.json()).toMatchObject({
        error: { message: "The request body took longer than 300 seconds to arrive." },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  describe("on Node", () => {
    let close: (() => void) | undefined;
    afterEach(() => close?.());

    async function listen(options: Partial<RedmineMcpHandlerOptions>, keepAliveTimeout?: number) {
      const { handle } = handler(options);
      const server = createServer(toNodeListener(handle, () => undefined));
      if (keepAliveTimeout !== undefined) server.keepAliveTimeout = keepAliveTimeout;
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      close = () => {
        server.closeAllConnections();
        server.close();
      };
      const port = (server.address() as AddressInfo).port;
      const open = (head: string) => {
        const socket = tcp(port, "127.0.0.1");
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
      return { port, open };
    }

    const chunk = (text: string) => `${text.length.toString(16)}\r\n${text}\r\n`;

    /**
     * Keeps sending 1 KiB every 250 ms after the answer, and resolves with how long the server took to
     * close the connection. Node closes it once it has read nothing for keepAliveTimeout plus a second.
     */
    async function closedWhileSending(socket: Socket, piece: string): Promise<number> {
      const answeredAt = Date.now();
      const sending = setInterval(() => socket.write(piece), 250);
      await new Promise((resolve) => socket.once("close", resolve));
      clearInterval(sending);
      return Date.now() - answeredAt;
    }

    it("answers 413 by declared length to a fetch() still sending the body, every time", async () => {
      const { port } = await listen({});
      const body = toolsList(20 * 1024 * KiB);
      for (let run = 0; run < 10; run++) {
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2025-11-25",
            "x-redmine-api-key": "good-key",
          },
          body,
        });
        expect({ run, status: response.status, body: await response.json() }).toMatchObject({
          run,
          status: 413,
          body: { id: null, error: { message: expect.stringContaining("Payload Too Large") } },
        });
      }
    }, 30_000);

    it("reads the rest of a body refused mid-read, so the connection serves the next request", async () => {
      const { open } = await listen({ maxBodyBytesInFlight: 0 });
      const { socket, answered } = open("Transfer-Encoding: chunked\r\n");
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

    it("reads and drops a body refused with 413 for 5 seconds, then stops reading it", async () => {
      const { open } = await listen({ maxBodyBytesInFlight: 0 }, 1000);
      const { socket, answered } = open("Transfer-Encoding: chunked\r\n");
      socket.write(chunk(head + "x".repeat(100 * KiB)));
      expect(await answered(1)).toMatch(/^HTTP\/1\.1 413 /);
      const closed = await closedWhileSending(socket, chunk("x".repeat(KiB)));
      expect(closed).toBeGreaterThan(4500);
      expect(closed).toBeLessThan(8500);
    }, 12_000);

    it("reads and drops a body refused with 503 for 5 seconds, then stops reading it", async () => {
      const { open } = await listen({ maxBodyBytesInFlight: 100 * KiB }, 1000);
      const holding = open(`Content-Length: ${160 * KiB}\r\n`);
      holding.socket.write(head + "x".repeat(154 * KiB));
      await sleep(100);
      const { socket, answered } = open(`Content-Length: ${160 * KiB}\r\n`);
      socket.write(head + "x".repeat(84 * KiB));
      const answer = await answered(1);
      expect(answer).toMatch(/^HTTP\/1\.1 503 /);
      expect(answer.toLowerCase()).toContain("retry-after: 5");
      const closed = await closedWhileSending(socket, "x".repeat(KiB));
      expect(closed).toBeGreaterThan(4500);
      expect(closed).toBeLessThan(8500);
    }, 12_000);
  });
});

describe("the buffer a body is charged for", () => {
  const MiB = 1024 * KiB;
  const free = 64 * KiB;
  const budget = (limit: number, maxBody = 8 * MiB) =>
    createBodyBudget({ limit, timeoutMs: 60_000, maxBody, free });
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  /** A body read by `budget`, sent in chunks of the sizes given to `send`. */
  function arriving(budget: BodyBudget, declared?: number) {
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const request = new Request(publicUrl, {
      method: "POST",
      headers: declared === undefined ? {} : { "content-length": String(declared) },
      body: new ReadableStream<Uint8Array>({ start: (controller) => void (body = controller) }),
      duplex: "half",
    });
    return {
      read: budget.read(request),
      send: async (...sizes: number[]) => {
        for (const size of sizes) body.enqueue(new Uint8Array(size));
        await settle();
      },
      end: () => body.close(),
    };
  }

  /** Whether a whole body charged `bytes` past its free 64 KiB gets in now. */
  async function fits(budget: BodyBudget, bytes: number): Promise<boolean> {
    const probe = arriving(budget);
    await probe.send(free + bytes);
    probe.end();
    return (await probe.read).kind !== "refused";
  }

  const capacity = (read: BodyRead) => (read.kind === "other" ? read.bytes.buffer.byteLength : -1);

  it("charges a body with a truthful Content-Length for a buffer of exactly that length", async () => {
    const limited = budget(200 * KiB);
    const body = arriving(limited, 150 * KiB);
    await body.send(64 * KiB, 40 * KiB, 40 * KiB);
    expect(await fits(limited, 114 * KiB)).toBe(true);
    expect(await fits(limited, 114 * KiB + 1)).toBe(false);
    await body.send(6 * KiB);
    body.end();
    expect(capacity(await body.read)).toBe(150 * KiB);
  });

  it("charges a body without a Content-Length for its buffer, which doubles as the body grows", async () => {
    const limited = budget(300 * KiB);
    const body = arriving(limited);
    await body.send(64 * KiB, 8 * KiB);
    expect(await fits(limited, 236 * KiB)).toBe(true);
    expect(await fits(limited, 236 * KiB + 1)).toBe(false);
    await body.send(64 * KiB);
    expect(await fits(limited, 108 * KiB)).toBe(true);
    expect(await fits(limited, 108 * KiB + 1)).toBe(false);
    body.end();
    expect(capacity(await body.read)).toBe(256 * KiB);
  });

  it("caps the buffer at the largest body", async () => {
    const body = arriving(budget(MiB, 200 * KiB));
    await body.send(64 * KiB, 8 * KiB, 64 * KiB);
    body.end();
    expect(capacity(await body.read)).toBe(200 * KiB);
  });

  it("charges nothing for a body within its first 64 KiB, however it is split", async () => {
    const body = arriving(budget(0));
    await body.send(40 * KiB, 20 * KiB, 4 * KiB);
    body.end();
    expect(capacity(await body.read)).toBe(64 * KiB);
  });

  it("charges nothing for a body within its first 64 KiB while other bodies hold the whole budget", async () => {
    const limited = budget(100 * KiB);
    const other = arriving(limited);
    await other.send(free + 100 * KiB);
    expect(await fits(limited, 1)).toBe(false);
    const body = arriving(limited);
    await body.send(40 * KiB, 20 * KiB, 4 * KiB);
    body.end();
    expect(capacity(await body.read)).toBe(64 * KiB);
    other.end();
    expect(capacity(await other.read)).toBe(free + 100 * KiB);
  });

  it("does not size the buffer from the declared length before the bytes arrive", async () => {
    const limited = budget(MiB);
    const body = arriving(limited, MiB);
    await body.send(70 * KiB);
    expect(await fits(limited, MiB - 6 * KiB)).toBe(true);
    expect(await fits(limited, MiB - 6 * KiB + 1)).toBe(false);
  });

  it("leaves no timer behind once a body has arrived", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const body = arriving(budget(MiB));
      await body.send(100 * KiB);
      body.end();
      await body.read;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("when another body needs the room", () => {
    let now = 0;
    beforeEach(() => {
      now = Date.now();
      vi.spyOn(Date, "now").mockImplementation(() => now);
    });

    it("drops a body that grew less than 128 KiB in 5 seconds, and frees its room once", async () => {
      const limited = budget(256 * KiB);
      const slow = arriving(limited);
      await slow.send(100 * KiB);
      now += 3000;
      await slow.send(100 * KiB);
      now += 3000;
      const next = arriving(limited);
      await next.send(free + 200 * KiB);
      expect(await slow.read).toMatchObject({ kind: "refused", refusal: "stalled" });
      expect(await fits(limited, 56 * KiB)).toBe(true);
      expect(await fits(limited, 56 * KiB + 1)).toBe(false);
    });

    it("keeps a body that grew 128 KiB within 5 seconds", async () => {
      const limited = budget(256 * KiB);
      const fast = arriving(limited);
      await fast.send(100 * KiB);
      now += 3000;
      await fast.send(130 * KiB);
      now += 3000;
      expect(await fits(limited, 200 * KiB)).toBe(false);
      fast.end();
      expect((await fast.read).kind).toBe("other");
    });

    it("refuses with 503 a stalled body that needs more room, instead of dropping it for itself", async () => {
      const limited = budget(256 * KiB);
      const slow = arriving(limited);
      await slow.send(100 * KiB);
      now += 2000;
      await slow.send(100 * KiB);
      now += 1000;
      await arriving(limited).send(free + 10 * KiB);
      now += 2500;
      await slow.send(10 * KiB);
      slow.end();
      expect(await slow.read).toMatchObject({ kind: "refused", refusal: "over_budget" });
    });
  });
});
