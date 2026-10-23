// node:http in front of the web-standard handler. The MCP SDK's own adapter, @modelcontextprotocol/node,
// brings Hono for it; the CLI needs only the translation, both ways.

import type { RequestListener } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Streams both bodies, so an SSE response reaches the client event by event, and a connection that
 * closes before the response ends aborts the request's signal.
 */
export function toNodeListener(
  handler: (request: Request) => Promise<Response>,
  onError: (error: Error) => void,
): RequestListener {
  return (req, res) => {
    const closed = new AbortController();
    res.once("close", () => {
      if (!res.writableFinished) closed.abort();
    });
    const method = req.method ?? "GET";
    const serve = async (): Promise<void> => {
      // The URL's origin is never read; Host and Origin travel as headers, and checks read them there.
      const request = new Request(new URL(req.url ?? "/", "http://localhost"), {
        method,
        headers: Object.entries(req.headersDistinct).flatMap(([name, values = []]) =>
          values.map((value): [string, string] => [name, value]),
        ),
        signal: closed.signal,
        ...(method === "GET" || method === "HEAD"
          ? {}
          : { body: Readable.toWeb(req) as ReadableStream, duplex: "half" as const }),
      });
      const response = await handler(request);
      res.writeHead(response.status, [...response.headers].flat());
      if (response.body === null) res.end();
      else await pipeline(Readable.fromWeb(response.body), res);
    };
    serve().catch((error: unknown) => {
      if (closed.signal.aborted) return;
      onError(error instanceof Error ? error : new Error(String(error)));
      if (res.headersSent) res.destroy();
      else res.writeHead(500).end();
    });
  };
}
