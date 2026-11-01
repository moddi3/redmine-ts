# HTTP server limits and the measurements behind them

[Security defaults](../../../docs/mcp/http-server.md#security-defaults) lists the rules the HTTP server applies to request bodies and client fetches. This page explains why each rule exists and what it costs, with the measurements behind it. It covers `redmine-mcp --http` and `createRedmineMcpHandler`, which share the code.

## The key check before large or slow bodies

A request with the `X-Redmine-API-Key` header passes its body to the MCP server until the body grows past 64 KiB or is still arriving after a second. Then the server sends Redmine one `GET /users/current.json` with that key, and reads nothing more until Redmine answers. A key Redmine refuses gets 401. Most tool calls are smaller and arrive at once, so they cost no extra call. `initialize`, `server/discover`, and `tools/list` ask Redmine about the key once, whatever their size, to leave out the tools that need an admin key. A large or slow one of these requests shares that call with this check. They list every tool when Redmine refuses the key or does not answer, so they succeed with any key. A tool call with a wrong key still shows Redmine's 401 as the tool's error result.

That check makes large and slow requests depend on Redmine. When Redmine does not answer the check within 8 seconds, or answers it with an error other than 401, a request with a body over 64 KiB, or one still arriving after a second, gets 503. Even a `tools/list` gets it. Each 503 writes one line to stderr, and a refused key writes none. So a client that keeps sending large bodies during an outage makes the server log one line per request. A small `initialize` or `tools/list` during an outage lists every tool and writes one line too.

## The body limit

A key that Redmine accepts, or a valid OAuth token, may send a body of up to about 6.7 MiB, enough for a 5 MiB `attachments_upload` in base64. The server reads each body once, as bytes, into a buffer. The buffer takes one to two bytes per byte received, however the client splits the body into packets. Node adds its own cost per packet. With 50 connections each sending one byte every 2 ms, live heap was about 6 bytes per byte received on Node and about 1 on Bun.

A client whose JSON encoder escapes `/`, as PHP's `json_encode` does by default, makes a 5 MB base64 upload about 109 KB longer. The longer body goes over the limit and gets 413.

## The body budget

Bodies that are still arriving share a budget of 32 MiB, which the `maxBodyBytesInFlight` option of `createRedmineMcpHandler` changes. The budget charges each body for the buffer that the server reads it into. A buffer doubles as its body grows, up to 1 MiB, and then grows 1 MiB at a time. So a buffer is never more than 1 MiB ahead of what has arrived. When the `Content-Length` is truthful, the buffer ends at the body's exact size, so the budget charges a body at the limit in full once it passes 6 MiB. The budget does not charge the first 64 KiB of each body, so small requests never meet the budget.

A body that needs room the others hold takes it from bodies that have not grown by 128 KiB in the last 5 seconds. It takes from the longest-stalled body first, and those bodies get 408. So while the budget is full, the server can drop an upload slower than 25.6 KiB/s. When every other body is still growing, the request gets 503 with `Retry-After: 5`, even partway through its body.

The default budget lets four bodies at the limit arrive at once. Five 5 MB uploads sent together at 1 MiB/s each got four 200s and one 503. The Node client got that 503 after it sent 6 MiB of its body. Six uploads got four 200s and two 503s, after 5 and 6 MiB. Over loopback at full speed, all five and all six uploads succeeded, because each body arrived in a fraction of a second.

A `maxBodyBytesInFlight` under about 6.7 MiB lowers the largest body accepted to the budget plus 64 KiB. A larger body gets 413. A budget of 0 answers 413 to any body over 64 KiB.

### What the budget saved

One test stopped 60 uploads at 95% of the limit. A Node server on the release before the budget held 794 MB of live heap, and 310 seconds later it had answered none of the uploads. Live heap here means V8's heap and external memory after a full collection. With the budget, four uploads filled it, and the other 56 got 503 within 2 seconds. Live heap stayed at most 29 MB above idle until the four stalled bodies got 408 at 300 seconds. Then live heap went back to idle. A 1 MiB upload from another user fit beside them and succeeded. On Bun, the release before the budget held 778 MB, and the release with the budget held 29 MB above idle. A second test sent a 6.7 MiB upload at 128 KiB/s while four stalled bodies filled the budget. Once the upload passed 5 MiB, it dropped one of the stalled bodies, and it succeeded after 55 seconds.

### What the budget does not cover

The budget does not cover the first 64 KiB of each body or the state of each connection. On Node, 1,000 connections that had each sent 64 KiB and stopped held 84 MB of live memory, and 63 MB of that was their buffers. The release before the budget held 154 MB. To bound that memory, cap the connections of one client in a proxy, such as with nginx's `limit_conn`.

The budget bounds bodies while they arrive. It does not bound the memory that a request takes afterwards to parse its message, decode the file, and send it to Redmine. In two runs, five concurrent 5 MB uploads took a Node server from 94 MB of RSS to 370 to 371 MB.

The budget does not tell users apart. The server never drops a body as stalled while it grows by at least 128 KiB every 5 seconds, which is 25.6 KiB/s. So about 10 such bodies, 2.1 Mbit/s in all, can hold the budget. The budget charges each body for its buffer, which runs up to 1 MiB ahead of what the client has sent. So those bodies hold the budget once each passes about 3 MiB. Two five-minute tests had one key keep 10 bodies growing at 26 KiB/s. Of another user's 15 uploads of 6.7 MiB, 8 and 11 got 503. Of that user's 60 uploads of 1 MiB, 19 and 12 got 503. On a server with open registration or OAuth sign-ins, cap the connections of one client address in a proxy, such as with nginx's `limit_conn`. That cap bounds how many bodies one client keeps growing. A share of the budget per credential is on the [roadmap](https://github.com/moddi3/redmine-ts/blob/main/docs/roadmap.md).

## The body deadline

Every body must arrive within 300 seconds of when the server begins reading it. That deadline is Node's own request timeout. Bun and Workers do not have that timeout, so the server applies it on every runtime. The `bodyTimeoutMs` option changes the deadline, and a body still arriving when it passes gets 408. A 6.7 MiB upload must arrive at about 23 KiB/s or faster to make it.

## The connection after a refusal

After a 408, 503, or 413 partway through a body, the server reads and drops the rest of the body for 5 seconds. A client that is still sending then gets the answer instead of a reset. After those 5 seconds, the server stops reading. The server does not close the connection itself. The runtime closes it once the runtime has read nothing for its idle timeout.

| Runtime and setting                       | Client sends nothing more | Client keeps sending 1 KiB a second |
| ----------------------------------------- | ------------------------- | ----------------------------------- |
| Node, default `keepAliveTimeout` of 5 s   | Closed after 6 s          | Closed after 11 s                   |
| Node, `keepAliveTimeout` of 600 s         | Closed after 328 to 330 s | Closed after 328 to 330 s           |
| Bun `node:http`, default                  | Closed after 6 s          | Closed after 10 s                   |
| Bun `node:http`, `keepAliveTimeout` 600 s | Closed after 298 to 330 s | Closed after 298 to 330 s           |
| `Bun.serve`, default `idleTimeout`        | Closed after 12 s         | Closed after 12 s                   |
| `Bun.serve`, `idleTimeout` of 30          | Closed after 32 s         | Closed after 32 s                   |

Times count from the answer. With a `keepAliveTimeout` of 600 seconds, Node's 300-second request timeout ends the connection. On Workers the connection ends with the answer, so the server reads and drops nothing. On Node, about 250 such open connections held 3 to 4 MB of live memory in all, and none of their bodies. When the server refuses a body by its declared length, it does not read the body at all. Each of these 408s and 503s writes one line to stderr.

## On Cloudflare Workers

One isolate has 128 MB. In workerd, three concurrent 5 MB uploads peaked at 56 to 80 MB of isolate memory, four peaked at 111 to 141 MB, and five peaked at 58 to 141 MB. On the release before the budget, the same uploads peaked at 86 to 92, 119 to 132, and 202 to 204 MB. Those peaks come from 3 to 5 samples per run, so the true peaks may be higher. The measurements come from before the budget charged each body's buffer and grew it 1 MiB at a time. Keep large uploads to about three at a time per isolate.

## Metadata document and key set fetches

With OAuth on, a sign-in can make the server fetch a Client ID Metadata Document. A token request of a client with keys can make the server fetch a key set. [How the server bounds metadata fetches](../../../docs/mcp/authentication.md#how-the-server-bounds-metadata-fetches) lists the bounds. A fetch goes only to a public address and follows no redirect. It stops after 5 seconds, or after 5 KiB for a document and 16 KiB for a key set. One process or isolate runs at most 8 document fetches and 4 key set fetches at once.

A caller can still keep the 8 document fetches busy. Until the caller stops, a client whose document the server has not fetched within the hour gets the 503 page. Meanwhile, a client may have removed a redirect URI from its document. That redirect URI can still start a sign-in for up to an hour after the server last fetched the document, instead of 5 minutes. Section 8.4 of the draft asks servers to consider such changes.

With `--allow-client`, the fetches go only to the hosts you listed, so a caller cannot hold each one for 5 seconds with a slow server of their own. That holds as long as the runtime finishes the fetch of a request whose client disconnects. Cloudflare's documentation says Workers may cancel that work instead. If they do, a caller who opens the sign-in page and disconnects holds a slot for 6 seconds, even with the flag. A caller who repeats that about every 6 seconds for a known client keeps the server from refreshing that client's kept document. The client's sign-ins then wait up to 6 seconds and get the kept document until it is an hour old. After that, they get the 503 page. To limit how often one address can open the sign-in page, rate-limit `GET` on the authorize path at the proxy. For `https://mcp.example.com/mcp`, that path is `/mcp/oauth/authorize`.

Key sets have the same fallback. While every key set fetch is held, a set fetched within the hour still serves a token request whose assertion names a `kid` in that set. Without `--allow-client`, a person who signs in with a metadata document of their own can name 4 slow key set URLs and hold every key set fetch. Meanwhile, another client with keys gets 503 if the server has not fetched its set within the hour, or if its new key is not in that set. With the flag, only documents on the listed hosts get that far, so only those hosts choose the key set URLs.
