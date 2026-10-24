---
"@redmine-ts/mcp": patch
---

Add `--allow-host` for a proxy that passes the client's `Host` through. The flag adds hostnames to the `Host` check on loopback. On another address, such as `0.0.0.0` in a container, it turns the check on against the same list. The server's own JSON-RPC errors, the 401 for a missing key and the 403s for `Origin` and `Host`, now carry the request's `id` instead of `null` when the body is a single request of at most 64 KiB with a declared length. It reads at most that much and waits at most a second for it, so a large or stalled body does not hold up the error.
