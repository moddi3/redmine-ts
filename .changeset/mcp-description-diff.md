---
"@redmine-ts/mcp": minor
---

`issue_context` and the `redmine://issues/{id}` resource now show a journal's change to the description, or to a custom field on several lines, as the lines that changed. Before, an edited description came as `from` and `to`, each cut at 500 characters, so a change past the first 500 characters did not show. A long text custom field came whole.

When the old or new description spans lines or is longer than 350 characters, or a custom field value spans lines, the change now comes as `{field, diff}` in place of `{field, from, to}`, such as `{"field": "Description", "diff": "@@ line 13 @@\n  13. Step 13\n- 14. Step 14\n+ 14. Step fourteen\n  15. Step 15"}`. The diff has one unchanged line around each run of changes and stops at 1000 characters with the clip marker. A changed line longer than 350 characters shows from 40 characters before its first difference to 40 after its last, at most 350 of them. Any other line longer than 350 characters shows its first 350. Each line cut this way ends with the clip marker too. CRLF and LF line breaks compare equal. The resource shows the diff in a fenced block under the field's name.

Other changes keep `{field, from, to}`. A client that reads `from` and `to` on every change needs to handle `diff` too.
