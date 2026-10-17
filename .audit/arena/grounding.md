# Grounding: redmine-ts-sdk architecture

## The job

Design the architecture of `redmine-ts-sdk`, a modern TypeScript client for the Redmine REST API. The repository is `/Users/moddi3/projects/redmine-ts` (read-only for you). It is a fresh Vite+ monorepo. The SDK lives in `packages/sdk` (currently a "hello world" stub). Later packages will add an MCP server and an agent toolkit on top of the SDK, so the SDK must expose what those need, but the MVP is the client itself.

Consumers: TypeScript developers importing the client in Node 22+, Bun, Deno, edge runtimes, and browsers (through a proxy). Also, later, our own MCP server and LLM tool layer.

## Read these first

1. `/Users/moddi3/projects/redmine-ts/research.md`. The owner's research (Russian). It proposes: generated wire types + operation registry from the community OpenAPI spec, hand-written core (transport, pagination, filters, errors, uploads), a facade, snake_case on the wire, per-version subpath entrypoints (`redmine-ts-sdk/6.1`, `/7.0`), and many concrete Redmine pain points (subpath base URLs, API key only in header, empty PUT/DELETE bodies, 422 localized error arrays, `hours` as "8/1" in 6.0.1, uploads as octet-stream two-step, offset drift, `X-Redmine-Switch-User` 412, custom fields single vs multiple, journal `details` with string ids, include=allowed_statuses).
2. The vendored specs: `/Users/moddi3/projects/redmine-ts/spec/redmine-openapi/7.0.1-r1.yaml` and `6.1.3-r1.yaml` (OpenAPI 3.0.3, ~94 operations, 39 schemas, 23 shared parameters). Paths use a `.{format}` suffix (`/issues/{issue_id}.{format}`). Shared params include `offset`, `limit`, `nometa`, `x_redmine_switch_user` header. Features used: `nullable` (100x), `oneOf` (7x), `enum` (56x), `format: binary` (4x), `additionalProperties` (3x). No allOf/anyOf, no vendor extensions, no readOnly.

## Measured facts (from a structural diff of the two pinned specs)

- 6.1.3-r1 to 7.0.1-r1: exactly 1 operation added (`DELETE /groups/{group_id}/users` bulk remove), 0 removed. 3 schemas changed, all additive: `wiki_page.summary` gained `project`, `custom_field` gained `is_for_all`, `default_value_mode`, `projects`; `issue` journal items gained `required` lists (spec precision, not a server change). 2 operations changed in descriptions only.
- Spec tags exist for 6.1.x and 7.0.x only. 6.0 would need to be derived. 7.1 (Documents API, server ignores client content_type on upload) is not released in the spec yet.
- Redmine does not report its version over the API.
- Official Docker images `redmine:6.1` and `redmine:7.0` are pulled locally and will back contract tests.

## The owner's open challenge (decide it on evidence)

The owner uses a generic MCP (list OpenAPI paths + send any request) daily and "it just works" across Redmine versions. The per-version subpath design in research.md bothers them. They explicitly invited a better architecture for multi-version support if you can articulate why. Do not just accept or reject research.md: design what you believe is best and justify it against the measured drift above.

## Fixed constraints

- Toolchain: Vite+ (`vp`), tsdown via `vp pack`, oxlint/oxfmt via `vp check`, Vitest via `vp test`. TypeScript 7 (tsgo). ESM only, `sideEffects: false`, engines node >=22.
- Runtime: zero runtime dependencies is the target. No `node:` imports in the SDK source. Inject `fetch`.
- Generated code comes from the vendored spec through our own generator script (build time). Generated output is committed so builds need no network.
- snake_case on the wire and in the public data types (the owner's research argues this; keep it unless you have a strong reason).
- No `@modelcontextprotocol/sdk` dependency in the SDK.

## What to produce

A candidate design package per the architect runner prompt: README-style usage and 2-3 call sites first, then the type sketch (module map, core types, key signatures with `not implemented` bodies), then the one-page rationale per the rationale template. Cover at least:

1. Version strategy, with the user-facing API and the maintainer cost of adding Redmine 7.1.
2. What the generator emits (types, operation registry with metadata, schemas) and the seam between generated and hand-written code.
3. Core: transport, auth (API key header, Basic, Bearer with refresh), errors as a typed model, retries/idempotency, timeouts, concurrency limit, base URL with subpath, empty bodies, impersonation per call.
4. Pagination (async iteration, limit 100, guard against servers ignoring limit) and the filter DSL compiled to Redmine operator syntax.
5. Facade for issues, projects, users, time entries (MVP), plus how every other operation is reachable with full types on day one.
6. Uploads/downloads.
7. Testing strategy: fake transport unit tests and contract tests against real Docker Redmine 6.1 and 7.0.
8. How the later agent toolkit/MCP derives tools from the same source without redesign.

Keep it implementable by a few agents in one working session. Favor a small, deep public surface.
