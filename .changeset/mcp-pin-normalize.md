---
"@redmine-ts/mcp": patch
---

`createRedmineMcpServer` and `createRedmineMcpHandler` keep the SDK's response fixes on even when the config passes `normalize: false`. With them off, `issue_context` kept the oldest journals for a key whose user reads comments newest first, as before the fix for #49. The CLI was not affected, because it has no `normalize` option.
