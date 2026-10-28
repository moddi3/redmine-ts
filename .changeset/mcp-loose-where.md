---
"@redmine-ts/mcp": minor
---

`tools/list` now describes `where` with a table instead of a schema for each filter. In `issues_list`, `time_entries_list`, `users_list` and `projects_list`, `where` takes one loose condition, and its description lists the filters: each filter's value, such as an id, a date, `me` or `open`, and what it filters, under the operators it takes. The server still checks each call against the forms of each filter, so a bad filter gets the same error as before.

A full-access listing goes from 276K to 200K characters, and the input schema of `issues_list` from 48,004 to 4,466 bytes. Every input schema is now under 5,000 bytes. Codex strips the descriptions from a larger one, so it used to show the four list tools without their filter descriptions and with each operator form as `{}`.
