# @redmine-ts/mcp

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
