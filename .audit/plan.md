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
- [ ] Harness: Docker Redmine 7.0/6.1 seeded, idempotent `up`, `smoke` green. (worker, worktree)
- [ ] Design: architect/arena with 3 runners (Opus free, Sonnet free, Opus steelmanning per-version subpaths), cross-judge on a different model family, synthesis committed as `docs/architecture.md` plus the type sketch.
- [ ] Wave 1 (parallel worktrees): codegen (types, operation registry, since, drift gate) and core runtime (transport, auth, errors, retries, timeouts, concurrency, base URL, pagination, filter DSL) against the sketch's seam.
- [ ] Wave 2: facade (issues, projects, users, time entries, uploads/downloads, reference data) and contract tests.
- [ ] Wave 3: packaging gates (publint, attw), README with typechecked examples, fixes from contract runs.
- [ ] Verify the whole predicate on main. Cross-model review of the trail. Reply.

## Rigor

High on the public API shape and the version strategy (the user explicitly questioned it, and it is the costliest thing to change after publish). Medium on mechanical facade code, where contract tests carry the weight.
