---
"@redmine-ts/mcp": patch
---

`raw_request` declares `body` and `response` as any JSON value with one type per branch, instead of a schema that names no type. Claude Code sends an argument whose schema names no type as a JSON string (anthropics/claude-code#82652), so an object `body` could reach Redmine as text.
