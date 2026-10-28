---
"@redmine-ts/sdk": minor
---

`Issue` and `IssueSummary` now type `project`, `tracker`, `status`, `priority` and `author` as required, and `id` as required in `parent` (#65). Redmine sends them on every issue that `issues.get`, `issues.list` and `issues.create` return. Under `strict`, `issue.project.name` now type-checks without `?.`, and so does `issue.parent.id` once `issue.parent` is checked. The redmine-openapi spec leaves these fields optional, so the generator corrects it until upstream does. The catalog's output schemas for these methods require the fields too.

This can break the type check of code that builds an `Issue` or `IssueSummary` by hand, such as a mock or a test fixture. Such code must now set all five fields, and `id` in any `parent`.
