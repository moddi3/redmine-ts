---
"@redmine-ts/mcp": minor
---

`issue_context` and the `redmine://issues/{id}` resource now show a journal's change to the description, or to a custom field on several lines, as the lines that changed. Before, an edited description came as `from` and `to`, each cut at 500 characters, so a change past the first 500 characters did not show. A long text custom field came whole.

When the old or new description spans lines or is longer than 350 characters, or a custom field value spans lines, the change now comes as `{field, diff}` in place of `{field, from, to}`, such as `{"field": "Description", "diff": "@@ line 13 @@\n  13. Step 13\n- 14. Step 14\n+ 14. Step fourteen\n  15. Step 15"}`. The diff has one unchanged line around each run of changes, with the removed lines first. A changed line longer than 350 characters is paired with the line across its run that shares the most text with it. It shows 40 characters on each side of every place where the two differ, with `…` in place of each part left out, and is cut at 350 characters only when those parts do not fit. Any other line longer than 350 characters shows its start. The diff stops at 1000 characters, and a diff that leaves anything out ends with one clip marker. A journal named in `full` shows its diff uncut, with every line whole. CRLF and LF line breaks compare equal. The resource shows the diff in a fenced block under the field's name.

Other changes keep `{field, from, to}`. A client that reads `from` and `to` on every change needs to handle `diff` too.
