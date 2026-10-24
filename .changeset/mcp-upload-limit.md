---
"@redmine-ts/mcp": patch
---

`attachments_upload` takes its advertised 5 MB over HTTP too. A request whose key Redmine accepted, or whose OAuth token is valid, may now carry about 6.7 MiB, which fits a 5 MB file in base64 and the JSON-RPC envelope around it. Before, the 4 MiB limit stopped base64 files at about 3 MB with a 413. A `content_text` near 5 MB can still exceed the limit once JSON escapes its line breaks, quotes, and control characters, so send such a file as `content_base64`.
