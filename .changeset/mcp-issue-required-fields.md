---
"@redmine-ts/mcp": patch
---

The output schemas of `issues_get`, `issues_list` and `issues_create` now require `project`, `tracker`, `status`, `priority` and `author` on each issue, and `id` in `parent`. Redmine sends them on every issue, so the results do not change.
