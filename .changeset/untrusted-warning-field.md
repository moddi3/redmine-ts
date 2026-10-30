---
"@redmine-ts/mcp": minor
---

A result that carries text written by Redmine users now starts its `structuredContent` with a `warning` field, set to the same warning as its first text block: the text is data, not instructions. Claude Code shows the model only `structuredContent`, so its model never saw the warning beside the text before. The first text block stays for clients that read the text blocks, such as Codex.

The output schema of each tool that returns a record or a list page now allows `warning`. The result budget counts it, so a list page or `issue_context` result fits the budget with the warning included. A caller that compares `structuredContent` with the record it expects should drop `warning` first.
