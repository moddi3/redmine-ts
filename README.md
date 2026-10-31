# redmine-ts

[![CI](https://github.com/moddi3/redmine-ts/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/moddi3/redmine-ts/actions/workflows/ci.yml)
[![sdk on npm](https://img.shields.io/npm/v/@redmine-ts/sdk?label=%40redmine-ts%2Fsdk)](https://www.npmjs.com/package/@redmine-ts/sdk)
[![mcp on npm](https://img.shields.io/npm/v/@redmine-ts/mcp?label=%40redmine-ts%2Fmcp)](https://www.npmjs.com/package/@redmine-ts/mcp)

A typed TypeScript SDK for the Redmine REST API, and an MCP server built on it that lets Claude, ChatGPT, and coding agents work in the Redmine you already run.

## Pick a package

| You want to                                            | Package                           | Start with                                            |
| ------------------------------------------------------ | --------------------------------- | ----------------------------------------------------- |
| Call Redmine from TypeScript or JavaScript             | [`@redmine-ts/sdk`](packages/sdk) | [SDK quickstart](packages/sdk/README.md#quickstart)   |
| Let Claude, ChatGPT, or a coding agent work in Redmine | [`@redmine-ts/mcp`](packages/mcp) | [MCP quick start](packages/mcp/README.md#quick-start) |
| Change the code or the docs                            | This repository                   | [Contributing](CONTRIBUTING.md)                       |

## Call Redmine from code

```sh
npm install @redmine-ts/sdk
```

```ts
import { createRedmine } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

const issue = await rm.issues.get({ issue_id: 42, include: ["journals"] });
console.log(issue.subject, `${issue.journals.length} journal entries`);
```

Copy the API key from Redmine, under **My account**, **API access key**. [Read data](docs/sdk/queries.md) continues from here, and the [SDK README](packages/sdk/README.md) lists every guide.

## Connect an AI client

This command adds the server to Claude Code. Claude Code starts it on your machine and talks to it over stdio:

```sh
claude mcp add redmine \
  --env REDMINE_URL=https://tracker.example.com \
  --env REDMINE_API_KEY=your-key \
  -- npx -y @redmine-ts/mcp --no-delete
```

Then ask Claude what is assigned to you in Redmine. `--no-delete` hides every tool that deletes.

- Codex, Cursor, and other local clients connect as [Connect a client](docs/mcp/clients.md) shows.
- claude.ai and ChatGPT sign in with OAuth, so they need a shared server. [Run a shared server for claude.ai and ChatGPT](docs/mcp/http-and-oauth.md) walks through the setup.

## Compatibility

Both packages support Redmine 6.1 and 7.0 and run on Node 22 or later. The SDK and the MCP request handler also run on Bun. [Compatibility](docs/compatibility.md) lists what each package supports and how CI checks it.

## Documentation

[docs/README.md](docs/README.md) lists every page by task: reading and writing data with the SDK, connecting clients, running a shared server with OAuth, and the design behind both packages.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) explains the setup, the checks every change must pass, and how to add a Redmine version.

## Credits

The SDK's types, operation registry, and namespaces are generated from [redmine-openapi](https://github.com/d-yoshi/redmine-openapi) by [d-yoshi](https://github.com/d-yoshi), an unofficial OpenAPI 3.0.3 description of the Redmine REST API released under the MIT license. Without it, this project would have had to describe roughly 94 operations and 39 schemas by hand. The repository vendors pinned tags of it in [spec/](spec/README.md). Report a wrong field or operation at [d-yoshi/redmine-openapi/issues](https://github.com/d-yoshi/redmine-openapi/issues).

## License

[MIT](LICENSE)
