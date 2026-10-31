---
"@redmine-ts/mcp": minor
---

The MCP now sends `User-Agent: redmine-ts-mcp/<version> (+https://github.com/moddi3/redmine-ts)` on its requests to Redmine: tool calls, the API key check, and the OAuth token exchange. Redmine and proxy admins can tell these requests apart in their access logs. A `fetch` passed in the config receives each request with that header and can replace it. The SDK sends no User-Agent of its own, as before.
