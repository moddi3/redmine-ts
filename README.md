# redmine-ts

[![CI](https://github.com/moddi3/redmine-ts/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/moddi3/redmine-ts/actions/workflows/ci.yml)
[![sdk on npm](https://img.shields.io/npm/v/@redmine-ts/sdk?label=%40redmine-ts%2Fsdk)](https://www.npmjs.com/package/@redmine-ts/sdk)
[![mcp on npm](https://img.shields.io/npm/v/@redmine-ts/mcp?label=%40redmine-ts%2Fmcp)](https://www.npmjs.com/package/@redmine-ts/mcp)

A typed TypeScript client for Redmine, and an MCP server that lets ChatGPT, Claude, and your coding agents work in Redmine as you.

| Package                           | Path           | What it is                                                                                                                                                       |
| --------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@redmine-ts/sdk`](packages/sdk) | `packages/sdk` | A typed, zero-dependency client for the Redmine REST API, for Redmine 6.1 and 7.0. It runs on Node 22 or later and Bun. Browsers need a proxy, and are untested. |
| [`@redmine-ts/mcp`](packages/mcp) | `packages/mcp` | An MCP server with 93 tools over stdio or Streamable HTTP. claude.ai and ChatGPT sign people in through Redmine's own OAuth.                                     |

The MCP server builds its tools from the SDK's `@redmine-ts/sdk/catalog` entrypoint, which describes each method's input and output as JSON Schema, with its `since` version and its HTTP method. CI runs the contract tests of both packages against real Redmine 6.1 and 7.0 servers in Docker, as [Run real Redmine servers](#run-real-redmine-servers) describes.

## Built on redmine-openapi

The SDK's types, operation registry, and namespaces are generated from [redmine-openapi](https://github.com/d-yoshi/redmine-openapi) by [d-yoshi](https://github.com/d-yoshi). It is an unofficial OpenAPI 3.0.3 description of the Redmine REST API, tested against live Redmine servers and released under the MIT license. Without it, this project would have had to describe roughly 94 operations and 39 schemas by hand.

This repo vendors pinned tags of the spec in [spec/redmine-openapi/](spec/redmine-openapi/), currently `6.1.3-r1` and `7.0.2-r1`, together with its license. [spec/README.md](spec/README.md) explains how the copy is updated. The generator's overlay records naming and visibility decisions for this SDK. It patches the spec in one place only. `corrections` in [packages/sdk/generator/overlay.ts](packages/sdk/generator/overlay.ts) marks six issue fields as required, because Redmine always sends them and the spec leaves them optional. Each correction states its reason. Generation fails once a corrected field no longer changes the merged spec, so an upstream fix forces the correction's removal. Any other wrong field or operation belongs upstream: report it at [d-yoshi/redmine-openapi/issues](https://github.com/d-yoshi/redmine-openapi/issues).

## Set up

The repo uses [Vite+](https://viteplus.dev), so every command goes through the `vp` CLI. You need Node 22.18 or later and `vp` on your `PATH`. Contract tests also need Docker.

```sh
vp install
```

Run `vp install` again after you pull changes.

## Check, test, and build

Run these from the repo root:

| Command           | What it does                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `vp check`        | Checks formatting, lints, and typechecks everything, including the SDK's type tests and `examples/`.    |
| `vp run -r test`  | Runs the unit and generator tests of every package. Contract tests skip when no server is up.           |
| `vp run -r build` | Builds every package. Each build runs publint and Are the Types Wrong and fails on any issue.           |
| `vp run ready`    | Runs the three commands above, building before testing, because the MCP HTTP tests start the built CLI. |

Run these from `packages/sdk`:

| Command                | What it does                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `vp run gen`           | Regenerates `src/generated/` from `spec/redmine-openapi/*.yaml` and prints the drift report. |
| `vp run gen:check`     | Regenerates in memory and fails if the committed `src/generated/` differs.                   |
| `vp run test:contract` | Runs the contract tests against the Docker servers. Fails if the servers are not up.         |

`packages/mcp` has its own `vp run test:contract`, which runs the MCP tools against the same servers.

Never edit `src/generated/` by hand. Change the generator in `packages/sdk/generator/` and run `vp run gen`.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, for example `fix(sdk): retry 503 on GET only`. The `commit-msg` hook in `.vite-hooks/` rejects any other first line. A user-facing change also needs a changeset (`vp run changeset`), which drives the version bump and the changelog. See [docs/releasing.md](docs/releasing.md).

CI also lints the workflows with [jactionlint](https://github.com/jdx/jactionlint), which runs actionlint's checks plus security and pinning rules: every action is pinned to a commit SHA, and Dependabot updates the pins after a 7-day cooldown. To run it locally: `docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/jdx/jactionlint:2.2.0`, or `mise use jactionlint` and `jactionlint`. `--online --fix` pins a newly added action.

## Run real Redmine servers

Contract tests run against Redmine 7.0, Redmine 6.1, and Redmine 7.0 under a `/redmine` subpath, all in Docker. Run these from the repo root:

```sh
node scripts/redmine-env.ts up     # start and seed the servers, write .redmine/env.json
node scripts/redmine-env.ts smoke  # REST sanity check against every server
node scripts/redmine-env.ts down   # remove the containers and all their data
```

[docker/README.md](docker/README.md) lists the ports, the seeded users and projects, and the timings.

## Add a Redmine version

These steps use 7.1 as the example. Adding a version is a minor release, and nobody has to change an import.

1. Vendor the pinned spec tag: `spec/fetch.sh 7.1.0-r1`. Pin an exact tag, because the spec's revisions can contain breaking fixes.
2. In `packages/sdk`, run `vp run gen`. The version list comes from the spec file names, so `7.1` appears in `VERSIONS` without other edits.
3. Read the drift report that `vp run gen` prints. It lists added operations, schemas, and properties. A non-additive change, such as a changed type or a removed property, fails generation until you record a decision in `packages/sdk/generator/overlay.ts`.
4. Add a `redmine:7.1` service to `docker/compose.yaml`, add it to `servers` in `scripts/redmine-env.ts`, and map it to its version in `packages/sdk/tests/contract/env.ts`.
5. Run `node scripts/redmine-env.ts up` and `vp run test:contract` in `packages/sdk`.

Dropping a version that reached end of life is a major release.

## Release and plan

- [docs/releasing.md](docs/releasing.md) explains how a change gets a changeset, how the Version Packages pull request and the npm publish work, and what CI and the weekly workflow check.
- [docs/roadmap.md](docs/roadmap.md) lists planned work, such as Redmine 7.1 support and smaller MCP tool schemas, and marks what comes next.

## Where the design lives

- [docs/architecture.md](docs/architecture.md) explains the design and why it is this way: one entrypoint for all versions, the operation registry, retries, pagination, and testing.
- [.audit/](.audit/) holds the record behind it. `arena/` has the three competing designs and the judge's scores, `decisions.tsv` logs each decision with its evidence, `plan.md` is the build plan, `probes/` has scripts and their output against real Redmine servers, and `research/` has the briefs behind later decisions, such as OAuth and evals.
