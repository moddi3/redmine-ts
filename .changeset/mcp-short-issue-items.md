---
"@redmine-ts/mcp": minor
---

`issues_list` items are now short by default. Each item carries only `id`, `project`, `tracker`, `status`, `assigned_to`, `subject` and `updated_on`, plus the associations that `include` names, so a page of 100 issues on a test server went from about 69K to about 27K characters. The new `fields` input adds other item fields, such as `fields: ["due_date", "spent_hours"]`; `id` is always kept, `attachments` and `relations` there are fetched as `include` would, and a name that is not an item field is refused before any request. For the fields that items carried before, pass `detailed: true`, which returns every field as it did and adds `description`, or name the fields you need in `fields`. The other list tools are unchanged.

Every tool but `raw_request`, and the issue resource, now rounds hour fields to two decimals: `estimated_hours`, `total_estimated_hours`, `spent_hours` and `total_spent_hours` of issues and versions, and a time entry's `hours`. Redmine can send them as long floats, such as `2.1600000262260437`, which now reads `2.16`. The SDK still returns what Redmine sends.
