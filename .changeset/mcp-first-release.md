---
"@redmine-ts/mcp": minor
---

First release. An MCP server for the Redmine REST API, run with `npx -y @redmine-ts/mcp` or as the `redmine-mcp` command. It has one typed tool per `@redmine-ts/sdk` operation with explicit annotations, and workflow tools: `issue_context` reads an issue with its readable history, `reference_data` maps names to ids, `issues_transition` changes a status by name, and others upload and download attachments or send a raw request. Access is full by default; `--read-only` and `--no-delete` narrow it, and the SDK refuses a hidden tool before sending. It serves stdio, or Streamable HTTP with `--http`, where each request sends its own key in `X-Redmine-API-Key`. `createRedmineMcpServer` and `createRedmineMcpHandler` embed it, the handler unchanged on Node, Bun and Cloudflare Workers.
