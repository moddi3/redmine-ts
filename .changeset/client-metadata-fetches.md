---
"@redmine-ts/mcp": patch
---

The OAuth authorization server now bounds the Client ID Metadata Document fetches that unauthenticated sign-in requests trigger. One process, or one Worker isolate, fetches at most 8 documents at once. Beyond that, a sign-in that needs a fetch gets a 503 page with `Retry-After: 5`, and a client whose document is cached, or was fetched within the last hour, signs in as before. Concurrent sign-ins of the same client share one fetch. A `client_id` whose fetch failed is not fetched again for 30 seconds. A document whose body breaks off, as when the 5-second timeout ends a stalled one, now gets the "could not be fetched" page instead of a 500. `createRedmineMcpHandler` now throws a `TypeError` when `allowedOrigins`, `allowedHosts` or `oauth.allowedClientHosts` holds an entry with `*`, as the CLI flags already refused it, since each entry matches one name exactly.
