---
"@redmine-ts/mcp": minor
---

`issue_context` and the `redmine://issues/{id}` resource now show a journal's change to the description or to a custom field as the lines that changed. Before, an edited description came as `from` and `to`, each cut at 500 characters, so a change past the first 500 characters did not show. A long text custom field came whole.

When the old or new value spans lines or is longer than 200 characters, the change now comes as `{field, diff}` in place of `{field, from, to}`, such as `{"field": "Description", "diff": "@@ line 13 @@\n  13. Step 13\n- 14. Step 14\n+ 14. Step fourteen\n  15. Step 15"}`. The diff has one unchanged line around each run of changes and stops at 1000 characters with the clip marker. A line longer than 200 characters shows 200 of them, starting 40 before where it changed. CRLF and LF line breaks compare equal. The resource shows the diff in a fenced block under the field's name.

Other changes keep `{field, from, to}`. A client that reads `from` and `to` on every change needs to handle `diff` too.
