---
"@redmine-ts/mcp": minor
---

With OAuth on, a token request from a `private_key_jwt` client, such as ChatGPT, no longer gets 503 while every key set fetch is taken or its own fetch has not settled after 6 seconds, if the server fetched the client's key set within the last hour and that set holds the assertion's `kid`. A `kid` the set lacks still gets 503 `temporarily_unavailable`.

A metadata document fetch that fails after 6 seconds now drops the kept document, as a fetch that fails sooner does, until a newer fetch for that client starts. A fetch that settles after a newer one started still changes nothing.

`createRedmineMcpServer` keeps the tools of at most 8 pairs of access mode and files directory, so a library that creates servers with many `files.dir` values no longer keeps every set. An HTTP error that a tool serializes before it is returned gets the same `api_key` redaction in its body as one that is returned as it is.
