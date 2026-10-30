---
"@redmine-ts/mcp": minor
---

`issues_update` and `issues_transition` with `notes` now return `journal: {id, note}`, the journal that the notes were added in. Pass `id` to `journals_update` to edit the notes, and cite `note` as `#note-N`, without reading the issue again. To find the journal, each such call reads the issue's journals before and after the update. When it cannot tell which journal is the right one, or a read fails, the result is `{ok: true}` as before, with `status` for `issues_transition`.
