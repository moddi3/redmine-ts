# Embed the server

Two functions in `@redmine-ts/mcp` run the same server inside your own program. `createRedmineMcpServer` returns an MCP `Server` for one Redmine credential, which you connect to any transport. `createRedmineMcpHandler` returns a web-standard request handler that serves Streamable HTTP to many users, which is the HTTP server of `--http` without the port. The main entry imports no `node:` modules.

## Serve one user over any transport

`createRedmineMcpServer` takes the same config as `createRedmine` from `@redmine-ts/sdk`, and optionally a second object of server options, and returns an MCP `Server`. Connect it to any transport:

```ts
import { createRedmineMcpServer } from "@redmine-ts/mcp";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

serveStdio(() =>
  createRedmineMcpServer({
    baseUrl: "https://tracker.example.com",
    auth: { apiKey: process.env.REDMINE_API_KEY! },
    version: "7.0",
    access: "no-delete",
  }),
);
```

`access` and `version` choose the tools exactly as the [settings](configuration.md) do. The other config options, such as `fetch`, `timeoutMs`, and `onEvent`, go to the SDK client, except `normalize`. The server keeps it on, whatever the config says, because the tools rely on the SDK's response fixes, such as journals oldest first.

The second argument takes these options:

| Option                     | What it does                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`                    | Enables `path` uploads and `attachments_save`. Pass a files directory from the Node-only `@redmine-ts/mcp/node` entry: `createRedmineMcpServer(config, { files: localFiles("/srv/redmine-files") })`. `localFiles` resolves the directory's symlinks once and throws if the directory does not exist. The main entry never imports file system code, so a server without `files` cannot touch local files. |
| `maxResultBytes`           | Sets the [result budget](tools.md#result-size), as `REDMINE_MCP_MAX_RESULT_BYTES` does. A value under 1,000, over 499,000 or not a whole number throws a `TypeError`.                                                                                                                                                                                                                                      |
| `observe`                  | Gets each request the server sends to Redmine, with its `method`, its `url`, and a `status` that is set once Redmine answers, and each call that the access mode refuses. `createRedmineMcpHandler` uses it to pick the status of an OAuth request.                                                                                                                                                        |
| `dangerouslyRevealApiKeys` | `true` does what `--dangerously-reveal-api-keys` does. The server replaces the credential only when `auth` holds it as a string, as `apiKey` or `bearer`.                                                                                                                                                                                                                                                  |
| `admin`                    | `false` leaves the [tools that need an admin key](tools.md#tools-that-need-an-admin-key) out of `tools/list` and the instructions. Without it, every tool is listed. The CLI and `createRedmineMcpHandler` set it from Redmine's answer.                                                                                                                                                                   |

## Serve many users over HTTP

`createRedmineMcpHandler` takes the same config without `auth` and returns a web-standard `(request: Request) => Promise<Response>`. It reads the key from each request's `X-Redmine-API-Key` header, uses no Node APIs, and runs unchanged on Node, Bun, and Cloudflare Workers, without the `nodejs_compat` flag. It serves every path it receives, so route `/mcp` to it. On Bun:

```ts
import { createRedmineMcpHandler } from "@redmine-ts/mcp";

const handler = createRedmineMcpHandler({
  baseUrl: "https://tracker.example.com",
  version: "7.0",
  access: "no-delete",
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
});

Bun.serve({ hostname: "127.0.0.1", port: 3737, routes: { "/mcp": handler } });
```

The handler takes these options next to the SDK config:

| Option                                  | What it does                                                                                                                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allowedHosts`                          | Hostnames the `Host` header may name, as `--allow-host` does. Set it when you listen on loopback, or when you know every name clients reach the handler by. Without it the handler does not check `Host`.                                                        |
| `allowedOrigins`                        | Hostnames and origins that browser pages may call from, as `--allow-origin` takes them.                                                                                                                                                                          |
| `publicUrl`                             | The public URL of the endpoint. With it, the handler routes the endpoint and the [OAuth paths](authentication.md#endpoints) itself, so give it every request.                                                                                                    |
| `oauth`                                 | Turns OAuth on. Takes `secret`, `previousSecret`, `redmineApp: { clientId, clientSecret }` or `apiKeyLogin: true`, `redminePublicUrl`, `allowedClientHosts`, `store` (see [Grant store](authentication.md#grant-store)), and the required `fetchClientMetadata`. |
| `verifier`                              | Accepts tokens from another authorization server instead: `{ issuer, verify(token) }`, where `verify` returns the Redmine credential, scopes, resource and expiry of a token, or undefined.                                                                      |
| `maxBodyBytesInFlight`, `bodyTimeoutMs` | Set the body budget and the body deadline of [Security defaults](http-server.md#security-defaults).                                                                                                                                                              |
| `maxResultBytes`                        | Sets the [result budget](tools.md#result-size) of every request's server.                                                                                                                                                                                        |
| `onError`                               | Gets the requests that the MCP SDK rejects and the failures outside a tool result, such as an unanswered key check. None of them carries the key.                                                                                                                |

A bad origin entry, or an entry with `*` in `allowedOrigins`, `allowedHosts`, or `oauth.allowedClientHosts`, throws when the handler is created. The key check of [Security defaults](http-server.md#security-defaults) goes through the same `fetch` and `onEvent`, gives up after the shorter of `timeoutMs` and 8 seconds, and reports an unanswered check to `onError`.

## Run on Cloudflare Workers

TLS and the hostname come from Cloudflare:

```ts
import { createRedmineMcpHandler } from "@redmine-ts/mcp";

const handler = createRedmineMcpHandler({
  baseUrl: "https://tracker.example.com",
  access: "read-only",
});

export default {
  fetch: (request: Request) =>
    new URL(request.url).pathname === "/mcp"
      ? handler(request)
      : new Response("Not Found", { status: 404 }),
};
```

`oauth.fetchClientMetadata` is required: it fetches the metadata documents clients name by URL, and the key sets those documents name, so it must not reach the server's own network. On Node, pass `publicFetch` from `@redmine-ts/mcp/node`, which refuses private and special-use addresses; the CLI does. Workers cannot reach private addresses, so pass the global fetch there, and turn on the `global_fetch_strictly_public` compatibility flag: without it, a metadata URL on the Worker's own zone is fetched straight from the zone's origin, past Cloudflare's security settings such as Access; with it, the request goes through Cloudflare's front door like any other. Create the handler on the first request, where the secrets are bound.

## Share the grant store on Workers

Every isolate builds its own handler, so give it a grant store that all isolates share. This adapter keeps one Durable Object per key. [Grant store](authentication.md#grant-store) explains what the store guarantees and why a Durable Object fits where Workers KV does not. Save it as `grant-store.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import type { GrantStore } from "@redmine-ts/mcp";

/** One object per key: its storage calls do not interleave, so get-then-put is atomic. */
export class GrantKey extends DurableObject {
  async consume(ttlSeconds: number): Promise<boolean> {
    const until = await this.ctx.storage.get<number>("until");
    if (until !== undefined && until > Date.now()) return false;
    await this.ctx.storage.put("until", Date.now() + ttlSeconds * 1000);
    await this.ctx.storage.setAlarm(Date.now() + ttlSeconds * 1000);
    return true;
  }
  async has(): Promise<boolean> {
    const until = await this.ctx.storage.get<number>("until");
    return until !== undefined && until > Date.now();
  }
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

export function grantStore(keys: DurableObjectNamespace<GrantKey>): GrantStore {
  return {
    consume: (key, ttlSeconds) => keys.get(keys.idFromName(key)).consume(ttlSeconds),
    has: (key) => keys.get(keys.idFromName(key)).has(),
  };
}
```

Bind the `GrantKey` Durable Object as `GRANTS`, and pass `grantStore` to the handler:

```ts
import { createRedmineMcpHandler } from "@redmine-ts/mcp";
import { grantStore } from "./grant-store.ts";
import type { GrantKey } from "./grant-store.ts";

export { GrantKey } from "./grant-store.ts";

interface Env {
  AUTH_SECRET: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  GRANTS: DurableObjectNamespace<GrantKey>;
}

let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: Env) {
    handler ??= createRedmineMcpHandler({
      baseUrl: "https://tracker.example.com",
      publicUrl: "https://mcp.example.com/mcp",
      access: "no-delete",
      oauth: {
        secret: env.AUTH_SECRET,
        redmineApp: { clientId: env.CLIENT_ID, clientSecret: env.CLIENT_SECRET },
        fetchClientMetadata: (input, init) => fetch(input, init),
        store: grantStore(env.GRANTS),
      },
    });
    return handler(request);
  },
};
```
