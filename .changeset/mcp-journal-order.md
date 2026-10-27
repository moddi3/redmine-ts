---
"@redmine-ts/mcp": patch
---

`issue_context`, `issues_get`, and the `redmine://issues/{id}` resource now return an issue's journals oldest first, whatever the API key's user chose for **Display comments** in Redmine.

Redmine sends the journals newest first when that user reads comments in reverse chronological order. In that case `issue_context` kept the oldest journals under its `journals` cap instead of the newest, and listed them newest first. `issues_get` with `include: ["journals"]` passed the same order through.
