# redmine-ts

TypeScript tooling for the Redmine REST API.

| Package                           | Path           | What it is                                                                              |
| --------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| [`@redmine-ts/sdk`](packages/sdk) | `packages/sdk` | Typed, zero-dependency Redmine client for Node, Bun, Deno, and browsers behind a proxy. |

The SDK is the base for an MCP server and an agent toolkit. Neither is in the repo yet. The operation registry already carries what they need: each operation's `since` version, its safety class, and a flat input that can become a tool's JSON input.

## Set up

The repo uses [Vite+](https://viteplus.dev), so every command goes through the `vp` CLI. You need Node 22.18 or later and `vp` on your `PATH`. Contract tests also need Docker.

```sh
vp install
```

Run `vp install` again after you pull changes.

## Check, test, and build

Run these from the repo root:

| Command           | What it does                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `vp check`        | Checks formatting, lints, and typechecks everything, including the SDK's type tests and `examples/`. |
| `vp run -r test`  | Runs the unit and generator tests of every package. Contract tests skip when no server is up.        |
| `vp run -r build` | Builds every package. The SDK build runs publint and Are the Types Wrong and fails on any issue.     |
| `vp run ready`    | Runs the three commands above in order.                                                              |

Run these from `packages/sdk`:

| Command                | What it does                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `vp run gen`           | Regenerates `src/generated/` from `spec/redmine-openapi/*.yaml` and prints the drift report. |
| `vp run gen:check`     | Regenerates in memory and fails if the committed `src/generated/` differs.                   |
| `vp run test:contract` | Runs the contract tests against the Docker servers. Fails if the servers are not up.         |

Never edit `src/generated/` by hand. Change the generator in `packages/sdk/generator/` and run `vp run gen`.

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

## Where the design lives

- [docs/architecture.md](docs/architecture.md) explains the design and why it is this way: one entrypoint for all versions, the operation registry, retries, pagination, and testing.
- [.audit/](.audit/) holds the record behind it. `arena/` has the three competing designs and the judge's scores, `decisions.tsv` logs each decision with its evidence, `plan.md` is the build plan, and `probes/` has scripts and their output against real Redmine servers.
- [research.md](research.md) is the original research, in Russian.
