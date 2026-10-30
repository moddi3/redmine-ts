---
"@redmine-ts/mcp": minor
---

More results fit the result budget, and some result shapes change:

- `issues_get` with `include: ["journals"]` leaves out the oldest journals that do not fit, and adds `journals_omitted` and `journals_before` to the record. `issue_context` with that `journals_before` returns the journals it left out.
- `raw_request` returns a response over the budget as `{truncated: true, bytes, response_text, message}`, where `response_text` is the start of the response's JSON, in place of `{response}`.
- An `issue_context` page with `journals_before` returns the issue as `{id, updated_on}` and the journals, without the rest of the issue, which the first page carried. The new `journals_after` returns only the journals newer than the one it names, in the same form.
- `journals_omitted` now counts an older journal in `full` too, because the next pages return it.
- `REDMINE_MCP_MAX_RESULT_BYTES` and `maxResultBytes` take at most 499,000 bytes, because Claude Code keeps at most 500,000 characters inline. A larger value is refused with a message that says so.
