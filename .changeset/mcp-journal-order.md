---
"@redmine-ts/mcp": patch
---

`issue_context`, `issues_get`, `raw_request`, and the `redmine://issues/{id}` resource now return an issue's journals oldest first, whatever the API key's user chose for **Display comments** in Redmine. The SDK now sets that order, so `include: ["changesets"]` and the comments from `news_get` come oldest first too.

Redmine sends these lists newest first when that user reads comments in reverse chronological order. In that case `issue_context` kept the oldest journals under its `journals` cap instead of the newest, and listed them newest first.
