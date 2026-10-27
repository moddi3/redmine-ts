---
"@redmine-ts/sdk": patch
---

`issues.list` and `timeEntries.list` now accept a `project_id` filter with a list of ids, `{ not }`, `"mine"`, `"bookmarks"` or a `raw` condition such as `1|2`. Before, Redmine answered 404 to each of them, because it reads `project_id` as the one project to scope the request to. The client now sends such a request in Redmine's long filter form (`f[]`, `op[...]`, `v[...][]`) with every other filter of the `where`. For issues, it adds the open-status filter that the short form starts from, so the results still leave out closed issues unless `status_id` says otherwise.

- One id or one identifier goes out as before and still includes the issues of subprojects, and so does a list with one id. A list of two or more ids does not include them, the same as the project filter in Redmine's issue list. `{ not: id }` excludes only that project, not its subprojects.
- A standard filter next to such a `project_id` reads its value the way Redmine reads the short form. A custom field there takes an object condition or a plain value. Its `raw`, or a plain value that starts with `<`, `>`, `!`, `*`, `~`, `^` or `$`, fails with `invalid_input`, because Redmine reads those by the field's format, which the client does not know.
- `category_id` and `subproject_id`, and `issue.category_id` on time entries, fail with `invalid_input` next to such a `project_id`. Redmine offers them only inside one project and drops them from any other query, so the results would leave the filter out.
- An identifier in a list of two or more ids or under `{ not }` now fails with `invalid_input` before the request. Redmine compares those values with project ids and would match nothing.
