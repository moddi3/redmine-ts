---
"@redmine-ts/mcp": patch
---

A request with an `X-Redmine-API-Key` header now has its key checked with Redmine (`GET /users/current.json`) before the server reads more than 64 KiB of the body or waits more than a second for it. A key that Redmine refuses gets 401, and a check that Redmine does not answer gets 503, both with a `null` id. Before, any value of the header, even a made-up one, made the server read up to 4 MiB and wait for a stalled body until Node's 300-second request timeout. Smaller requests that arrive at once are unchanged and cost no extra call. `attachments_upload` decodes `content_base64` in a loop that holds one copy of the file, instead of about 30 bytes per byte.
