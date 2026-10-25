# @redmine-ts/mcp

## 0.3.2

### Patch Changes

- 8fa701d: The OAuth authorization server now bounds the Client ID Metadata Document fetches that unauthenticated sign-in requests trigger. One process, or one Worker isolate, fetches at most 8 documents at once. Beyond that, a sign-in that needs a fetch gets a 503 page with `Retry-After: 5`. A client whose document is cached, or was fetched within the last hour and is among the last 256 documents fetched, signs in as before. A fetch that has not settled after 6 seconds, as when Workers cancel the request that started it, frees its slot, and the sign-ins that share it get that copy or the 503 page instead of a refusal. Concurrent sign-ins of the same client share one fetch. A failed fetch or an invalid document is not cached, as the Client ID Metadata Document draft requires. A document whose body breaks off, as when the 5-second timeout ends a stalled one, now gets the "could not be fetched" page instead of a 500. `createRedmineMcpHandler` now throws a `TypeError` when `allowedOrigins`, `allowedHosts` or `oauth.allowedClientHosts` holds an entry with `*`, as the CLI flags already refused it, since each entry matches one name exactly. An API-key check at Redmine that never settles, as when Workers cancel its request, now holds one of the 4 check slots for at most 9 seconds, so it no longer turns every later API-key sign-in away as busy.
- 7ceaae2: The HTTP handler now bounds the memory and the time that request bodies take while they arrive. Before, a client whose key Redmine accepted, or whose OAuth token was valid, could stop its uploads near the 6.7 MiB limit and hold about 13 MB of live heap with each. Node closed them only at its 300-second request timeout, and Bun and Workers never did. 60 such uploads held 794 MB on Node.

  - The handler reads each body once, as bytes, and passes the parsed message to the MCP SDK, so it holds one copy of a body instead of two. Its buffer holds one to two bytes per byte received, however the client splits the body.
  - Bodies that are still arriving share a budget of 32 MiB for the buffers they are read into, set with the new `maxBodyBytesInFlight` option of `createRedmineMcpHandler`. A buffer doubles as its body grows up to 1 MiB and then grows 1 MiB at a time, so it is never more than 1 MiB ahead of what has arrived, and it ends at the body's exact size when the `Content-Length` is truthful. A body at the limit is charged in full once it passes 6 MiB, and four such bodies can arrive at once. The first 64 KiB of each body are not charged, so small requests never meet the budget. A body that needs room takes it from bodies that have not grown by 128 KiB in 5 seconds, longest stalled first, and those get 408. When the other bodies are all still growing, it gets 503 with `Retry-After: 5`, even partway through its body. Stalled bodies cannot hold the budget, but bodies that keep growing can. In two five-minute tests, one key with 10 bodies growing at 26 KiB/s each made 8 and 11 of another user's 15 uploads of 6.7 MiB get 503.
  - A body must arrive within 300 seconds of when the handler begins reading it, or it gets 408. The new `bodyTimeoutMs` option changes the time. It matches Node's request timeout, so Node servers see no change there, and gives Bun and Workers a bound they did not have.
  - After a 408, 503 or 413 partway through a body, the handler reads and drops the rest for 5 seconds, so a client still sending gets the answer instead of a reset, and then stops reading. The server closes the connection once it has been idle for its own timeout, which took 6 to 12 seconds after the answer on Node and Bun with their default timeouts. On Workers the connection ends with the answer.
  - A `maxBodyBytesInFlight` under about 6.7 MiB lowers the largest body accepted to the budget plus 64 KiB, with 413 beyond it. A budget of 0 answers 413 to any body over 64 KiB. `createRedmineMcpHandler` throws a `RangeError` when either option is not a number, such as `null` or a string.
  - CORS responses now expose `Retry-After` next to `WWW-Authenticate`, so a browser client can read when to send a refused body again.

## 0.3.1

### Patch Changes

- ee5d737: The `attachments_upload` description names every tool that takes its reference in `uploads`, including `news_create`, `news_update` and `wiki_update`, and no longer says Redmine discards an unattached upload. Redmine keeps it until an admin prunes it.
- 0e4dd48: A request with an `X-Redmine-API-Key` header now has its key checked with Redmine (`GET /users/current.json`) before the server reads more than 64 KiB of the body or waits more than a second for it. A key that Redmine refuses gets 401, and a check that Redmine does not answer gets 503, both with a `null` id. Before, any value of the header, even a made-up one, made the server read up to 4 MiB and wait for a stalled body until Node's 300-second request timeout. Smaller requests that arrive at once are unchanged and cost no extra call. `attachments_upload` decodes `content_base64` in a loop that holds one copy of the file, instead of about 30 bytes per byte.
- 36409bd: `attachments_upload` takes its advertised 5 MB over HTTP too. A request whose key Redmine accepted, or whose OAuth token is valid, may now carry about 6.7 MiB, which fits a 5 MB file in base64 and the JSON-RPC envelope around it. Before, the 4 MiB limit stopped base64 files at about 3 MB with a 413. A `content_text` near 5 MB can still exceed the limit once JSON escapes its line breaks, quotes, and control characters, so send such a file as `content_base64`.
- Updated dependencies [ee5d737]
  - @redmine-ts/sdk@0.4.0

## 0.3.0

### Minor Changes

- d14dc40: Over OAuth, two failures inside a request now get an HTTP status that makes clients act, instead of an error result in HTTP 200:

  - When Redmine refuses the credential inside a valid token, because the Redmine application or token was revoked or the API key behind an API-key sign-in was reset, the request answers 401 `invalid_token` with the Bearer challenge. Clients refresh, the refresh fails, and they ask the person to sign in again.
  - When a call needs more than the token's scope and the server's own mode allows it, the request answers 403 `insufficient_scope` and names the scopes the call needs. `raw_request` needs the scope of the method it sends.

  OAuth responses now arrive whole when the call has finished, on 2025-era requests too, so the status can still change. A request in which Redmine may have applied a write keeps its results, so a retry cannot repeat the write. The `X-Redmine-API-Key` header works as before. A Redmine 403, a Redmine 401 for a path outside its API such as `my/page.js`, and a call the server's own mode refuses are still error results. With either credential, the error result for such a 401 now says to end the path in `.json` instead of asking for a new sign-in. The error result for a refused call now names the request's access mode as "the read-only access mode", since a narrower token can set it.

  `createRedmineMcpServer` takes an `observe` option, which gets each request the server sends to Redmine and each call that the access mode refuses.

### Patch Changes

- 0acce2b: Add `--allow-host` for a proxy that passes the client's `Host` through. The flag adds hostnames to the `Host` check on loopback. On another address, such as `0.0.0.0` in a container, it turns the check on against the same list. The server's own JSON-RPC errors, the 401 for a missing key and the 403s for `Origin` and `Host`, now carry the request's `id` instead of `null` when the body is a single request of at most 64 KiB with a declared length. It reads at most that much and waits at most a second for it, so a large or stalled body does not hold up the error. `--allow-origin`, `--allow-host` and `--allow-client` now refuse a value with `*` at startup, because they match names exactly and a wildcard matched only itself.

## 0.2.0

### Minor Changes

- 6824636: Add OAuth over HTTP, so claude.ai, ChatGPT and other OAuth-only clients can connect. With `REDMINE_MCP_PUBLIC_URL`, `REDMINE_MCP_AUTH_SECRET` and a Redmine OAuth application (`REDMINE_OAUTH_CLIENT_ID`, `REDMINE_OAUTH_CLIENT_SECRET`, Redmine 6.1+), the server becomes its own authorization server and signs people in through Redmine. Everything it issues is sealed with the secret, so it needs no database; a grant store, kept in memory by the CLI, makes codes single-use and rotates refresh tokens, and a reused one ends the sign-in. The scopes `redmine:read`, `redmine:write` and `redmine:delete` map to the access modes. `--api-key-login` signs people in with their API key instead, for Redmine without OAuth applications. `X-Redmine-API-Key` keeps working, and without the new settings `--http` is unchanged. `createRedmineMcpHandler` takes `publicUrl`, `oauth` (with a required `fetchClientMetadata` and an optional `store`) and `verifier`; the main entry exports `memoryGrantStore`, and `@redmine-ts/mcp/node` exports `publicFetch`.

## 0.1.1

### Patch Changes

- 2cb3aa0: Add CORS to the HTTP handler. A request from an origin listed in `--allow-origin` (or `allowedOrigins`) now gets a 204 answer to its preflight and `Access-Control-Allow-Origin` on every response, so a browser-based MCP client can call the server. The flag also takes an exact origin such as `https://app.example.com`, next to a hostname.
- e941182: Tool schemas no longer use `type` arrays, so clients that map them onto a dialect with one type per schema, such as Gemini's function declarations, can read them. A nullable value is now an `anyOf` with a `{ "type": "null" }` branch, and each branch carries the constraints of its type. The schemas accept exactly the values they accepted before. The MCP Inspector's `tools/list --strict` reported 587 warnings across 57 tools and now reports none.
- fa9a216: `raw_request` declares `body` and `response` as any JSON value with one type per branch, instead of a schema that names no type. Claude Code sends an argument whose schema names no type as a JSON string (anthropics/claude-code#82652), so an object `body` could reach Redmine as text.
- Updated dependencies [9c54bb6]
  - @redmine-ts/sdk@0.3.0

## 0.1.0

### Minor Changes

- bbfcb0d: First release. An MCP server for the Redmine REST API, run with `npx -y @redmine-ts/mcp` or as the `redmine-mcp` command. It has one typed tool per `@redmine-ts/sdk` operation with explicit annotations, and workflow tools: `issue_context` reads an issue with its readable history, `reference_data` maps names to ids, `issues_transition` changes a status by name, and others upload and download attachments or send a raw request. Access is full by default; `--read-only` and `--no-delete` narrow it, and the SDK refuses a hidden tool before sending. It serves stdio, or Streamable HTTP with `--http`, where each request sends its own key in `X-Redmine-API-Key`. `createRedmineMcpServer` and `createRedmineMcpHandler` embed it, the handler unchanged on Node, Bun and Cloudflare Workers.

### Patch Changes

- Updated dependencies [8a0e64e]
  - @redmine-ts/sdk@0.2.1
