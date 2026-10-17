# Run plan: redmine-ts-sdk MVP

Playbook: figure-it-out (user stepped away; large greenfield build).

## Done predicate

All of these hold on `main`, checked by commands a reviewer can rerun:

1. `vp check` passes (oxfmt, oxlint type-aware, typecheck).
2. `vp run -r test` passes (unit tests on a fake fetch).
3. `vp run -r build` produces `packages/sdk/dist`, and publint plus attw report no errors on the packed tarball.
4. Contract tests pass against real Docker Redmine 7.0 and 6.1 (and 7.0 under a `/redmine` subpath if the harness supports it): issues, projects, users, time entries CRUD; pagination; filters; upload + attach + download; typed errors (404, 422, 401, 412 impersonation).
5. Regenerating from the vendored specs produces no diff (codegen drift gate).
6. README shows real usage that compiles (examples typechecked).

## Phases

- [x] A. Frame: read research, measure spec drift, pick MVP scope.
- [x] Scaffold: vp monorepo, packages/sdk, vendored specs. Commit e624108.
- [x] Harness: Docker Redmine 7.0/6.1 and 7.0 under /redmine, seeded, idempotent `up`, `smoke` 15/15 from main. Commit 56f4672.
- [x] Design: arena with 3 runners, GPT cross-judge, synthesis in `docs/architecture.md` and the typed contract in `packages/sdk/src/core`. Commit 730431e.
- [x] Wave 1: generator (Opus) and core runtime (Sonnet), integrated with sparse-include fix and direct extras wiring; built dist smoke-tested on all three servers. Commits fc82b40..742357f.
- [x] Wave 2: contract suite, 240 cases on 7.0, 6.1 and 7.0 under /redmine (Sonnet); public input types, examples and READMEs with a drift test (Opus). Commits 89b9613, 7fb61f2, 73f6b51.
- [x] Wave 3: folded into earlier waves. Packaging gates since ca525eb; README examples typechecked and drift-tested; contract findings documented.
- [x] Verify the whole predicate on main: `vp run ready` green, test:contract 240/240 twice, gen:check clean.
- [x] Trail review by claude-sonnet-5-5 (Claude only per the owner). Flags addressed where structural (uncached ready), the rest handed to the owner.

## Rigor

High on the public API shape and the version strategy (the user explicitly questioned it, and it is the costliest thing to change after publish). Medium on mechanical facade code, where contract tests carry the weight.
