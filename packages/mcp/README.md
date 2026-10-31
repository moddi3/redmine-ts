# @redmine-ts/mcp

[![npm](https://img.shields.io/npm/v/@redmine-ts/mcp)](https://www.npmjs.com/package/@redmine-ts/mcp)

An MCP server that lets Claude, ChatGPT, and coding agents work in your Redmine as you. It has 93 tools for the Redmine REST API, over stdio or Streamable HTTP. Each call runs with your Redmine permissions, and Redmine records each change under your name.

## Quick start

You need Node 22 or later, Redmine 6.1 or 7.0 with the REST API turned on, and your API key from Redmine, under **My account**, **API access key**. Add the server to Claude Code:

```sh
claude mcp add redmine \
  --env REDMINE_URL=https://tracker.example.com \
  --env REDMINE_API_KEY=your-key \
  -- npx -y @redmine-ts/mcp --no-delete
```

Then ask Claude what is assigned to you in Redmine. `--no-delete` leaves every tool that deletes out of the list. Leave it out only when the agent needs to delete.

## Connect other clients

- Codex, Cursor, and other local clients connect as [Connect a client](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/clients.md) shows.
- claude.ai and ChatGPT sign in with OAuth, so they need a shared server at a public https URL. [Run a shared server for claude.ai and ChatGPT](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/http-and-oauth.md) walks through the setup.
- Your own Node, Bun, or Cloudflare Workers program can run the server, as [Embed the server](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/embedding.md) shows.

## What you get

- **Workflow tools for the common jobs.** `issue_context` returns an issue with the statuses it can move to, its relations, and its journals as readable changes, in one call. `issues_transition` changes a status by name and lists the allowed ones when the workflow refuses. `people_find` returns a colleague's login by name, for any key.
- **A typed tool for every SDK operation.** 86 tools come from [`@redmine-ts/sdk`](https://www.npmjs.com/package/@redmine-ts/sdk), each with a JSON Schema for its input and its output, and hints that tell the client whether it reads, writes, or deletes.
- **Access modes the SDK enforces.** `--read-only` lists 44 tools and sends only `GET`. `--no-delete` lists 77, never sends `DELETE`, and refuses an update that deletes, such as blank journal notes. A hidden tool called anyway gets an error, and Redmine sees nothing.
- **One server for a team.** With `--http`, each request brings its own API key or OAuth token. The server needs no database, because it seals codes and tokens with one secret. The CLI keeps its [grant store](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/authentication.md#grant-store), which makes codes and refresh tokens single-use, in memory, so a restart lets a used refresh token work once more.
- **Sign-in through Redmine's OAuth.** CI signs in through a Redmine OAuth application and with an API key against Redmine 6.1 and 7.0. On 2026-10-26, claude.ai and ChatGPT signed in through this server by hand, ran tool calls, and refreshed their tokens.

## Documentation

| Task                                                        | Page                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Connect Claude Code, Codex, or Cursor                       | [Connect a client](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/clients.md)                |
| Run a shared server for claude.ai and ChatGPT               | [Run a shared server](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/http-and-oauth.md)      |
| Look up the tools, filters, pages, results, and errors      | [MCP tools](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/tools.md)                         |
| Page through journals, find people, and attach files        | [Workflow tools in detail](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/workflow-tools.md) |
| Set flags and environment variables                         | [MCP server settings](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/configuration.md)       |
| Understand scopes, revocation, and the grant store          | [OAuth sign-in](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/authentication.md)            |
| Look up HTTP answers, limits, and CORS                      | [HTTP server reference](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/http-server.md)       |
| Understand what limits an agent, and how keys stay hidden   | [Security model](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/security.md)                 |
| Embed the server in Node, Bun, or Cloudflare Workers        | [Embed the server](https://github.com/moddi3/redmine-ts/blob/main/docs/mcp/embedding.md)              |
| Check the supported Redmine versions, runtimes, and clients | [Compatibility](https://github.com/moddi3/redmine-ts/blob/main/docs/compatibility.md)                 |

## License

MIT
