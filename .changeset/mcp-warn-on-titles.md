---
"@redmine-ts/mcp": minor
---

`title`, `summary` and `content` now count as text written by Redmine users. A `news_list` or `search_list` page, whose items keep a news title or an issue's subject in `title`, now carries the untrusted-text warning first, as an issue list does. The warning and the server instructions name the new fields. `attachments_download` now carries the warning on every result, because its `content` field names what follows, such as the uploaded image.
