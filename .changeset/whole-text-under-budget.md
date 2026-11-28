---
"@redmine-ts/mcp": minor
---

`issue_context` now returns descriptions and notes whole while the result fits the result budget. Before, it cut each one longer than 4000 characters, even in a small result, and an agent needed another call for the rest. A result over the budget first leaves out older journals, until the rest fits with notes cut at 4000 characters. The notes that stay come whole when they fit whole, and cut otherwise, with a marker that names the call for the full text. The description is cut only when it does not fit with the newest journal of the page. A text stays whole when its marker would be at least as long as the part the marker replaces. The `redmine://issues/{id}` resource has no budget and cuts descriptions and notes over 4000 characters as before.
