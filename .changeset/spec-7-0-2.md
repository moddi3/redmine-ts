---
"@redmine-ts/sdk": patch
---

Vendor the Redmine OpenAPI spec 7.0.2-r1. `Issue.children` is now the recursive `IssueChild[]`, with `id` and `subject` required and nested `children`, which Redmine 6.1 and 7.0 both send. Descriptions in the types and the catalog pick up 7.0.2's notes on comma-separated id lists, the default assignee, and which children and memberships are visible.
