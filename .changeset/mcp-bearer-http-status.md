---
"@redmine-ts/mcp": minor
---

Over OAuth, two failures inside a request now get an HTTP status that makes clients act, instead of an error result in HTTP 200:

- When Redmine refuses the credential inside a valid token, because the Redmine application or token was revoked or the API key behind an API-key sign-in was reset, the request answers 401 `invalid_token` with the Bearer challenge. Clients refresh, the refresh fails, and they ask the person to sign in again.
- When a call needs more than the token's scope and the server's own mode allows it, the request answers 403 `insufficient_scope` and names the scopes the call needs. `raw_request` needs the scope of the method it sends.

OAuth responses now arrive whole when the call has finished, on 2025-era requests too, so the status can still change. A request in which Redmine may have applied a write keeps its results, so a retry cannot repeat the write. The `X-Redmine-API-Key` header works as before, and a Redmine 403 or a call the server's own mode refuses is still an error result. That error result now names the request's access mode as "the read-only access mode", since a narrower token can set it.
