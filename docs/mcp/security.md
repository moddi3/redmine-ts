# Security model

This page explains what limits an agent that uses the MCP server, and what the server does with credentials and with text that Redmine users write.

## What limits the agent

Three separate controls decide what a tool call can do. Each one covers a different part, so none replaces another.

| Control                                                                | Who checks it                                 | What it limits                                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Access mode](tools.md#access-modes): `full`, `no-delete`, `read-only` | The SDK inside the server, before any request | Which tools the server lists and which HTTP methods it sends, `raw_request` included |
| The Redmine role of the user                                           | Redmine, on every request                     | What that user may see and change in each project                                    |
| The permissions of an OAuth token                                      | Redmine, on most requests                     | What a sign-in through a Redmine OAuth application may do                            |

- None of them limits the API key itself, which works in any other client too. A key that belongs to an admin can still do everything outside this server, so give the server a key of a user whose Redmine role allows only what the agent needs.
- Redmine checks a token's permissions on most requests, but not on issue edits, notes, and deletes, which check only the user's role ([Redmine #44271](https://www.redmine.org/issues/44271)). For those, the access mode is the guard that holds. [Scopes and access modes](authentication.md#scopes-and-access-modes) maps OAuth scopes to access modes.
- The access mode knows the REST routes of Redmine itself. A plugin endpoint that deletes on a `POST`, `PUT`, or `PATCH` is unknown to the SDK, and `raw_request` sends it in `no-delete` mode.

## Safety checklist

- Text that Redmine users write reaches the agent unchanged. When a result contains `subject`, `description`, `notes`, `text`, or `comments`, its first text block and the `warning` field that `structuredContent` starts with say that the text is data and not instructions. That field takes the place of a record's own `warning` field, such as one a plugin adds; `raw_request` returns the record unchanged under `response`. The reference from `attachments_upload` carries neither, because its `description` is the caller's own and goes back unchanged in `uploads`. Clients such as Claude Code show the model only `structuredContent`, and Codex shows it only the text blocks. Treat an agent that reads issues from strangers as exposed to prompt injection anyway, and run it in `read-only` mode when it does not need to write.
- `full` mode lets the agent delete issues, projects, and users. Redmine has no undo. Use `no-delete` unless the agent needs to delete.
- `raw_request` reaches every REST path, plugins included, with the same key. The access mode applies to it like to every tool, and the SDK refuses a path outside `REDMINE_URL`.
- Without `REDMINE_MCP_FILES_DIR`, no tool reads or writes local files. With it, tools read and write only inside that directory. Only trusted users should be able to write in it, because a hard link there to a file outside is read like any file in it, and on systems other than Linux and macOS a directory there swapped for a symlink while a file is read can lead the server to a file outside it.
- The server hides API keys in what it returns, unless you pass `--dangerously-reveal-api-keys`. See [API keys](#api-keys).
- The server never logs the API key and sends it only in the `X-Redmine-API-Key` header. Over [OAuth](authentication.md), it sends Redmine only Redmine's own token or the key sealed in the client's token, never the client's token.

## API keys

Redmine sends a working API key as `api_key` in `users/current.json`, `users/:id.json` and `my/account.json`, and in the user that `users_create` makes. A user gets their own key, and an admin gets the key of any user. The server replaces each `api_key` value, at any depth, with `[hidden by @redmine-ts/mcp]`. The field stays, so a record without `api_key` still means that Redmine sent none.

The rule covers tool results, `raw_request` included, error results and the `redmine://issues/{id}` resource. The SDK cuts an error body at 2 KiB, so a body that does not parse as JSON is matched as text. The server also replaces the credential it sends to Redmine, the API key or the OAuth access token, wherever a response repeats it, such as a proxy that echoes `X-Redmine-API-Key` in an error. A credential shorter than 20 characters stays, so that it cannot replace ordinary words. A record read this way and sent back, such as a plugin's settings through `raw_request`, carries the placeholder instead of the key, and Redmine would store the placeholder.

`--dangerously-reveal-api-keys` turns all of this off, and the tools return keys as Redmine sends them. The keys then sit in the agent's context and transcript. The flag works only over stdio, where the person who starts the server owns the key. With `--http`, the server refuses to start. Over HTTP, one flag would decide for every user, and a client signed in through [API key sign-in](authentication.md#api-key-sign-in) would read the key that its person gave only to the consent page. Over OAuth through a Redmine application, Redmine sends no key, so the flag would change nothing there. Redmine sends a key over OAuth only to an admin whose token has the `admin` scope, and this server never asks for that scope.
