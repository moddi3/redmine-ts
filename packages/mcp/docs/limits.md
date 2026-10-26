# HTTP server limits and the measurements behind them

The [MCP README](../README.md#security-defaults) lists the rules the HTTP server applies to request bodies and client fetches. This page explains why each rule exists, what it costs, and what it was measured against. It covers `redmine-mcp --http` and `createRedmineMcpHandler`, which share the code.

## The key check before large or slow bodies

A request with the `X-Redmine-API-Key` header passes its body to the MCP server until the body grows past 64 KiB or is still arriving after a second. Then the server asks Redmine for `GET /users/current.json` with that key, once, and reads nothing more until Redmine answers. A key Redmine refuses gets 401. `initialize`, `tools/list` and most tool calls are smaller and arrive at once, so they cost no extra call. `initialize` and `tools/list` never reach Redmine, so they succeed with any key, and a tool call with a wrong key still shows Redmine's 401 as the tool's error result.

That check makes large and slow requests depend on Redmine. When Redmine does not answer that request within 8 seconds, or answers it with an error other than 401, a request with a body over 64 KiB or one still arriving after a second gets 503, even a `tools/list` that needs nothing from Redmine. Each 503 writes one line to stderr, and a refused key writes none, so a client that keeps sending large bodies during an outage makes the server log one line per request.

## The body limit

A key that Redmine accepts, or a valid OAuth token, may send a body of up to about 6.7 MiB, enough for a 5 MiB `attachments_upload` in base64. The server reads each body once, as bytes, into a buffer of one to two bytes per byte received, however the client splits the body into packets. Node adds its own cost per packet. With 50 connections each sending one byte every 2 ms, live heap was about 6 bytes per byte received on Node and about 1 on Bun.

A client whose JSON encoder escapes `/`, as PHP's `json_encode` does by default, makes a 5 MB base64 upload about 109 KB longer, which goes over the limit and gets 413.

## The body budget

Bodies that are still arriving share a budget of 32 MiB, which the `maxBodyBytesInFlight` option of `createRedmineMcpHandler` changes. The budget charges the buffer each body is read into. A buffer doubles as its body grows up to 1 MiB and then grows 1 MiB at a time, so it is never more than 1 MiB ahead of what has arrived. It ends at the body's exact size when the `Content-Length` is truthful, so a body at the limit is charged in full once it passes 6 MiB. The first 64 KiB of each body are not charged, so small requests never meet the budget.

A body that needs room the others hold takes it from bodies that have not grown by 128 KiB in the last 5 seconds, longest stalled first, and those get 408. So an upload slower than 25.6 KiB/s can be dropped while the budget is full. When every other body is still growing, the request gets 503 with `Retry-After: 5`, even partway through its body.

So the default lets four bodies at the limit arrive at once. Five 5 MB uploads sent together at 1 MiB/s each got four 200s and one 503, which a Node client got after sending 6 MiB of its body. Six got four 200s and two 503s, after 5 and 6 MiB. Over loopback at full speed, five and six all succeeded, since each body arrived in a fraction of a second.

A `maxBodyBytesInFlight` under about 6.7 MiB lowers the largest body accepted to the budget plus 64 KiB, and a larger body gets 413. A budget of 0 answers 413 to any body over 64 KiB.

### What the budget saved

In a test with 60 uploads stopped at 95% of the limit, a Node server on the release before the budget held 794 MB of live heap (V8's heap and external memory after a full collection) and had answered none of them 310 seconds later. With the budget, four of them filled it and the other 56 got 503 within 2 seconds. Live heap stayed at most 29 MB above idle until the four bodies still stalled got 408 at 300 seconds, and then went back to idle. A 1 MiB upload from another user fit beside them and succeeded. On Bun the earlier release held 778 MB, and the budget 29 MB above idle. In a second test, a 6.7 MiB upload sent at 128 KiB/s while four stalled bodies filled the budget dropped one of them once it passed 5 MiB, and succeeded after 55 seconds.

### What the budget does not cover

The budget does not cover the first 64 KiB of each body or the state of each connection. 1,000 connections that had each sent 64 KiB and stopped held 84 MB of live memory on Node, of which 63 MB were their buffers, and the release before the budget held 154 MB. Cap the connections of one client in a proxy, such as with nginx's `limit_conn`, to bound that.

The budget bounds bodies while they arrive, not the memory a request takes afterwards to parse its message, decode the file and send it to Redmine. Five concurrent 5 MB uploads took a Node server from 94 MB to 370 to 371 MB of RSS in two runs.

The budget does not tell users apart. A body that grows by at least 128 KiB every 5 seconds, 25.6 KiB/s, is never dropped as stalled, so about 10 such bodies, 2.1 Mbit/s in all, can hold the budget. Each is charged for its buffer, which runs up to 1 MiB ahead of what it has sent, so they hold it once they pass about 3 MiB each. In two five-minute tests where one key kept 10 bodies growing at 26 KiB/s, 8 and 11 of another user's 15 uploads of 6.7 MiB got 503, and 19 and 12 of its 60 uploads of 1 MiB did. On a server with open registration or OAuth sign-ins, cap the connections of one client address in a proxy, such as with nginx's `limit_conn`, which bounds how many bodies one client keeps growing. A share of the budget per credential is on the [roadmap](https://github.com/moddi3/redmine-ts/blob/main/docs/roadmap.md).

## The body deadline

Every body must arrive within 300 seconds of when the server begins reading it. That is Node's own request timeout, which Bun and Workers do not have, so the server applies it on every runtime. The `bodyTimeoutMs` option changes it, and a body still arriving then gets 408. A 6.7 MiB upload must arrive at about 23 KiB/s or faster to make it.

## The connection after a refusal

After a 408, 503 or 413 partway through a body, the server reads and drops the rest of it for 5 seconds, so a client still sending gets the answer instead of a reset. Then it stops reading. The server does not close the connection itself. The runtime closes it once it has read nothing for its idle timeout.

| Runtime and setting                       | Client sends nothing more | Client keeps sending 1 KiB a second |
| ----------------------------------------- | ------------------------- | ----------------------------------- |
| Node, default `keepAliveTimeout` of 5 s   | Closed after 6 s          | Closed after 11 s                   |
| Node, `keepAliveTimeout` of 600 s         | Closed after 328 to 330 s | Closed after 328 to 330 s           |
| Bun `node:http`, default                  | Closed after 6 s          | Closed after 10 s                   |
| Bun `node:http`, `keepAliveTimeout` 600 s | Closed after 298 to 330 s | Closed after 298 to 330 s           |
| `Bun.serve`, default `idleTimeout`        | Closed after 12 s         | Closed after 12 s                   |
| `Bun.serve`, `idleTimeout` of 30          | Closed after 32 s         | Closed after 32 s                   |

Times count from the answer. With a `keepAliveTimeout` of 600 seconds, Node's 300-second request timeout ends the connection. On Workers the connection ends with the answer, so nothing is read and dropped. On Node, about 250 such open connections held 3 to 4 MB of live memory in all, and none of their bodies. A body refused by its declared length is not read at all. Each of these 408s and 503s writes one line to stderr.

## On Cloudflare Workers

One isolate has 128 MB. In workerd, three concurrent 5 MB uploads peaked at 56 to 80 MB of isolate memory, four at 111 to 141 MB, and five at 58 to 141 MB, against 86 to 92, 119 to 132 and 202 to 204 MB on the release before the budget. Those peaks come from 3 to 5 samples per run, so the true peaks may be higher. They were measured before the budget charged each body's buffer and grew it 1 MiB at a time. Keep large uploads to about three at a time per isolate.

## Metadata document and key set fetches

With OAuth on, a sign-in can make the server fetch a Client ID Metadata Document, and a token request of a client with keys can make it fetch a key set. The [OAuth section](../README.md#run-the-server) of the README lists the bounds: public addresses only, no redirects, 5 seconds, 5 KB for a document and 16 KiB for a key set, 8 document fetches and 4 key set fetches at once per process or isolate.

A caller can still keep the 8 document fetches busy. A client the server has not fetched within the hour then gets the 503 page until they stop. Meanwhile a redirect URI that a client removed from its document can still start a sign-in for up to an hour after the server last fetched that document, instead of 5 minutes. Section 8.4 of the draft asks servers to consider such changes.

With `--allow-client`, the fetches go only to the hosts you listed, so a caller cannot hold each one for 5 seconds with a slow server of their own. That holds while the runtime finishes the fetch of a request whose client disconnects. Cloudflare's documentation says Workers may cancel that work instead. If they do, a caller who opens the sign-in page and disconnects holds a slot for 6 seconds even with the flag. Repeating that about every 6 seconds for a known client keeps its kept document from being refreshed, so its sign-ins wait up to 6 seconds and get that document until it is an hour old, then the 503 page. To limit how often one address can open the sign-in page, rate-limit `GET` on the authorize path, `/mcp/oauth/authorize` for `https://mcp.example.com/mcp`, at the proxy.

Key sets have no such fallback. Without `--allow-client`, a person who signs in with a metadata document of their own can name 4 slow key set URLs and hold every key set fetch, and another key-bound client whose kept set has expired gets 503 meanwhile. With the flag, only documents on the listed hosts get that far, so only those hosts choose the key set URLs.
