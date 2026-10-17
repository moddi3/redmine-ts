# redmine-ts-sdk architecture

This is the synthesized design from a three-way design bakeoff, with candidates in `.audit/arena/`. The type contract lives in `packages/sdk/src/core/*.ts`. Bodies marked `not implemented` are filled against it.

## Problem

We want a typed, zero-dependency, runtime-agnostic Redmine client that a later MCP server and agent toolkit can sit on. HTTP is not the hard part. These are:

1. The server never reports its version.
2. The community OpenAPI spec (`spec/redmine-openapi/`, pinned tags) is the only structured source of truth.
3. Redmine has many behaviours a naive client gets wrong. Subpath base URLs get dropped, PUT and DELETE return empty bodies, 422 returns localized error arrays, offsets drift, uploads take two steps, impersonation fails with a 412, and `hours` sometimes arrives as `"8/1"`.

## Usage

```ts
import { createRedmine, RedmineError } from "redmine-ts-sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine", // subpath kept
  auth: { apiKey: process.env.REDMINE_API_KEY! }, // X-Redmine-API-Key header only
  version: "6.1", // optional; narrows types and refuses newer operations before any request
});

const issue = await rm.issues.get({ issue_id: 42, include: ["journals", "allowed_statuses"] });
issue.journals; // Journal[]: required because it was included

for await (const i of rm.issues.list({
  where: {
    project_id: "web",
    status_id: "open", // status_id=o
    assigned_to_id: { none: true }, // assigned_to_id=!*
    updated_on: { gte: "2026-10-01" }, // updated_on=>=2026-10-01
    cf_12: ["S1", "S2"], // cf_12=S1|S2
  },
  sort: "updated_on:desc",
})) {
  // pages of 100 under the hood; `break` stops fetching
}

const upload = await rm.attachments.upload({ file: blob, filename: "trace.zip" });
await rm.issues.update({ issue_id: 42, notes: "ack", uploads: [upload] }, { as: "jsmith" });

try {
  await rm.issues.update({ issue_id: 42, subject: "" });
} catch (e) {
  if (RedmineError.is(e, "validation")) show(e.data.messages); // raw and localized: display, never match
}

// @ts-expect-error removeUsers exists since Redmine 7.0; this client declared 6.1
await rm.groups.removeUsers({ group_id: 3, user_ids: [1, 2] });
```

## Shape

### Version strategy: one superset, optional declared version

There is one entrypoint, one runtime and one type model. The research proposed per-version subpaths (`/6.1`, `/7.0`). The measurements below decided against them.

- From 6.1.3-r1 to 7.0.1-r1 the spec added 1 operation (`removeUsersFromGroup`) and removed none. 3 schemas changed, with 4 properties added. Everything else is identical.
- `wiki_page.summary.project` appeared in 7.0.1, a patch release. Types fixed per x.y module would lie to 7.0.0 users anyway. The honest type for a field added later is optional.
- Per-version modules duplicate the whole type surface to express one operation. They force every consumer to rewrite imports on a server upgrade. They also hand a multi-instance MCP server a family of client types instead of one.
- The owner's generic MCP works across versions because Redmine is additively compatible. The SDK keeps that property. With no `version`, every operation is available and unguarded. A 404 from an operation newer than the oldest supported version carries a hint.

The mechanics:

- The generator merges all vendored specs into a superset. An operation's `since` is the first spec that has it, and `until` the last one when a newer spec drops it.
- A property is required only when the latest spec requires it **and** it exists in every supported version's schema. Required lists that grew between spec revisions (the journal `required` lists in 7.0.1) count as spec precision, not server drift. Properties missing from an older version are optional and carry `@since`.
- A non-additive change, such as a type change or a removed property, fails generation until `generator/overlay.ts` records a decision. There is no silent pick.
- `createRedmine<const V>` captures a literal `version`. The generated `Resources<V>` intersects `Additions70` only when `AtLeast<V, "7.0">` holds. This is a lookup table (`Ladder`), not type arithmetic. A wide `RedmineVersion` (from `parseRedmineVersion(env)`) gets the full surface. The runtime guard still applies.
- Patch-level quirks are fixed by symptom in `core/quirks.ts` and the pagination guards, never by version number.

Adding Redmine 7.1 takes five steps. Run `spec/fetch.sh 7.1.0-r1`, then `vp run gen`, and read the drift report. Then add `redmine:7.1` to `docker/compose.yaml` and `scripts/redmine-env.ts`, and ship a minor release. No user changes an import. Dropping an EOL version is a major release.

### Data structures

The central type is `Op<Id, In, Ret>` (`core/op.ts`). It is plain data: method, relative path with `.json` baked in, path params, query styles (`scalar`, `csv`, `brackets`), filter specs, body (`json` with `envelope` and `siblings`, or `binary`), response shape (`item`, `list`, `empty`, `binary`), includes, `since`/`until`, `safety` and `stability`. `In` and `Ret` are phantom types.

- `In` is the canonical flat input: path params, query keys, body fields (inner envelope fields plus siblings), and `where` for filters. It was measured collision-free across all 94 operations, and the generator asserts it.
- `Ret` is `Promise<T>`, `Listing<T>`, `Promise<void>` or `Promise<Download>`.
- Envelopes and the `{ errors: [...] }` body never reach the public API.

Every method is `rm.<namespace>.<verb>(input, options?)`. The input is the same object a tool's JSON input will be, so the later toolkit needs no translation layer for JSON operations.

### Generated versus hand-written

| Generated (`src/generated/`, committed, never edited)                                         | Hand-written                                                          |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `versions.ts`: VERSIONS, Ladder                                                               | `core/op.ts`, the contract generated code imports                     |
| `schemas.ts`: one type per schema, PascalCase, snake_case fields, `@since`/`@stability` JSDoc | `core/engine.ts`, the impure shell: fetch, limiter, retries, timeouts |
| `ops.ts`: the operation registry, data only                                                   | `core/wire.ts`, pure: plan, interpret, retryDecision, decode          |
| `slots.ts`: namespace to verb to op                                                           | `core/listing.ts`: filter DSL compiler, `Listing`                     |
| `resources.ts`: explicit method signatures, `Resources<V>`                                    | `core/config.ts`, `errors.ts`, `files.ts`, `quirks.ts`, `version.ts`  |
|                                                                                               | `redmine.ts`: assembly, the only module importing both halves         |
|                                                                                               | `generator/overlay.ts`: the only hand-written generator input         |

The engine never imports generated operation data, so it is tested against a hand-made registry, and a regenerate cannot change runtime behaviour. `vp run gen:check` regenerates in memory and fails on any diff. `package.json#exports` exposes only `.`, so internals cannot be imported.

Hand-written resource logic lives only in `Extras` (`redmine.ts`): `issues.transition` and `attachments.upload/download/thumbnail`. A type check fails the build if an extra shadows a generated method.

Some scoped variants have a global sibling that takes the same scope as a filter or body field. Examples are `getIssuesByProject` next to `getIssues?project_id=`, `createIssueUnderProject` next to `createIssue`, and `getTimeEntriesByIssue`. These are hidden from namespaces so that each task has one way to do it. They stay in the registry. `rm.request()` is the untyped escape hatch for endpoints the spec does not cover, such as plugins.

### Core behaviour

- **URL.** The base always ends in `/`, and operation paths never start with one, so `new URL(path, base)` keeps `/redmine/`. Userinfo in `baseUrl` is rejected.
- **Auth.** The options are `{ apiKey }`, `{ basic }` and `{ bearer: string | { token, refresh } }`. The API key goes only in `X-Redmine-API-Key`. Bearer refresh is single-flight across concurrent 401s, with one replay, and only when the body is replayable.
- **Errors.** One `RedmineError` carries `data`, a discriminated union on `kind`. `RedmineError.is(e, kind)` narrows. The 422 messages are raw and localized, so callers display them and never parse them. `toJSON` drops `cause`.
- **Retries.** A 429 retries any method. 502, 503, 504, network errors and timeouts retry only `read` (GET) and `idempotent` (DELETE) operations. POST, PUT and PATCH never retry, because a replayed PUT with notes duplicates a journal. Streamed bodies never retry. Backoff is full-jitter exponential and honours `Retry-After` up to a cap.
- **Timeouts and cancellation.** Each attempt runs under `AbortSignal.any([caller, AbortSignal.timeout(ms)])`. A timed-out signal maps to `timeout`, the caller's signal to `aborted`. For downloads, the timeout and the concurrency slot cover the request until headers arrive. The body stream then belongs to the caller.
- **Empty bodies.** Empty 2xx text decodes to `undefined`. Bodyless requests send no Content-Type. A non-JSON 2xx on a JSON operation is `protocol/non_json`, with a hint about login pages and wrong subpaths.
- **Impersonation.** Per call, `{ as }` becomes `X-Redmine-Switch-User`. `rm.with({ as })` derives a client that shares the engine. A 412 is `switch_user_rejected`.
- **Concurrency.** A FIFO limiter (default 4) is the SDK's only shared mutable state. It is released during backoff sleeps.
- **Observability.** One `onEvent` callback receives request, response, retry and error events, which are redacted by construction.

### Pagination and filters

- **`Listing<T>`.** It is lazy and offers `for await`, `page()`, `pages()`, `all({ max })` and `count()`. It is not thenable. Offset paging advances by the number of items received. It throws `protocol/pagination_offset_mismatch` when the echoed offset differs (the class of the 6.0.1 `/projects` bug), and `pagination_stalled` on a repeated page. It also throws `page_cap` rather than truncating silently.
- **Keyset paging.** `paging: "keyset"` (issues) uses `sort=id` with `issue_id=>=last+1`. It is immune to inserts and deletes during the walk, but it is not a snapshot.
- **Filter DSL.** Keys are wire param names (`status_id`, `assigned_to_id`, `cf_12`), so there is no alias table to drift. Each field's legal operators come from the spec's `Operators:` lines. `Cond<V, Caps>` narrows the type per field, and `compileWhere` rejects an unknown key or an undocumented operator before the network. Observed on 6.1 and 7.0, Redmine silently ignores an unknown key and returns every row, and it evaluates an undocumented operator into zero rows (`.audit/probes/redmine-behavior.out.txt`). `{ raw }` is the escape hatch for relative dates.

### Testing

- **Unit tests.** They use a fake `fetch` with a hand-made registry, so the engine is tested without the generator. They assert observable behaviour: the exact URL including the subpath, headers (never a `key=` query), body envelopes, retry counts per safety class, decoded output and error kinds.
- **Type tests.** `tests/types/*.ts` uses `@ts-expect-error` for version gating, include narrowing and filter operator capabilities. `vp check` typechecks them.
- **Generator tests.** They assert the known 6.1 to 7.0 drift, zero input collisions, and the requiredness rule.
- **Contract tests.** These run against real Docker Redmine 7.0, 6.1, and 7.0 under `/redmine` (`node scripts/redmine-env.ts up`). They cover CRUD for issues, projects, users and time entries, pagination, filters, upload with attach and download, include narrowing, 404/422/412 errors, and version gating against the real 6.1 server.

### Agent toolkit and MCP (later)

The registry already carries what tools need: `since`, `safety`, `stability` and flat inputs. A later `catalog` entrypoint will emit JSON Schema 2020-12 per input, which is the same node as the TypeScript input, plus annotations derived from safety (read gives `readOnlyHint`, DELETE gives `destructiveHint`, PUT gives `idempotentHint`). It will also define the JSON boundary for binary inputs and list paging, which the SDK surface does not have to share. Nothing in the SDK imports `@modelcontextprotocol/sdk`.

## Synthesis decision

The bakeoff had three runners. A ran on Opus and B on Sonnet, both designing freely. C ran on Opus, assigned to steelman the research's per-version subpaths. The cross-judge was GPT-6.1-Sol, which scored A 22, C 21 and B 20.

- **Version strategy.** A and B converged on their own on the superset with an optional declared version. C's own verdict was that a single entrypoint is simpler at today's drift. This is the consensus shape.
- **Base.** The public surface is A's: one method convention with a single flat-object input, no public operation descriptors, and no second public dispatcher. The judge preferred it over B's positional ids plus `rm.call`, and the TypeScript guidance favours object arguments. The internals are B's: the pure `wire` module, the engine with no generated imports, `Listing` with explicit pagination errors, the error union, `Extras` with the no-shadow check, `Included<T, I>`, and `where` nesting for filters.
- **Grafts from A.** Single-flight bearer refresh, `Listing.count()`, and the 404 hint for operations newer than the oldest version when no version is declared.
- **Grafts from C.** The version list derives from spec file names, and the requiredness rule separates spec-precision changes from server drift.
- **Grafts from the judge.** `removeUsersFromGroup` sends `user_ids[]` as repeated query params (A and B sketched a JSON body). Single scalar bodies (`addWatcher`, `addUserToGroup`) have no envelope. User bodies carry top-level siblings (`send_information`, `pref`). A's "DELETE 404 on retry counts as success" rule was dropped, because `removeUsersFromGroup` returns 404 legitimately. Streamed downloads have a defined lifecycle.
- **Rejected.** Per-version subpaths (C), hand-written per-resource facades (C), filter alias tables (C), positional arguments and a public `rm.call` (B), and inline uploads inside create/update (A). An explicit `attachments.upload` keeps two-step semantics visible, and inline uploads can be added later without breaking anything.

## Tradeoffs accepted

- We accept over-optional fields: four today, such as `custom_field.is_for_all`, which is required in 7.0 but absent in 6.1. In exchange we get one type model and no import churn on server upgrades.
- We accept `rm.issues.get({ issue_id: 42 })` over `get(42)`. In exchange there is one calling convention, self-documenting arguments, and method input identical to tool input.
- We accept that request types are a superset too. A 6.1 client can send a 7.0-only field. Observed on real 6.1 and 7.0, unknown body attributes are ignored and the request succeeds.
- We accept filter keys named by wire params (`assigned_to_id`), with no prettier aliases, because an alias table would be a hand-synced list.
- We accept no name-to-id resolution (`"In Progress"` to 7) in the SDK. That belongs in the toolkit, over cached lookups.
- We accept that POST, PUT and PATCH never retry automatically. Redmine has no idempotency key.
- We accept that `since` means "earliest vendored spec", which is 6.1, not the true introduction version.

## Open questions

- Should Redmine 6.0 get a derived spec? Only if real 6.0 instances need it, and 6.0 is legacy stable.
- Which runtime should validate responses: none by default, or an opt-in Standard Schema hook? This is deferred.
