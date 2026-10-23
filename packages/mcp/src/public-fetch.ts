// A fetch for URLs that clients choose, such as Client ID Metadata Documents, which must not reach the
// server's own network. Node only: it checks the addresses a name resolves to inside the connection's
// own lookup, so a name cannot pass the check and then connect somewhere private.

import { lookup } from "node:dns";
import type { LookupAddress, LookupOptions } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

/** Loopback, private, link-local, shared, documentation, multicast and reserved ranges. */
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv4");
}
// BlockList checks IPv4-mapped addresses against the IPv4 ranges. NAT64, 6to4 and Teredo addresses
// embed an IPv4 address it does not check, so they are refused whole.
for (const [network, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv6");
}

function isPublic(address: string): boolean {
  return !NON_PUBLIC.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** dns.lookup that fails unless every address the name has is public. */
function publicLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    if (addresses.length === 0 || !addresses.every(({ address }) => isPublic(address))) {
      return callback(new Error(`${hostname} does not resolve to public addresses only`), []);
    }
    if (options.all) return callback(null, addresses);
    const [first] = addresses;
    callback(null, first!.address, first!.family);
  });
}

/**
 * GET over https to public addresses only, without following redirects. Pass it as
 * `oauth.fetchClientMetadata` on Node; the CLI does.
 */
export const publicFetch: typeof fetch = (input, init) => {
  const outgoing = new Request(input, init);
  const url = new URL(outgoing.url);
  if (url.protocol !== "https:" || outgoing.method !== "GET") {
    return Promise.reject(new TypeError("publicFetch sends only GET over https"));
  }
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) !== 0 && !isPublic(literal)) {
    return Promise.reject(new TypeError(`${url.hostname} is not a public address`));
  }
  return new Promise((resolve, reject) => {
    const sent = request(
      url,
      {
        method: "GET",
        headers: Object.fromEntries(outgoing.headers),
        lookup: publicLookup,
        signal: outgoing.signal,
      },
      (incoming) => {
        const status = incoming.statusCode ?? 502;
        const headers = new Headers();
        for (let at = 0; at < incoming.rawHeaders.length; at += 2) {
          headers.append(incoming.rawHeaders[at]!, incoming.rawHeaders[at + 1]!);
        }
        const empty = status === 204 || status === 304;
        if (empty) incoming.resume();
        resolve(
          new Response(empty ? null : (Readable.toWeb(incoming) as ReadableStream), {
            status,
            headers,
          }),
        );
      },
    );
    sent.on("error", reject);
    sent.end();
  });
};
