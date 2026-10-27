# Contract-test Redmine servers

Real Redmine servers in Docker for SDK contract tests. Each uses the image's built-in SQLite, so there is no database container. `DATABASE_URL` in `docker/compose.yaml` gives SQLite a 5-second busy timeout, which the image's `database.yml` lacks. Without it, parallel test files that write at once get 500s with `database is locked`.

## Commands

From the repo root:

- `pnpm redmine:up` starts the servers, seeds them, and writes `.redmine/env.json`. Safe to rerun.
- `pnpm redmine:smoke` runs a REST sanity check against every server and exits non-zero on failure.
- `pnpm redmine:down` removes the containers and volumes, which wipes all data.
- `node scripts/redmine-env.ts env` prints `.redmine/env.json`.

## Servers

| Key           | Service             | Version | URL                             |
| ------------- | ------------------- | ------- | ------------------------------- |
| `7.0`         | `redmine70`         | 7.0     | `http://localhost:3070`         |
| `6.1`         | `redmine61`         | 6.1     | `http://localhost:3061`         |
| `7.0-subpath` | `redmine70-subpath` | 7.0     | `http://localhost:3071/redmine` |

The subpath server catches clients that build URLs with `new URL('/issues.json', base)`, which drops `/redmine/`. The image's `rails server` ignores `RAILS_RELATIVE_URL_ROOT` for routing, so a small config.ru, inlined in `docker/compose.yaml` as a compose config, mounts the app under it. Nothing in the compose file references a host path, so `up` from any checkout or worktree yields the same containers instead of recreating them, and the seed sets fixed API keys.

## Seeded state

- REST API enabled and default data loaded (trackers, statuses, priorities, roles, time entry activities).
- `admin` (password `sdk-admin-pass-1`) and `jsmith` (password `sdk-user-pass-1`), both active with no forced password change, each with an API key.
- Public project `sdk-test` with all trackers and the issue tracking, time tracking, wiki, news, files and documents modules. `jsmith` is a Developer member.
- `oeditor` (password `sdk-own-editor-pass-1`), a member of `sdk-test` with the `Own Issues Editor` role, which may view and add issues and edit only its own. It has no API key, so tests act as it with `as`.
- Issue custom fields `Severity` (list S1, S2, S3, single value) and `Tags` (list a, b, c, multiple), for all projects and trackers, both usable as `cf_<id>` filters. Redmine silently ignores a `cf_<id>` filter on a field without `is_filter`, so the seed sets it.

## Timing

The images must already be pulled (`docker pull redmine:7.0 redmine:6.1`). A cold `up` from no containers takes about 25 seconds, mostly Rails boot and `db:migrate`. A rerun on running servers takes under 10 seconds.
