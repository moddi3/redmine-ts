---
"@redmine-ts/sdk": patch
---

`access: "no-delete"` now also refuses the updates that make Redmine delete records, with kind `access_denied` before anything is sent: `journals.update` with blank `notes`, `memberships.update` without `role_ids`, and `issues.update` or `wiki.update` with `deleted_attachment_ids`. The check reads the request as it would be sent, so `rm.request` to those routes is refused too, with PUT or PATCH, `.json` or `.xml`, and fields in the query string. The error's new `data.deletes` says what Redmine would delete. A method refusal has no `deletes`, as before.
