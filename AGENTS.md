# Agent guide

This repository holds two npm packages. `@redmine-ts/sdk` in `packages/sdk` is a typed client for the Redmine REST API. `@redmine-ts/mcp` in `packages/mcp` is an MCP server built on it. [CONTRIBUTING.md](CONTRIBUTING.md) is the full contributor guide. This page maps tasks to the files that own them and lists the checks to run before you hand work back.

## Rules

- Commit messages follow Conventional Commits (`type(scope): subject`, such as `feat(sdk): add conflict kind` or `chore(audit): log decisions`). `.vite-hooks/commit-msg` rejects anything else.
- A user-facing change to a published package needs a changeset, written with `vp run changeset`. A change to a package README needs a `patch` changeset, because npm shows the README of the last release. A change only to tests, CI, or other documentation needs none. [docs/releasing.md](docs/releasing.md#add-a-changeset-to-your-change) holds the rule.
- Never edit `packages/sdk/src/generated/` by hand. Change `packages/sdk/generator/` and run `vp run gen` in `packages/sdk`.
- Every `ts` block in `README.md`, `packages/sdk/README.md`, `docs/architecture.md`, and `docs/sdk/` is an exact excerpt of a file in `packages/sdk/examples/`. Every `ts` block in `packages/mcp/README.md` and `docs/mcp/` is an exact excerpt of a file in `packages/mcp/examples/`. Change the example first, then copy the lines.
- Write documentation as [docs/style-guide.md](docs/style-guide.md) describes.

## Find where a task starts

### SDK

| Task                                                     | Start in                                     |
| -------------------------------------------------------- | -------------------------------------------- |
| Fetch, timeouts, the concurrency limit, and retries      | `packages/sdk/src/core/engine.ts`            |
| Planning a request and reading its response              | `packages/sdk/src/core/wire.ts`              |
| Filters under `where`, and pagination                    | `packages/sdk/src/core/listing.ts`           |
| Uploads and downloads                                    | `packages/sdk/src/core/files.ts`             |
| Acting as another user                                   | `packages/sdk/src/core/impersonation.ts`     |
| Response fixes that `normalize: false` turns off         | `packages/sdk/src/core/quirks.ts`            |
| Config, auth, and access modes                           | `packages/sdk/src/core/config.ts`            |
| Error kinds                                              | `packages/sdk/src/core/errors.ts`            |
| The client and its hand-written methods                  | `packages/sdk/src/redmine.ts`                |
| Generated types, operations, namespaces, and the catalog | `packages/sdk/generator/`, then `vp run gen` |
| Names, hidden operations, and fixes to the spec          | `packages/sdk/generator/overlay.ts`          |

### MCP server

| Task                                             | Start in                            |
| ------------------------------------------------ | ----------------------------------- |
| Tools built from the SDK catalog                 | `packages/mcp/src/catalog-tools.ts` |
| Hand-written workflow tools                      | `packages/mcp/src/workflow/`        |
| Which tools a server lists, and its instructions | `packages/mcp/src/server.ts`        |
| CLI flags and environment variables              | `packages/mcp/src/config.ts`        |
| The HTTP handler and its security defaults       | `packages/mcp/src/http.ts`          |
| OAuth sign-in, tokens, and the grant store       | `packages/mcp/src/oauth/`           |
| Result size limits                               | `packages/mcp/src/result-budget.ts` |
| The `redmine://issues/{id}` resource             | `packages/mcp/src/resources.ts`     |

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
