import { once } from "node:events";
import { createServer, request as send } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { toNodeListener } from "../../src/node-http.ts";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

/** A node:http server on a free loopback port, around the web-standard handler. */
async function listen(handler: (request: Request) => Promise<Response>) {
  const errors: Error[] = [];
  const server = createServer(toNodeListener(handler, (error) => errors.push(error)));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  close = () => new Promise((resolve) => server.close(() => resolve()));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, errors };
}

describe("toNodeListener", () => {
  it("hands over the method, path, headers, Host included, and body, and returns the response", async () => {
    let seen: Request | undefined;
    let body = "";
    const { url } = await listen(async (request) => {
      seen = request;
      body = await request.text();
      return new Response("created", { status: 201, headers: { "x-answer": "42" } });
    });
    const response = await fetch(`${url}/mcp?x=1`, {
      method: "POST",
      headers: { "x-redmine-api-key": "k", "content-type": "application/json" },
      body: '{"jsonrpc":"2.0"}',
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-answer")).toBe("42");
    expect(await response.text()).toBe("created");
    expect(seen?.method).toBe("POST");
    expect(new URL(seen!.url).pathname + new URL(seen!.url).search).toBe("/mcp?x=1");
    expect(seen?.headers.get("host")).toBe(new URL(url).host);
    expect(seen?.headers.get("x-redmine-api-key")).toBe("k");
    expect(body).toBe('{"jsonrpc":"2.0"}');
  });

  it("streams the response, so each SSE event arrives before the next is written", async () => {
    const encoder = new TextEncoder();
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const { url } = await listen(async () => {
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode("data: one\n\n"));
          await released;
          controller.enqueue(encoder.encode("data: two\n\n"));
          controller.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    });
    const reader = (await fetch(url)).body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: one\n\n");
    release();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: two\n\n");
    expect((await reader.read()).done).toBe(true);
  });

  it("aborts the request's signal when the client goes away mid-response", async () => {
    let aborted!: Promise<unknown>;
    const { url, errors } = await listen(async (request) => {
      aborted = once(request.signal, "abort");
      return new Response(new ReadableStream({ start: (c) => c.enqueue(new Uint8Array([1])) }));
    });
    const call = send(url);
    call.end();
    const [response] = await once(call, "response");
    await once(response, "data");
    call.destroy();
    await aborted;
    expect(errors).toEqual([]);
  });

  it("answers 500 and reports a handler that throws", async () => {
    const { url, errors } = await listen(async () => {
      throw new Error("boom");
    });
    expect((await fetch(url)).status).toBe(500);
    expect(errors.map((error) => error.message)).toEqual(["boom"]);
  });
});
