---
"@redmine-ts/mcp": patch
---

`issue_context` and the `redmine://issues/{id}` resource now label a subtask change "Subtask" and show the subtask as `#123`, as Redmine's issue page does. Redmine records this change on the parent issue as a `child_id` detail when someone adds a subtask to the issue or removes one. Before, `issue_context` showed it as `{"field": "child_id", "from": null, "to": "123"}`.
