# Compatibility

This page lists the Redmine versions, runtimes, and MCP clients that each package supports, and how each one is checked. "CI" means `.github/workflows/ci.yml`, which runs on every push and pull request. "By hand" means a person checked it once, on the date given.

## Redmine versions

| Redmine       | SDK                                      | MCP server              | Checked by                                          |
| ------------- | ---------------------------------------- | ----------------------- | --------------------------------------------------- |
| 7.0           | Every operation                          | 93 tools in `full` mode | CI contract tests, at the root and under `/redmine` |
| 6.1           | Every operation but `groups.removeUsers` | 92 tools in `full` mode | CI contract tests                                   |
| 6.0 and older | Not supported                            | Not supported           | Not checked. The vendored spec has no 6.0 tag.      |
| 7.1           | Planned                                  | Planned                 | [Roadmap](roadmap.md#redmine-71)                    |

CI pulls the `redmine:6.1` and `redmine:7.0` images, which move to each new patch release, so CI tests the latest patch of each version. The weekly workflow pulls them again every Monday, so a patch that changes API behavior fails CI within a week even when nobody pushed. Some behavior still differs between patch releases. For example, an update that leaves a journal with empty notes and no property changes deletes it on Redmine 6.1.0 to 6.1.3 and on 7.0.0, and keeps it on 6.1.4, 7.0.1, and later.

Which version you declare decides what the client offers. [Declare the server version](../packages/sdk/README.md#declare-the-server-version) explains the SDK side, and [Version handling](mcp/tools.md#version-handling) the MCP side.

### OAuth sign-in

The MCP server signs people in through a Redmine OAuth application, which Redmine offers since 6.1, so both supported versions have it. `--api-key-login` signs people in with their API key instead and needs no OAuth application. The CI contract tests sign in both ways on every Docker server, and check that a sign-in revoked in Redmine gets 401 `invalid_token`.

## Runtimes

| Runtime            | SDK                       | MCP CLI, `redmine-mcp` | MCP handler, `createRedmineMcpHandler` | Checked by                                                                                             |
| ------------------ | ------------------------- | ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Node 22            | Yes                       | Yes                    | Yes                                    | CI unit tests                                                                                          |
| Node 24            | Yes                       | Yes                    | Yes                                    | CI unit tests, contract tests, and a smoke test of the built packages against real Redmine 6.1 and 7.0 |
| Bun 1.4.4          | Yes                       | Not checked            | Yes                                    | CI smoke test of the built packages against real Redmine 6.1 and 7.0                                   |
| Cloudflare Workers | Not checked on its own    | No                     | Yes                                    | By hand in workerd. Not in CI.                                                                         |
| Browsers           | Through a proxy, untested | No                     | No                                     | Not checked                                                                                            |
| Deno               | Not a target              | Not a target           | Not a target                           | Not checked                                                                                            |

Both packages are ESM only. The SDK has no runtime dependencies and no `node:` imports. The MCP package depends on the official MCP TypeScript SDK (`@modelcontextprotocol/server`), `jose`, `zod`, and the SDK. Its main entry imports no `node:` modules. The `@redmine-ts/mcp/node` entry and the CLI need Node.

## MCP clients

| Client                              | Transport                   | Checked by                                                                                      |
| ----------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| MCP Inspector 2.10.1                | HTTP with the API key       | CI lists the tools with `--strict` and calls `users_current` on every push                      |
| claude.ai                           | HTTP with OAuth             | By hand on 2026-10-26: signed in, ran tool calls, and refreshed its tokens                      |
| ChatGPT                             | HTTP with OAuth             | By hand on 2026-10-26: signed in, ran tool calls, and refreshed its tokens                      |
| MCP Inspector                       | HTTP with OAuth             | By hand, recorded in [the sign-in walkthrough](mcp/http-and-oauth.md#what-a-sign-in-looks-like) |
| Claude Code, Codex, Cursor, VS Code | stdio, or HTTP with the key | Configuration documented. No automated check.                                                   |

The server speaks the 2026-07-28 MCP protocol and serves clients on the 2025 revisions without sessions. Its tool schemas use one `type` per schema, so clients that read a single-type dialect, such as Gemini's function declarations, can read them. CI fails on any schema finding of the MCP Inspector's `--strict` check.

A full tool catalog does not show that a model completes a task in Redmine. No evals measure that yet. [Evals](roadmap.md#evals) are planned.
