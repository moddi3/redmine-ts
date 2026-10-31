# Documentation

Pick the task you have. Each page links on to the details.

## Call Redmine from code with the SDK

- [Install and make a first call](../packages/sdk/README.md#quickstart)
- [Filter lists, embed related data, and walk pages](../packages/sdk/README.md#call-an-operation)
- [Create and update records, and attach files](../packages/sdk/README.md#create-update-and-attach-files)
- [Configure versions, auth, access, retries, and `fetch`](../packages/sdk/README.md#declare-the-server-version)
- [Handle errors](../packages/sdk/README.md#handle-errors)
- [Look up namespaces, raw requests, and the catalog](../packages/sdk/README.md#namespaces)

## Let an AI client work in Redmine with the MCP server

- [Add the server to Claude Code, Codex, or Cursor](../packages/mcp/README.md#add-the-server-to-a-client)
- [Run a shared server for claude.ai and ChatGPT](../packages/mcp/README.md#serve-over-http)
- [Look up the tools, filters, pages, and results](../packages/mcp/README.md#workflow-tools)
- [Set flags and environment variables](../packages/mcp/README.md#settings)
- [Understand OAuth scopes, revocation, and the grant store](../packages/mcp/README.md#oauth)
- [Embed the server in Node, Bun, or Cloudflare Workers](../packages/mcp/README.md#embed-the-server)
- [HTTP server limits and the measurements behind them](../packages/mcp/docs/limits.md)

## Check what is supported

- [Compatibility](compatibility.md) lists the Redmine versions, runtimes, and MCP clients, and how each is checked.
- [Roadmap](roadmap.md) lists what is done, what is limited today, and what is planned.

## Understand the design

- [Architecture](architecture.md) explains how the SDK is built and why: one entrypoint for all versions, the operation registry, retries, pagination, and testing.

## Maintain the repository

- [Contributing](../CONTRIBUTING.md) covers the setup, the checks, code generation, and adding a Redmine version.
- [Releasing](releasing.md) covers changesets, the Version Packages pull request, and publishing to npm.
- [Contract-test servers](../docker/README.md) lists the Docker Redmine servers, their seeded data, and their ports.
- [Vendored spec](../spec/README.md) explains how the OpenAPI spec is pinned and updated.
