---
"@redmine-ts/mcp": minor
---

A `no-delete` server now refuses the updates that make Redmine delete records, before sending: `journals_update` with blank `notes`, `memberships_update` without `role_ids`, `issues_update` or `wiki_update` with `deleted_attachment_ids`, and the same requests through `raw_request`. The error reads `The "no-delete" access mode refused <tool>, because <what Redmine would delete>. Nothing was changed.` Over OAuth, a token limited to `redmine:write` that makes such a call is asked for `redmine:delete`. The instructions and the `raw_request` description say that updates that delete are refused.
