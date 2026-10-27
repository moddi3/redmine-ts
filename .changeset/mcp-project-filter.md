---
"@redmine-ts/mcp": patch
---

`issues_list` and `time_entries_list` now accept a `where.project_id` with a list of ids, `{not}`, `"mine"`, `"bookmarks"` or a `{raw}` such as `1|2`, as their schemas offer. Before, Redmine answered 404 to each of them, and the error result sent the agent to check ids that were valid. An identifier in a list of two or more or under `{not}` now gets an error result that asks for ids. Next to such a `project_id`, a custom field with `{raw}`, or with a value that starts with an operator character, gets an error result that asks for an operator object. A filter that Redmine offers only inside one project, such as `category_id`, and a saved query's `query_id` get an error result there too. The `project_id` description now says which forms include subprojects. The fix is in `@redmine-ts/sdk`.
