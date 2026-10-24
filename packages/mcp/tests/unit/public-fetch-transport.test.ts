import { EventEmitter } from "node:events";
import type { LookupAddress } from "node:dns";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vite-plus/test";
import { publicFetch } from "../../src/node.ts";

/**
 * What the fake network answers: the addresses a name resolves to, and the response. The fakes stand
 * in for DNS and the socket only; publicFetch's own lookup check and response handling run as they
 * do against a real server, asynchronously, after the request is sent.
 */
const network = vi.hoisted(() => ({
  addresses: [] as LookupAddress[],
  status: 200,
  rawHeaders: [] as string[],
  body: [] as string[],
  destroyed: 0,
}));

vi.mock("node:dns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:dns")>()),
  lookup: (
    _hostname: string,
    _options: unknown,
    callback: (error: Error | null, addresses: LookupAddress[]) => void,
  ) => setImmediate(() => callback(null, network.addresses)),
}));

vi.mock("node:https", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:https")>()),
  request: (
    url: URL,
    options: {
      lookup: (
        hostname: string,
        options: { all: boolean },
        callback: (error: Error | null) => void,
      ) => void;
    },
    onResponse: (incoming: Readable) => void,
  ) => {
    const sent = Object.assign(new EventEmitter(), {
      end: () =>
        options.lookup(url.hostname, { all: true }, (error) => {
          if (error !== null) return void sent.emit("error", error);
          setImmediate(() => {
            const incoming = Object.assign(
              Readable.from(network.body.map((part) => Buffer.from(part))),
              {
                statusCode: network.status,
                rawHeaders: network.rawHeaders,
              },
            );
            incoming.on("close", () => network.destroyed++);
            onResponse(incoming);
          });
        }),
    });
    return sent;
  },
}));

function answer(status: number, rawHeaders: string[] = [], body: string[] = []): void {
  Object.assign(network, {
    addresses: [{ address: "93.184.215.14", family: 4 }],
    status,
    rawHeaders,
    body,
  });
}

describe("publicFetch over a transport that answers later", () => {
  it.each([204, 205, 304])("resolves a %i without a body", async (status) => {
    answer(status, ["Content-Length", "0"]);
    const response = await publicFetch("https://client.example/metadata.json");
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
  });

  it("rejects, never throws past the promise, when the response cannot be built", async () => {
    answer(101);
    await expect(publicFetch("https://client.example/metadata.json")).rejects.toThrow(RangeError);
    answer(200, ["Bad Header", "x"]);
    const destroyedBefore = network.destroyed;
    await expect(publicFetch("https://client.example/metadata.json")).rejects.toThrow(TypeError);
    await vi.waitFor(() => expect(network.destroyed).toBeGreaterThan(destroyedBefore));
  });

  it("streams an ordinary answer", async () => {
    answer(200, ["Content-Type", "application/json"], ['{"client_id":', '"x"}']);
    const response = await publicFetch("https://client.example/metadata.json");
    expect(await response.json()).toEqual({ client_id: "x" });
  });

  it.each([
    ["fec0::1", 6, "deprecated site-local"],
    ["64:ff9b:1::a9fe:a9fe", 6, "local-use NAT64 of 169.254.169.254"],
    ["192.88.99.1", 4, "6to4 relay anycast"],
    ["::ffff:127.0.0.1", 6, "IPv4-mapped loopback"],
    ["64:ff9b::a9fe:a9fe", 6, "well-known NAT64"],
    ["fc00::1", 6, "unique local"],
  ])("refuses a name that resolves to %s (%s, %s)", async (address, family) => {
    Object.assign(network, { addresses: [{ address, family }], status: 200 });
    await expect(publicFetch("https://client.example/metadata.json")).rejects.toThrow(
      "client.example does not resolve to public addresses only",
    );
  });

  it("refuses a name when any one of its addresses is not public", async () => {
    Object.assign(network, {
      addresses: [
        { address: "2606:4700:4700::1111", family: 6 },
        { address: "10.0.0.7", family: 4 },
      ],
    });
    await expect(publicFetch("https://client.example/metadata.json")).rejects.toThrow(
      "does not resolve to public addresses only",
    );
  });

  it("connects to a name whose addresses are all public", async () => {
    answer(200, [], ["{}"]);
    network.addresses = [{ address: "2606:4700:4700::1111", family: 6 }];
    expect((await publicFetch("https://client.example/metadata.json")).status).toBe(200);
  });
});
