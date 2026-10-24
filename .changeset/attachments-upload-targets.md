---
"@redmine-ts/mcp": patch
---

The `attachments_upload` description names every tool that takes its reference in `uploads`, including `news_create`, `news_update` and `wiki_update`, and no longer says Redmine discards an unattached upload. Redmine keeps it until an admin prunes it.
