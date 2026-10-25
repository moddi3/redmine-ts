---
"@redmine-ts/mcp": patch
---

The HTTP handler now bounds the memory and the time that request bodies take while they arrive. Before, a client whose key Redmine accepted, or whose OAuth token was valid, could stop its uploads near the 6.7 MiB limit and hold about 13 MB of live heap with each. Node closed them only at its 300-second request timeout, and Bun and Workers never did. 60 such uploads held 794 MB on Node.

- The handler reads each body once, as bytes, and passes the parsed message to the MCP SDK, so it holds one copy of a body instead of two. It holds one to two bytes per byte received however the client splits the body, where a body sent one byte per packet used to hold about 30.
- Bodies that are still arriving share a budget of 32 MiB, set with the new `maxBodyBytesInFlight` option of `createRedmineMcpHandler`. The first 64 KiB of each body are not charged, so small requests never meet it. A body that needs room takes it from bodies that have not grown by 128 KiB in 5 seconds, longest stalled first, and those get 408. When the other bodies are all still growing, it gets 503 with `Retry-After: 5`, even partway through its body. So about four bodies at the limit can arrive at once. Stalled bodies cannot hold the budget, but bodies that keep growing can. In a test, one key with 10 bodies growing at 26 KiB/s each made 8 of another user's 15 uploads of 6.7 MiB get 503 over five minutes.
- A body must arrive within 300 seconds of when the handler begins reading it, or it gets 408. The new `bodyTimeoutMs` option changes the time. It matches Node's request timeout, so Node servers see no change there, and gives Bun and Workers a bound they did not have.
- After a 408 or 503 about the body, the handler reads and drops the rest for up to 5 seconds, so the client gets the answer instead of a reset, and then closes the connection if the body is still arriving.
- A `maxBodyBytesInFlight` under about 6.7 MiB lowers the largest body accepted to the budget plus 64 KiB, with 413 beyond it. A budget of 0 answers 413 to any body over 64 KiB.
