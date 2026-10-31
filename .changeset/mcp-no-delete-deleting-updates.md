---
"@redmine-ts/mcp": minor
---

A `no-delete` server now refuses the updates that make Redmine delete records, before sending: `journals_update` with blank `notes`, `issues_update` or `wiki_update` with `deleted_attachment_ids`, `memberships_update` with `role_ids` that name none of the membership's current roles, and the same requests through `raw_request`. A membership update with roles in `role_ids` reads the membership first, and its refusal says how to swap roles in two updates. The error reads `The "no-delete" access mode refused <tool>, because <what Redmine would delete>. Nothing was changed.` Over OAuth, a token limited to `redmine:write` that makes such a call is asked for `redmine:delete`. The instructions and the `raw_request` description say that updates that delete are refused.
