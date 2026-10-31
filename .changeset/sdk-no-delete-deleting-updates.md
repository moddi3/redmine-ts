---
"@redmine-ts/sdk": patch
---

`access: "no-delete"` now also refuses the updates that make Redmine delete records, with kind `access_denied` before anything is sent: `journals.update` with blank `notes`, `memberships.update` without `role_ids`, and `issues.update` or `wiki.update` with `deleted_attachment_ids`. The check reads the request as it would be sent, so `rm.request` to those routes is refused too, with PUT or PATCH, `.json` or `.xml`, and fields in the query string. The error's new `data.deletes` says what Redmine would delete. A method refusal has no `deletes`, as before.

The `journals.update` description now covers both behaviors. Redmine 6.1.0 to 6.1.3 and 7.0.0 delete a journal left with empty `notes` and no `details`. Later releases keep it, but `include=journals` leaves it out until it has notes again.
