---
"@redmine-ts/mcp": minor
---

The `where` table in `tools/list` gives every filter a value: `issue id` for the relation filters, `group id` and `role id`, and the scheme name for `twofa_scheme`. `status_id`'s words are marked "alone", the project-scoped filters say they need one `project_id`, and the id filters that take `contains` say it matches the issue tree.

`issues_list` and `time_entries_list` refuse `category_id` without one `project_id`, any filter next to `query_id` but one `project_id`, and a status word next to other values, before anything is sent. `{ "not": "closed" }` on `status_id` returns the open issues, and `{ "contains": 42 }` on `parent_id` is accepted.

The filter descriptions come from the SDK, so a refused filter's error names its value as well as its forms.
