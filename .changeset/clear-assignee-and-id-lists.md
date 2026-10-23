---
"@redmine-ts/sdk": patch
---

Fix `issues.update({ issue_id, assigned_to_id: null })`, which Redmine silently ignored. The client now sends `""` for that field, which clears the assignee. Every other nullable field already cleared with `null`.

Fix filters that took a list of ids but matched only the first one. `where: { issue_id: [4, 9] }` returned issue 4 alone, because Redmine splits `issue_id`, `parent_id`, `child_id`, `done_ratio`, the relation filters (`relates`, `blocks`, and the rest) and `issue.parent_id` on time entries on commas, not on `|`. The client now sends `4,9` for those filters, for `=` and `not` lists. Ranges and every other filter are unchanged.
