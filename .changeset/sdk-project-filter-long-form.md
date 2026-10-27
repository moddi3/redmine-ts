---
"@redmine-ts/sdk": patch
---

`issues.list` and `timeEntries.list` now accept a `project_id` filter with a list of ids, `{ not }`, `"mine"`, `"bookmarks"` or a `raw` condition such as `1|2`. Before, Redmine answered 404 to each of them, because it reads `project_id` as the one project to scope the request to. The client now sends such a request in Redmine's long filter form (`f[]`, `op[...]`, `v[...][]`) with every other filter of the `where`. For issues, it adds the open-status filter that the short form starts from, so the results still leave out closed issues unless `status_id` says otherwise.

- One id or one identifier goes out as before and still includes the issues of subprojects. A list of ids does not include them, the same as the project filter in Redmine's issue list.
- An identifier in a list or under `{ not }` now fails with `invalid_input` before the request. Redmine compares those values with project ids and would match nothing.
