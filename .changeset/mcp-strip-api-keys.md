---
"@redmine-ts/mcp": patch
---

Tool results no longer contain Redmine API keys. Before, `users_current`, `my_account_get` and `users_get` returned the calling user's own API key. With an admin key, `users_get` returned the API key of any user, and `users_create` returned the new user's key. `raw_request` returned the same keys from the same paths. Each key went into the agent's context and transcript. Over OAuth, Redmine leaves out the user's own key, but an admin still got keys from `users_current` and `users_get`.

The server now removes every `api_key` field, at any depth, from each tool result before it sends the result, and blanks `api_key` values in the response body that an error result carries. The output schemas and descriptions of `users_current`, `users_get`, `users_create` and `my_account_get` no longer name the field. `@redmine-ts/sdk` still returns `api_key` as Redmine sends it.
