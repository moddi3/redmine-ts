---
"@redmine-ts/mcp": patch
---

Tool schemas no longer use `type` arrays, so clients that map them onto a dialect with one type per schema, such as Gemini's function declarations, can read them. A nullable value is now an `anyOf` with a `{ "type": "null" }` branch, and each branch carries the constraints of its type. The schemas accept exactly the values they accepted before. The MCP Inspector's `tools/list --strict` reported 587 warnings across 57 tools and now reports none.
