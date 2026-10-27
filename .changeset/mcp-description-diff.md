---
"@redmine-ts/mcp": minor
---

`issue_context` and the `redmine://issues/{id}` resource now show a journal's change to long text as the lines that changed. Before, an edited description came as `from` and `to`, each cut at 500 characters, so a change past the first 500 characters did not show. A long text custom field came whole.

A change to text on several lines or longer than 200 characters now comes as `{field, diff}` in place of `{field, from, to}`, such as `{"field": "Description", "diff": "@@ line 13 @@\n  13. Step 13\n- 14. Step 14\n+ 14. Step fourteen\n  15. Step 15"}`. The diff has one unchanged line around each run of changes and stops at 1000 characters with the clip marker. A line longer than 200 characters shows 200 of them, starting 40 before where it changed. CRLF and LF line breaks compare equal. The resource shows the diff in a fenced block under the field's name. Other changes keep `{field, from, to}`.
