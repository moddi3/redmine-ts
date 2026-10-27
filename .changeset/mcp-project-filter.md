---
"@redmine-ts/mcp": patch
---

`issues_list` and `time_entries_list` now accept a `where.project_id` with a list of ids, `{not}`, `"mine"`, `"bookmarks"` or a `{raw}` such as `1|2`, as their schemas offer. Before, Redmine answered 404 to each of them, and the error result sent the agent to check ids that were valid. An identifier in a list or under `{not}` now gets an error result that asks for ids. The fix is in `@redmine-ts/sdk`.
