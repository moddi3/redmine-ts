---
"@redmine-ts/mcp": minor
---

Add OAuth over HTTP, so claude.ai, ChatGPT and other OAuth-only clients can connect. With `REDMINE_MCP_PUBLIC_URL`, `REDMINE_MCP_AUTH_SECRET` and a Redmine OAuth application (`REDMINE_OAUTH_CLIENT_ID`, `REDMINE_OAUTH_CLIENT_SECRET`, Redmine 6.1+), the server becomes its own authorization server and signs people in through Redmine. It keeps no database: everything it issues is sealed with the secret. The scopes `redmine:read`, `redmine:write` and `redmine:delete` map to the access modes. `--api-key-login` signs people in with their API key instead, for Redmine without OAuth applications. `X-Redmine-API-Key` keeps working, and without the new settings `--http` is unchanged. `createRedmineMcpHandler` takes `publicUrl`, `oauth` and `verifier`, and `@redmine-ts/mcp/node` exports `publicFetch`.
