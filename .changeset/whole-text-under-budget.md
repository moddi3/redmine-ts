---
"@redmine-ts/mcp": minor
---

`issue_context` now returns descriptions and notes whole while the result fits the result budget. Before, it cut each one longer than 4000 characters, even in a small result, and an agent needed another call for the rest. A result over the budget cuts notes at 4000 characters first, with a marker that names the call for the full text, and then leaves out older journals. It cuts the description only when the description does not fit with one journal. The `redmine://issues/{id}` resource has no budget and cuts descriptions and notes as before.
