---
"@redmine-ts/mcp": minor
---

List tools and `issue_context` now stop filling a result at 32,000 bytes of its compact JSON, so that results stay under what Cursor, Codex and OpenCode accept and Claude Code no longer saves them to a file. The budget counts UTF-8 bytes of one copy of the JSON, as the result is sent, with API keys hidden.

A list page now ends before the item that would take it over the budget, so it may hold fewer than `limit` items, and `next_offset` names the first item left out. A page holds one item at least, so `next_offset` always moves on. Callers that page with `next_offset` need no change; a caller that took a page short of `limit` for the last page should read `next_offset` instead.

`issue_context` adds the newest journals only while they fit, one at least, and returns `journals_before`, the id of the oldest journal it returned, whenever it leaves older journals out, by the `journals` count or by the budget. Calling it again with `journals_before` returns the next older page, and `journals_before` is `null` on the last. `journals_omitted` counts the older journals still left out. Journals in `full` come on top and are never cut. When the issue alone is over the budget, each page holds the issue and one journal. The `issues_get` description now points to `issue_context` for a long history.

`REDMINE_MCP_MAX_RESULT_BYTES`, or the `maxResultBytes` option of `createRedmineMcpServer` and `createRedmineMcpHandler`, changes the budget, at least 1,000 bytes. Above 49,000, list tools and `issue_context` also carry `_meta["anthropic/maxResultSizeChars"]`, set to the budget plus 1,000, so Claude Code keeps their results inline.
