# Agent guide

This repository holds two npm packages. `@redmine-ts/sdk` in `packages/sdk` is a typed client for the Redmine REST API. `@redmine-ts/mcp` in `packages/mcp` is an MCP server built on it. [CONTRIBUTING.md](CONTRIBUTING.md) is the full contributor guide. This page maps tasks to the files that own them and to the pages that describe them, and it lists the checks to run before you hand work back. Claude Code 2.1.277 and later, Codex, and other agents read this file directly.

## Rules

- Commit messages follow Conventional Commits (`type(scope): subject`, such as `feat(sdk): add conflict kind` or `chore(audit): log decisions`). `.vite-hooks/commit-msg` rejects anything else.
- A user-facing change to a published package needs a changeset, written with `vp run changeset`. A change to a package README needs a `patch` changeset, because npm shows the README of the last release. A change only to tests, CI, or other documentation needs none. [docs/releasing.md](docs/releasing.md#add-a-changeset-to-your-change) holds the rule.
- Never edit `packages/sdk/src/generated/` by hand. Change `packages/sdk/generator/` and run `vp run gen` in `packages/sdk`.
- Every `ts` block in `README.md`, `packages/sdk/README.md`, `docs/architecture.md`, and `docs/sdk/` is an exact excerpt of a file in `packages/sdk/examples/`. Every `ts` block in `packages/mcp/README.md` and `docs/mcp/` is an exact excerpt of a file in `packages/mcp/examples/`. Change the example first, then copy the lines.
- Update the docs with the code. A change to behavior, a default, a limit, a flag, an environment variable, an error, a tool, or a public type updates the pages that describe it. Make that update in the same pull request. To find those pages, start from the "Described in" column below, then search the docs for each name and number you changed: `rg -n '<name>' README.md packages/*/README.md packages/mcp/docs docs`. When no page needs a change, say so when you hand the work back.
- Write documentation as [docs/style-guide.md](docs/style-guide.md) describes.

## Find where a task starts

### SDK

| Task                                                     | Start in                                     | Described in                                                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch, timeouts, the concurrency limit, and retries      | `packages/sdk/src/core/engine.ts`            | [Set retries, timeouts, and concurrency](docs/sdk/configuration.md#set-retries-timeouts-and-concurrency)                                                                              |
| Planning a request and reading its response              | `packages/sdk/src/core/wire.ts`              | [Handle errors](docs/sdk/errors.md), [Which failures the client retries](docs/sdk/configuration.md#which-failures-the-client-retries), [Call shape](docs/sdk/reference.md#call-shape) |
| Filters under `where`, and pagination                    | `packages/sdk/src/core/listing.ts`           | [Read data](docs/sdk/queries.md)                                                                                                                                                      |
| Uploads and downloads                                    | `packages/sdk/src/core/files.ts`             | [Create and update records](docs/sdk/writes.md)                                                                                                                                       |
| Acting as another user                                   | `packages/sdk/src/core/impersonation.ts`     | [Act as another user](docs/sdk/configuration.md#act-as-another-user)                                                                                                                  |
| Response fixes that `normalize: false` turns off         | `packages/sdk/src/core/quirks.ts`            | [Journals come oldest first](docs/sdk/queries.md#journals-come-oldest-first), [Architecture](docs/architecture.md)                                                                    |
| Config, auth, and access modes                           | `packages/sdk/src/core/config.ts`            | [Configure the client](docs/sdk/configuration.md)                                                                                                                                     |
| Error kinds                                              | `packages/sdk/src/core/errors.ts`            | [Handle errors](docs/sdk/errors.md)                                                                                                                                                   |
| The client and its hand-written methods                  | `packages/sdk/src/redmine.ts`                | [SDK reference](docs/sdk/reference.md)                                                                                                                                                |
| Generated types, operations, namespaces, and the catalog | `packages/sdk/generator/`, then `vp run gen` | [Namespaces](docs/sdk/reference.md#namespaces), which a test compares with the client                                                                                                 |
| Names, hidden operations, and fixes to the spec          | `packages/sdk/generator/overlay.ts`          | [SDK reference](docs/sdk/reference.md), [Architecture](docs/architecture.md)                                                                                                          |

### MCP server

| Task                                             | Start in                            | Described in                                                                                                           |
| ------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tools built from the SDK catalog                 | `packages/mcp/src/catalog-tools.ts` | [MCP tools](docs/mcp/tools.md)                                                                                         |
| Hand-written workflow tools                      | `packages/mcp/src/workflow/`        | [Workflow tools in detail](docs/mcp/workflow-tools.md), [MCP tools](docs/mcp/tools.md#workflow-tools)                  |
| Which tools a server lists, and its instructions | `packages/mcp/src/server.ts`        | [Which tools the server lists](docs/mcp/tools.md#which-tools-the-server-lists), [Compatibility](docs/compatibility.md) |
| CLI flags and environment variables              | `packages/mcp/src/config.ts`        | [MCP server settings](docs/mcp/configuration.md)                                                                       |
| The HTTP handler and its security defaults       | `packages/mcp/src/http.ts`          | [HTTP server reference](docs/mcp/http-server.md), [limits.md](packages/mcp/docs/limits.md)                             |
| OAuth sign-in, tokens, and the grant store       | `packages/mcp/src/oauth/`           | [OAuth sign-in](docs/mcp/authentication.md), [Run a shared server](docs/mcp/http-and-oauth.md)                         |
| Result size limits                               | `packages/mcp/src/result-budget.ts` | [Result size](docs/mcp/tools.md#result-size)                                                                           |
| The `redmine://issues/{id}` resource             | `packages/mcp/src/resources.ts`     | [Read an issue as a resource](docs/mcp/workflow-tools.md#read-an-issue-as-a-resource)                                  |

### Repository

| Task                         | Start in                                                   |
| ---------------------------- | ---------------------------------------------------------- |
| Docker contract-test servers | `docker/compose.yaml` and `scripts/redmine-env.ts`         |
| Add a Redmine version        | [CONTRIBUTING.md](CONTRIBUTING.md#add-a-redmine-version)   |
| The vendored spec            | `spec/` and [spec/README.md](spec/README.md)               |
| Releases                     | [docs/releasing.md](docs/releasing.md)                     |
| CI                           | `.github/workflows/`                                       |
| User documentation           | `docs/`, indexed in [docs/README.md](docs/README.md)       |
| Design decisions             | [docs/architecture.md](docs/architecture.md) and `.audit/` |

## Run the checks

Run these from the repository root unless the table says otherwise. [Run the checks](CONTRIBUTING.md#run-the-checks) explains each command.

| Change                          | Run                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Any change                      | `vp check`                                                                               |
| Code                            | `vp run ready`                                                                           |
| Documentation only              | `vp check`, `vp run docs:check`, `vp test readme.test docs.test`, and `git diff --check` |
| The generator or the overlay    | `vp run gen:check` in `packages/sdk`                                                     |
| Behavior against a real Redmine | The contract tests in [CONTRIBUTING.md](CONTRIBUTING.md#run-the-contract-tests)          |

`vp check --fix` formats what it can. `vp run` caches results by input files, so add `--no-cache` to force a rerun. A change to documentation alone needs no Docker servers.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
