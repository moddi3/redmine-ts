---
"@redmine-ts/mcp": minor
---

Results no longer carry working Redmine API keys. Before, `users_current`, `my_account_get` and `users_get` returned the calling user's own API key. With an admin key, `users_get` returned the API key of any user, and `users_create` returned the new user's key. `raw_request` returned the same keys from the same paths. Each key went into the agent's context and transcript.

The server now replaces each `api_key` value, at any depth, with `[hidden by @redmine-ts/mcp]` in tool results, in error results and in the `redmine://issues/{id}` resource. The field stays, so the output schemas do not change. The server also replaces the API key or OAuth access token it sends to Redmine wherever a response repeats it. `--dangerously-reveal-api-keys`, over stdio only, and the `dangerouslyRevealApiKeys` option of `createRedmineMcpServer` turn this off. `@redmine-ts/sdk` still returns `api_key` as Redmine sends it.
