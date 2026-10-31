# HTTP server reference

This page lists how `redmine-mcp --http` and `createRedmineMcpHandler` answer requests, the limits they apply, and how browser clients reach them. They share the request handling, so the answers, the body limits, and CORS work the same in both. The CLI also owns the process and the socket. It picks the listening address, sets up the `Host` check, and stops on a signal. A program that embeds the handler does those itself, with the options in [Embed the server](embedding.md#serve-many-users-over-http). [Run a shared server for claude.ai and ChatGPT](http-and-oauth.md) is the setup guide.

## Protocol and answers

The server speaks the 2026-07-28 protocol, and serves clients on the 2025 revisions without sessions: each request stands alone, and `GET` and `DELETE` on `/mcp` answer 405. The access mode and the declared version apply to every request, as they do over stdio. In the CLI, `SIGINT` or `SIGTERM` lets requests in flight finish and then stops the server. A second signal stops it at once.

| Request                                                                                           | Answer                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| No `X-Redmine-API-Key` header, or an empty one                                                    | 401, with a JSON-RPC error that names the header. With [OAuth](authentication.md), a 401 with a `Bearer` challenge. |
| An `Origin` that `--allow-origin` does not list                                                   | 403.                                                                                                                |
| A `Host` that is not one of the server's names                                                    | 403, on a loopback address or with `--allow-host`. See [Security defaults](#security-defaults).                     |
| A path other than `/mcp`                                                                          | 404. With `REDMINE_MCP_PUBLIC_URL`, the server serves that URL's path and the OAuth paths instead.                  |
| A key Redmine rejects, with a body over 64 KiB or one still arriving after a second               | 401 with id `null`, after one `GET /users/current.json`. The server reads no more of the body.                      |
| A key Redmine rejects, with a smaller body that arrives at once                                   | The tool call returns an error result with Redmine's 401.                                                           |
| A key with a body over 64 KiB or one still arriving after a second, while Redmine does not answer | 503 with id `null`. See [Security defaults](#security-defaults).                                                    |
| A body still arriving 300 seconds after the server began reading it                               | 408 with id `null`. `bodyTimeoutMs` changes the time. See [Security defaults](#security-defaults).                  |
| A body that stopped growing, when another request needs the room it holds in the body budget      | 408 with id `null`.                                                                                                 |
| A body past 64 KiB while bodies that are still growing hold the whole budget                      | 503 with id `null` and `Retry-After: 5`, even partway through the body.                                             |
| A body over about 6.7 MiB, or over the budget plus 64 KiB when `maxBodyBytesInFlight` is smaller  | 413 with id `null`.                                                                                                 |
| An OAuth token Redmine no longer accepts                                                          | 401 `invalid_token` with the `Bearer` challenge, so the client refreshes or signs in again.                         |
| A call the OAuth token's scope does not allow                                                     | 403 `insufficient_scope`, naming the scopes the call needs, if the server's own mode allows the call.               |

The 401 for a missing key and the 403s for `Origin` and `Host` are JSON-RPC errors. The error carries the request's `id` when the body is a single request, declares a `Content-Length` of at most 64 KiB, and arrives within a second. To refuse a request, the server does not read a larger or chunked body and does not wait longer for a slow one, so their errors have a `null` id. A notification, a batch, or a body that is not JSON has no single id, so its error has a `null` id too, as JSON-RPC 2.0 does for an id it cannot detect. The 401 for a key Redmine rejects, the 503 for an unanswered check, and the 408, 503 and 413 answers about the body always have a `null` id, because the server gives them without having read the whole body.

## Security defaults

- The CLI listens on `127.0.0.1`. To listen anywhere else, pass the address with `--host`.
- In the CLI on a loopback address, the `Host` header must name `localhost`, `127.0.0.1`, `[::1]`, the address itself, the host of `REDMINE_MCP_PUBLIC_URL`, or a hostname that `--allow-host` lists. A web page that rebinds its own domain to your machine sends its domain as `Host`, so the server refuses it. On any other address, such as `0.0.0.0` in a container, the server cannot know every name its clients use, so it checks `Host` only when `--allow-host` is given. The handler checks `Host` only against its `allowedHosts` option.
- A request with an `Origin` header gets 403 unless `--allow-origin`, or `allowedOrigins` in the handler, lists it. Browsers send `Origin`. Command-line and desktop clients do not, so they pass. See [Browser clients and CORS](#browser-clients-and-cors).
- Before Redmine accepts a key, the server reads at most 64 KiB of the body and waits at most a second for it. Past either, it checks the key with one `GET /users/current.json` and reads nothing more until Redmine answers. A key Redmine refuses gets 401. When Redmine does not answer the check within 8 seconds, or answers with an error other than 401, the request gets 503, even a `tools/list`. Most tool calls are smaller and arrive at once, so they cost no extra call. `initialize` and `tools/list` ask Redmine about the key once to leave out the [tools that need an admin key](tools.md#tools-that-need-an-admin-key), and list every tool when Redmine refuses the key or does not answer.
- A key that Redmine accepts, or a valid OAuth token, may send a body of up to about 6.7 MiB, enough for a 5 MiB `attachments_upload` in base64.
- Bodies that are still arriving share a budget of 32 MiB, which the `maxBodyBytesInFlight` option of `createRedmineMcpHandler` changes. The default lets four bodies at the limit arrive at once. A body that needs room takes it from bodies that have not grown by 128 KiB in the last 5 seconds, and those get 408. When every other body is still growing, the request gets 503 with `Retry-After: 5`.
- Every body must arrive within 300 seconds of when the server begins reading it, or it gets 408. The `bodyTimeoutMs` option changes the time. A 6.7 MiB upload must arrive at about 23 KiB/s or faster.
- The budget does not tell users apart, and it does not cover the first 64 KiB of each body or the connections themselves. On a server with open registration or OAuth sign-ins, cap the connections of one client address in a proxy, such as with nginx's `limit_conn`.
- On Cloudflare Workers, one isolate has 128 MB. Keep large uploads to about three at a time per isolate.
- A client whose JSON encoder escapes `/`, as PHP's `json_encode` does by default, makes a 5 MB base64 upload about 109 KB longer, which goes over the limit and gets 413. Send such files a little smaller, or turn the escaping off.
- The CLI speaks plain HTTP. Without TLS, the API key crosses the network in clear text, so for remote use put a proxy that terminates TLS in front of the server and keep the server on loopback, as [Put TLS in front of the server](http-and-oauth.md#put-tls-in-front-of-the-server) shows.

[HTTP server limits and the measurements behind them](../../packages/mcp/docs/limits.md) explains why each limit exists and what it costs, with the memory under stalled uploads, the connection after a refusal, and the peaks measured on Workers.

## Browser clients and CORS

A page in a browser can call the server only when the server answers its CORS preflight. `--allow-origin` enables that. A request from a listed origin gets 204 for its `OPTIONS` preflight and CORS headers on every response, so a web inspector or a web app can call `/mcp` directly.

```sh
redmine-mcp --http --allow-origin https://app.example.com --allow-origin localhost
```

The flag takes a hostname or an origin. `localhost` admits `http://localhost:6274`, `https://localhost`, and any other scheme and port on that hostname, as the MCP SDK's check does. `https://app.example.com` admits exactly that scheme, host, and port, and refuses `http://app.example.com` and `https://app.example.com:8443`. Prefer the origin form: another service on the same host is a different origin. Write the origin as a browser does, in lowercase, with no path and no trailing slash. The server answers with the requesting origin, never `*`, and with `Vary: Origin`. It sends no `Access-Control-Allow-Credentials`, because the key travels in a header and there are no cookies. A request from another origin still gets 403 without CORS headers, and a request without `Origin` is served as before.

The preflight allows `POST`, the only method `/mcp` serves, and the headers the 2026-07-28 transport sends (`Content-Type`, `Accept`, `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`) plus `Authorization` and `X-Redmine-API-Key`. Responses expose `WWW-Authenticate`, so a page can follow an OAuth challenge. The server issues no session id. The `Host` check on loopback applies to preflights too. The OAuth metadata, token and registration endpoints answer any origin, as they carry no cookie and no key.

CORS means that a page on an allowed origin holds the user's Redmine API key and acts as that user. Allow only origins whose code you trust, and prefer an origin to a hostname. CORS does not open the port. The CLI still listens on `127.0.0.1` by default, and the `Host` check still refuses a rebound domain.
