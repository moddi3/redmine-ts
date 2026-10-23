---
"@redmine-ts/mcp": patch
---

Add CORS to the HTTP handler. A request from an origin listed in `--allow-origin` (or `allowedOrigins`) now gets a 204 answer to its preflight and `Access-Control-Allow-Origin` on every response, so a browser-based MCP client can call the server. The flag also takes an exact origin such as `https://app.example.com`, next to a hostname.
