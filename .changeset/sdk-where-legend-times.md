---
"@redmine-ts/sdk": patch
---

The `where` description of the issue, project and user lists now says that their timestamp filters, such as `updated_on`, also take a UTC time to the second, such as `2026-10-31T08:00:00Z`. Redmine then compares the time, not only the day.
