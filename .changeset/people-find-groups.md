---
"@redmine-ts/mcp": patch
---

`people_find` skips groups while it looks up matches, so a group that watches the issue or is its assignee no longer hides a partial match or counts in `more`. `more` counts only the matches it did not look up, and `unavailable` says when the call limit stopped the lookups.
