---
"@redmine-ts/mcp": minor
---

`issue_context` takes `full`, the ids of journals to return unclipped. It still makes one `issues.get` request. A journal in `full` is returned even when it is older than the newest `journals`, and an id that is not a journal of the issue is refused with `unknown_journal`.

A clipped note or changed value now ends with a marker that names this call, such as `Call issue_context with issue_id 7, journals 0 and full [1042] for all of it.` Before, the marker said to call `issues_get` with `include: ["journals"]`, which returns every journal with every raw detail. A clipped description still names `issues_get`, which returns the issue without journals.
