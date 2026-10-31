---
"@redmine-ts/mcp": minor
---

`reference_data` now returns a custom field's possible value as `{value, label}` when Redmine shows a label other than the value, and as the plain string as before when the two are equal. For an `enumeration` field, `value` is the id to send and `label` is its name, so the agent no longer sees ids such as `"3"` with no name. A client that reads `possible_values` as strings only must now accept the object form too.
