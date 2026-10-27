---
"@redmine-ts/sdk": minor
---

`issues.get` returns `journals` and `changesets` oldest first, and `news.get` returns `comments` oldest first, for every API key. `rm.request` and clients from `rm.with` return the same order.

Before, the order followed the **Display comments** setting of the key's user. Redmine builds each list oldest first and reverses all of it for a user who reads comments in reverse chronological order. The REST API does not send that setting, so the client reverses a list when its first entry is later than its last. Journals compare by `created_on`, then `id`. Changesets compare by `committed_on`, and two with the same time stay as sent, because the API sends no changeset id. Comments come in `id` order, because the API sends no comment date. That is the order they were posted in, and it differs from Redmine's order only for a comment whose date was changed in the database.

To show newest first in a UI, reverse the list. To keep Redmine's order, pass `normalize: false`.
