---
"@redmine-ts/sdk": minor
---

`where` refuses filters Redmine drops without an error, on every request. `category_id` and `subproject_id`, and `issue.category_id` on time entries, need one `project_id`, and `query_id` takes no filter but one `project_id`. Before, both went out in the short form and came back wider than asked.

`status_id`'s `"open"`, `"closed"` and `"any"` stand alone. `{ not: "closed" }` now means open and `{ not: "open" }` closed, where they matched a status named by that word. A word in a list, such as `["open", 3]`, is `invalid_input`, where Redmine read it as open issues and dropped the 3.

`contains` on `parent_id`, `child_id`, and `issue_id` and `issue.parent_id` on time entries takes the id as a number too.

Filter descriptions in the catalog and the JSDoc use the `where` grammar: a summary, the value, and the forms the filter takes. Redmine's own syntax stays on the `raw` form. Every filter's description now names its value, such as `issue id` for the relation filters, `group id` and `role id`.
