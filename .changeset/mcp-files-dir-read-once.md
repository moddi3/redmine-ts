---
"@redmine-ts/mcp": patch
---

`attachments_upload` reads a file from the files directory through one handle, checked after it is opened against what the path names in the directory, and reads no more than the size it checked, so a file that changes size meanwhile is refused. A FIFO no longer blocks it, and an unreadable file is refused with `invalid_input`.
