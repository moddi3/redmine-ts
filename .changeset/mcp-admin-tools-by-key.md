---
"@redmine-ts/mcp": minor
---

A key whose Redmine user is not an admin no longer sees the 14 tools that need an admin key, such as `users_list` and `groups_list`, in `tools/list`, and the server instructions leave out the sentence about them. Such a tool still answers a call, with Redmine's 403 and what works without an admin key.

- Over stdio, the server reads `users/current.json` once when it starts, before the client's `initialize`. If Redmine does not answer, it lists every tool, as before.
- Over HTTP with the `X-Redmine-API-Key` header, the server asks Redmine about the key once for each `initialize`, `server/discover` and `tools/list` request. A request past 64 KiB or slower than a second shares that one check with the key gate. A tool call adds no check. If Redmine does not answer or refuses the key, every tool is listed, as before.
- Over OAuth, the built-in authorization server records in the grant whether the user is an admin at sign-in. An API key sign-in takes it from the key check on the consent page. A sign-in through Redmine is never an admin's, because Redmine lets an OAuth token act as an admin only with the `admin` scope, which the server does not request, so these sign-ins no longer list the tools Redmine refuses them. A refresh keeps the field, so a change of admin rights shows after the next sign-in. Tokens issued before this change list every tool. `BearerGrant` gains an optional `admin` field, which an external verifier may set.

`createRedmineMcpServer` takes a new `admin` option: `false` hides the tools that need an admin key. Without it, every tool is listed.
