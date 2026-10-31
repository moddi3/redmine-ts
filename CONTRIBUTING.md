# Contributing

This guide covers the local setup, the checks a change must pass, and the conventions of this repository. [docs/releasing.md](docs/releasing.md) covers how a merged change reaches npm.

## Set up the repository

You need Node 22.18 or later and the [Vite+](https://viteplus.dev) CLI, `vp`, on your `PATH`. Every command in this repository goes through `vp`. Contract tests also need Docker.

```sh
vp install
```

Run `vp install` again after you pull changes.

## Run the checks

Run these from the repository root:

| Command           | What it does                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `vp check`        | Checks formatting, lints, and typechecks everything, including the SDK's type tests and `examples/`.    |
| `vp run -r test`  | Runs the unit and generator tests of every package. Contract tests skip when no server is up.           |
| `vp run -r build` | Builds every package. Each build runs publint and Are the Types Wrong and fails on any issue.           |
| `vp run ready`    | Runs the three commands above, building before testing, because the MCP HTTP tests start the built CLI. |

`vp check --fix` formats the files it can. A pull request is ready for review when `vp run ready` passes.

`vp run` caches results by input files. To force a rerun, as CI does, add `--no-cache`, for example `vp run --no-cache -r test`.

## Run the contract tests

Contract tests run both packages against real Redmine servers in Docker: Redmine 7.0, Redmine 6.1, and Redmine 7.0 under a `/redmine` subpath. Pull the images once with `docker pull redmine:7.0 redmine:6.1`.

1. From the repository root, start and seed the servers:

   ```sh
   node scripts/redmine-env.ts up
   ```

   It prints `ready and seeded` for each server, then `wrote` with the path of `.redmine/env.json`, which the tests read.

2. In `packages/sdk`, run `vp run --no-cache test:contract`.
3. From the repository root, run `vp run -r build`. The MCP contract tests start the built CLI.
4. In `packages/mcp`, run `vp run --no-cache test:contract`.
5. From the repository root, remove the containers and all their data:

   ```sh
   node scripts/redmine-env.ts down
   ```

Contract tests fail when the servers are not up. `node scripts/redmine-env.ts smoke` runs a REST sanity check against every server. Use `node scripts/redmine-env.ts up` rather than `vp run redmine:up`. Docker state is not an input of the `vp run` cache, so after Docker restarts, `vp run redmine:up` can replay an old success and start nothing. [docker/README.md](docker/README.md) lists the ports, the seeded users and projects, and the timings.

## Regenerate the SDK

The SDK's types, operations, namespaces, and catalog in `packages/sdk/src/generated/` are generated from the vendored spec in `spec/redmine-openapi/`. Never edit `src/generated/` by hand. Change the generator in `packages/sdk/generator/` instead, and run these from `packages/sdk`:

| Command            | What it does                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `vp run gen`       | Regenerates `src/generated/` from `spec/redmine-openapi/*.yaml` and prints the drift report. |
| `vp run gen:check` | Regenerates in memory and fails if the committed `src/generated/` differs. CI runs it.       |

`packages/sdk/generator/overlay.ts` holds every decision this SDK makes about the spec: names, hidden operations, and fixes. It patches the spec in one place only. `corrections` marks six issue fields as required, because Redmine always sends them and the spec leaves them optional. Each correction states its reason. Generation fails once a corrected field no longer changes the merged spec, so an upstream fix forces the correction's removal. Any other wrong field or operation belongs upstream, at [d-yoshi/redmine-openapi/issues](https://github.com/d-yoshi/redmine-openapi/issues). [spec/README.md](spec/README.md) explains how to update the vendored copy.

## Add a Redmine version

These steps use 7.1 as the example. Adding a version is a minor release, and nobody has to change an import.

1. Vendor the pinned spec tag: `spec/fetch.sh 7.1.0-r1`. Pin an exact tag, because the spec's revisions can contain breaking fixes.
2. In `packages/sdk`, run `vp run gen`. The version list comes from the spec file names, so `7.1` appears in `VERSIONS` without other edits.
3. Read the drift report that `vp run gen` prints. It lists added operations, schemas, and properties. A non-additive change, such as a changed type or a removed property, fails generation until you record a decision in `packages/sdk/generator/overlay.ts`.
4. Add a `redmine:7.1` service to `docker/compose.yaml` and add it to `servers` in `scripts/redmine-env.ts`.
5. Map the new server key to its version where the tests read it: `packages/sdk/tests/contract/env.ts`, `packages/mcp/tests/contract/servers.ts`, and `scripts/runtime-smoke.mjs`. Each of them maps every key that does not start with `6.1` to `7.0` today.
6. Run the contract tests as [Run the contract tests](#run-the-contract-tests) describes.

Dropping a version that reached end of life is a major release.

## Write commits and changesets

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, for example `fix(sdk): retry 503 on GET only`. The `commit-msg` hook in `.vite-hooks/` rejects any other first line.
- A user-facing change to a published package needs a changeset. Run `vp run changeset` and commit the file it writes. A change to tests, CI, or docs needs none. [docs/releasing.md](docs/releasing.md#add-a-changeset-to-your-change) explains how to pick the bump.

## Lint the workflows

CI lints `.github/workflows/` with [jactionlint](https://github.com/jdx/jactionlint), which runs actionlint's checks plus security and pinning rules. Every action is pinned to a commit SHA, and Dependabot updates the pins after a 7-day cooldown. To run it locally, use `docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/jdx/jactionlint:2.2.0`, or `mise use jactionlint` and then `jactionlint`. `jactionlint --online --fix` pins a newly added action.

## Change the documentation

`packages/sdk/tests/unit/readme.test.ts` requires every `ts` block in the SDK README to be an exact excerpt of a file in `packages/sdk/examples/`, which `vp check` typechecks. To change an example, change the example file first, then copy the lines into the page.

## Find the design record

- [docs/architecture.md](docs/architecture.md) explains the design and why it is this way.
- [.audit/](.audit/) holds the record behind it. `arena/` has the three competing SDK designs and the judge's scores, `decisions.tsv` logs each decision with its evidence, `plan.md` is the first build plan, `probes/` has scripts and their output against real Redmine servers, and `research/` has the briefs behind later decisions, such as OAuth and evals.
