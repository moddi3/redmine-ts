---
"@redmine-ts/mcp": patch
---

`attachments_upload` reads a file from the files directory through one handle, and refuses it, sending nothing, if its path changed after it was checked, for example into a symlink to a file outside the directory.
