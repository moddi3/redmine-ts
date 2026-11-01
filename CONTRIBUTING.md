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

| Command             | What it does                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp check`          | Checks formatting, lints, and typechecks everything, including the SDK's type tests and both packages' `examples/`.                                  |
| `vp run docs:check` | Checks that every link and anchor in the Markdown resolves, that package READMEs link by absolute URL, and that every code fence names its language. |
| `vp run -r test`    | Runs the unit and generator tests of every package. Contract tests skip when no server is up.                                                        |
| `vp run -r build`   | Builds every package. Each build runs publint and Are the Types Wrong and fails on any issue.                                                        |
| `vp run ready`      | Runs the four commands above. It builds before it tests, because the MCP HTTP tests start the built CLI.                                             |

`vp check --fix` formats the files it can. A pull request is ready for review when `vp run ready` passes.

`vp run` caches results by input files. To force a rerun, as CI does, add `--no-cache`, for example `vp run --no-cache -r test`.

## Run the contract tests

Contract tests run both packages against real Redmine servers in Docker: Redmine 7.0, Redmine 6.1, and Redmine 7.0 under a `/redmine` subpath. Pull the images once with `docker compose -f docker/compose.yaml pull`, as CI does.

1. From the repository root, start and seed the servers:

   ```sh
   node scripts/redmine-env.ts up
   ```

   The script prints `ready and seeded` for each server, then `wrote` with the path of `.redmine/env.json`, which the tests read.

2. In `packages/sdk`, run `vp run --no-cache test:contract`.
3. From the repository root, run `vp run -r build`. The MCP contract tests start the built CLI.
4. In `packages/mcp`, run `vp run --no-cache test:contract`.
5. From the repository root, remove the containers and all their data:

   ```sh
   node scripts/redmine-env.ts down
   ```

Contract tests fail when the servers are not up. `node scripts/redmine-env.ts smoke` runs a REST sanity check against every server. Use `node scripts/redmine-env.ts up` instead of `vp run redmine:up`. Docker state is not an input of the `vp run` cache, so after Docker restarts, `vp run redmine:up` can replay an old success and start nothing. [docker/README.md](docker/README.md) lists the ports, the seeded users and projects, and the timings.

## Regenerate the SDK

The generator in `packages/sdk/generator/` reads the vendored spec in `spec/redmine-openapi/` and writes the SDK's types, operations, namespaces, and catalog to `packages/sdk/src/generated/`. Never edit `src/generated/` by hand. Change the generator instead, and run these commands from `packages/sdk`:

| Command            | What it does                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `vp run gen`       | Regenerates `src/generated/` from `spec/redmine-openapi/*.yaml` and prints the drift report. |
| `vp run gen:check` | Regenerates in memory and fails if the committed `src/generated/` differs. CI runs it.       |

`packages/sdk/generator/overlay.ts` holds every decision this SDK makes about the spec: names, hidden operations, and descriptions that are wrong for an older supported release. The one change it makes to the vendored specs is `optional`, which keeps a property optional while an older spec wrongly declares it. Generation fails once an entry no longer changes the merged spec. Report a wrong field or operation upstream, at [d-yoshi/redmine-openapi/issues](https://github.com/d-yoshi/redmine-openapi/issues). [spec/README.md](spec/README.md) explains how to update the vendored copy.

## Add a Redmine version

These steps use 7.1 as the example. Adding a version is a minor release, and nobody has to change an import.

1. Vendor the pinned spec tag with `spec/fetch.sh 7.1.0-r1`. Pin an exact tag, because the spec's revisions can contain breaking fixes.
2. In `packages/sdk`, run `vp run gen`. The version list comes from the spec file names, so `7.1` appears in `VERSIONS` without other edits.
3. Read the drift report that `vp run gen` prints. It lists added operations, schemas, and properties. A non-additive change, such as a changed type or a removed property, fails generation until you record a decision in `packages/sdk/generator/overlay.ts`.
4. Add a `redmine:7.1` service to `docker/compose.yaml` and add it to `servers` in `scripts/redmine-env.ts`.
5. Map the new server key to its version where the tests read it: `packages/sdk/tests/contract/env.ts`, `packages/mcp/tests/contract/servers.ts`, and `scripts/runtime-smoke.mjs`. Today, each file maps every key that does not start with `6.1` to `7.0`.
6. Run the contract tests as [Run the contract tests](#run-the-contract-tests) describes.

Dropping a version that reached end of life is a major release.

## Write commits and changesets

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) in the form `type(scope): subject`, such as `fix(sdk): retry 503 on GET only`. The `commit-msg` hook in `.vite-hooks/` rejects any other first line.
- A user-facing change to a published package needs a changeset. Run `vp run changeset` and commit the file it writes. A change to a package README needs a `patch` changeset, because npm shows the README of the last release. A change only to tests, CI, or other documentation needs none. [docs/releasing.md](docs/releasing.md#add-a-changeset-to-your-change) explains how to pick the bump.

## Lint the workflows

CI lints `.github/workflows/` with [jactionlint](https://github.com/jdx/jactionlint), which runs actionlint's checks plus security and pinning rules. Every action is pinned to a commit SHA, and Dependabot updates the pins after a 7-day cooldown. To run it locally, use `docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/jdx/jactionlint:2.2.0`, or `mise use jactionlint` and then `jactionlint`. `jactionlint --online --fix` pins a newly added action.

## Update the docs with your change

A pull request that changes what users see also updates the pages that describe it. That covers behavior, defaults, limits, flags, environment variables, errors, tools, and public types.

1. Find the pages. [AGENTS.md](AGENTS.md#find-where-a-task-starts) maps each source area to the pages that describe it. Then search the docs for each name and number you changed:

   ```sh
   rg -n '<name>' README.md packages/*/README.md packages/mcp/docs docs
   ```

2. Update every page that states the old behavior. Each fact has one home, and other pages link to it, as [the style guide](docs/style-guide.md#keep-one-home-for-each-fact) describes.
3. If a package README changed, add a `patch` changeset, as [Write commits and changesets](#write-commits-and-changesets) describes.
4. Run `vp run docs:check` and `vp test readme.test docs.test`.
5. In the pull request description, list the pages you changed, or say why no page needed a change.

The docs are done when both checks pass and the search finds no page that still states the old behavior.

## Keep the code on the pages compiling

Two tests keep the code on the pages compiling, and `vp check` typechecks the examples they read:

- `packages/sdk/tests/unit/readme.test.ts` requires every `ts` block in the root README, the SDK README, `docs/architecture.md`, and each page in `docs/sdk/` to be an exact excerpt of a file in `packages/sdk/examples/`. It also requires the namespace table in `docs/sdk/reference.md` to match the client.
- `packages/mcp/tests/unit/docs.test.ts` requires the same of the MCP README and each page in `docs/mcp/`, against `packages/mcp/examples/`. The Bun and Workers examples there have their own `tsconfig.json`, which loads the Bun or Workers types.

To change an example, change the example file first, then copy the lines into the page. To run both tests, run `vp test readme.test docs.test` from the repository root. `vp run docs:check` finds broken links and anchors, and code fences without a language. [The documentation style guide](docs/style-guide.md) covers page types, links, and wording.

## Find the design record

- [docs/architecture.md](docs/architecture.md) explains the design and why it is this way.
- [.audit/](.audit/) holds the record behind the design. `arena/` has the three competing SDK designs and the judge's scores. `decisions.tsv` logs each decision with its evidence. `plan.md` is the first build plan. `probes/` has scripts and their output against real Redmine servers. `research/` has the briefs behind later decisions, such as OAuth and evals.
