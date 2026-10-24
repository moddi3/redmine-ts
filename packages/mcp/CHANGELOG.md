# @redmine-ts/mcp

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
