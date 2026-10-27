---
"@redmine-ts/mcp": minor
---

`issue_context` now gives each journal a `note`, its N in the issue page's `#note-N`, so an agent can find the journal that "see #note-68" means. The count starts at 1 with the oldest journal the API key may see. Journals that the `journals` cap leaves out still count. The `redmine://issues/{id}` resource puts the number in each journal heading, as in `### #note-68, 2026-01-15T09:30:00Z, Jane Doe (journal 1042)`.

Redmine numbers all journals of an issue before it hides some of them. It hides other users' private notes from a user who may not view them, and a journal without notes whose changes the user may not see, such as a relation to an issue that the user cannot see or that was deleted later, or a custom field the user cannot see. After a hidden journal, `note` is lower than Redmine's number, for an admin key too in the second case. The output schema says so.
