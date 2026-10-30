---
"@redmine-ts/mcp": minor
---

Following a clip marker now returns the issue as `{id, updated_on}`. An `issue_context` call with `journals: 0` and ids in `full`, which a clipped journal's marker names, returns those journals with the issue as `{id, updated_on}`, as a `journals_before` page does. It leaves out the rest of the issue and no longer lists the subtasks. A call with `journals` above 0, or without `full`, still returns the whole issue.

The `issue_context` description now says that journals come oldest first, and that each journal's `note` is N in the issue page's `#note-N`, lower than Redmine's own number after a journal hidden from the key. Clients that do not pass output schemas to the model now get this too.
