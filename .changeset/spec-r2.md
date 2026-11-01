---
"@redmine-ts/sdk": minor
"@redmine-ts/mcp": patch
---

Generate from the spec tags `6.1.3-r2` and `7.0.2-r2`. `groups.create` now requires `name`, which Redmine always required. Issue relations, changesets, attachment authors and child trackers are typed as always present. The issue date filters document UTC timestamps.
