# redmine-ts-sdk, candidate B: one superset, ops as data, namespaces generated

Sketch files are in `sketch/`. `sketch/usage.ts` is the call sites below, and `tsc` passes on the whole directory, including the `@ts-expect-error` gates.

## Problem

A typed, zero-dependency, runtime-agnostic Redmine client that an MCP server and an agent toolkit will later sit on. The hard parts are not HTTP. They are (1) a server that never reports its version, (2) a community OpenAPI spec that is the only structured source of truth, (3) a long list of Redmine behaviours a naive client gets wrong (subpaths, empty PUT/DELETE bodies, localized 422 arrays, offset drift, two-step uploads, `412` on impersonation).

Constraints carried in from grounding: ESM only, no `node:` imports, injected `fetch`, snake_case data, generated code committed, and 94 operations across two pinned specs (6.1.3-r1, 7.0.1-r1). Measured drift between them: 1 op added, 0 removed, 3 schemas changed, all additive. I also measured two things the design leans on. Across all 94 operations there are **zero** collisions between path params, query params and body keys, so a flat per-operation input is safe. And 144 of the 148 filter params in the 7.0 spec document their operators as `Operators: ...` in the description (the other four are `from`/`to` on time entries), so the filter DSL can be derived from the spec.

## Usage (caller's view)

```ts
import { createRedmine, ops, RedmineError } from "redmine-ts-sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",   // subpath kept; trailing slash optional
  auth: { apiKey: process.env.REDMINE_API_KEY! },   // header only. There is no ?key= mode.
  version: "7.0",                                   // optional, declared, never detected
});
```

**1. Read with includes, typed by what you asked for**

```ts
const issue = await rm.issues.get(42, { include: ["journals", "allowed_statuses"] });
issue.journals;            // Journal[]   (optional on Issue, required here)
issue.allowed_statuses;    // {id, name, is_closed}[]
```

**2. Filter, iterate, never think about pages**

```ts
for await (const issue of rm.issues.list({
  project_id: "web",                                  // path-scoped (/projects/web/issues.json), identifier or id
  where: {
    status_id: "open",                                // wire name; "open" -> "o"
    assigned_to_id: { none: true },                   // -> assigned_to_id=!*
    updated_on: { gte: "2026-10-01" },                // -> updated_on=>=2026-10-01
    cf_12: ["S1", "S2"],                              // -> cf_12=S1|S2
  },
  paging: "keyset",                                   // stable full export; default is offset
})) { /* 100 per request under the hood, break stops fetching */ }

await rm.projects.list().all({ max: 5_000 });         // throws protocol/page_cap instead of truncating
const { items, total_count } = await rm.timeEntries.list({ where: { spent_on: { between: ["2026-10-01", "2026-10-31"] } } }).page({ limit: 25 });
```

**3. Write, upload, impersonate, handle errors as data**

```ts
const up = await rm.files.upload(blob, { filename: "trace.zip" });         // two-step upload, octet-stream
await rm.with({ as: "jsmith" }).issues.update(42, { notes: "ack", uploads: [up] });
await rm.issues.transition(42, 5);                                         // validates allowed_statuses first

try { await rm.issues.update(42, { subject: "" }); }
catch (e) {
  if (RedmineError.is(e, "validation")) show(e.data.messages);             // raw and localized: display, never match
  else if (RedmineError.is(e, "switch_user_rejected")) forget(e.data.login);
}
```

**4. Every operation is reachable on day one, with full types**

```ts
await rm.groups.removeUsers(3, { user_ids: [1, 2] });   // 7.0 client: typed. On `version: "6.1"` this is a COMPILE error,
                                                        // and with no declared version it is a runtime guard error before any I/O.
await rm.call(ops.createIssueUnderProject, { project_id: "web", subject: "x" });  // variant hidden from namespaces, same pipeline
```

**5. Testing, and what a later tool layer sees**

```ts
import { fakeRedmine } from "redmine-ts-sdk/testing";
const fake = fakeRedmine();
fake.on(ops.getIssue, { issue_id: 42 }, { value: issueFixture });          // domain value, wrapped into the real envelope
const rm = fake.client({ auth: { apiKey: "k" } });

import { catalog, availableIn } from "redmine-ts-sdk/catalog";            // id, summary, inputSchema (JSON Schema), annotations, since
```

## Shape

### Version strategy (the owner's challenge, decided on evidence)

**Decision: one runtime, one set of types, one registry. No per-version subpaths.** `createRedmine` takes an optional declared `version`, which narrows the type and arms a runtime guard. Nothing else varies by version.

Why subpaths lose, from the measurements:

1. **The drift is too small to pay for.** 93 of 94 operations exist in both specs, and 36 of 39 schemas are unchanged. Per-version modules duplicate the entire type surface to express one added operation and four added optional fields, and make every consumer rewrite their imports to upgrade Redmine.
2. **x.y granularity cannot be honest anyway.** `wiki_page.summary.project` appeared in 7.0.1, a patch release. A `redmine-ts-sdk/7.0` module would lie to 7.0.0 users. The only truthful typing under additive patch drift is "optional unless every supported version guarantees it". A superset gives exactly that, and a per-x.y module cannot.
3. **Shared packages stay simple.** The MCP server and toolkit depend on one `Issue` type, not a version-parametric family.
4. **The owner's generic MCP "just works" for a reason worth keeping.** Redmine is additively compatible, so a client that never refuses what the server might accept works everywhere. The guard is therefore opt-in (declare a version) and only blocks what the registry says the declared version lacks.

How it works:

- The generator **merges** the pinned specs into a superset (`generator/merge.ts`). Operations take `since`/`until` from which specs contain them. Properties are unioned, tagged `@since`, and **required becomes the intersection** across versions. Enums are unioned.
- Anything non-additive (a type changes, a property disappears) is a **merge conflict that fails the build** until `overlay.resolve` records a decision. There is no silent pick. Today the conflict list is empty.
- `version?: V` is a generic: `createRedmine<const V extends Version = Latest>`. The generated `Resources<V>` is `Base & (AtLeast<V,"7.0"> extends true ? Additions70 : unknown)`. `AtLeast` is a generated lookup table (`Ladder`), not recursive type math. That gives research.md's compile-time `documents.list` error without a second module tree.
- At runtime `engine.call` checks `since <= declared <= until` before any I/O and throws `unsupported_version`. No declared version means no guard and the latest superset typing.
- Patch-level quirks stay out of the version axis. They are symptom-keyed normalizers (`core/quirks.ts`), so a server that regresses `hours` to `"8/1"` is fixed whatever it says it is.

**Maintainer cost of Redmine 7.1** (the steps, inferred from the generator design, not yet exercised):

1. `spec/fetch.sh 7.1.0-r1` and commit the YAML. `VERSIONS`, `Ladder`, the `since` tags and `Additions71` all derive from the filename.
2. `vp run gen` prints the `DriftReport`. If it only lists additions, commit the regenerated `src/generated/`. If it lists conflicts, make one decision per conflict in `overlay.ts`.
3. Add `redmine:7.1` to the contract matrix env list. The conformance run (below) tells you whether the spec and the server agree.
4. Hand-written code changes only if 7.1 introduces a new quirk (the content_type note for uploads is a doc line) or if you want a curated `Extras` verb for Documents. `rm.documents.*` exists from step 2.
5. Release as a SDK minor. Dropping an EOL version is a major (`until` rebases, types narrow).

### Data structures first

The central type is **`Op<Id, In, Ret>`** (`sketch/op.ts`): plain data (`method`, relative `path` with `.json` baked in, `pathParams`, `query` encodings, `filters` table, `body` and `response` shapes, `includes`, `since/until`, `safety`, `stability`) plus two phantom types. `In` is the **canonical flat input**: path params, query/body keys, and a nested `where` for filters. `Ret` is what the caller gets (`Promise<Issue>`, `Listing<Issue>`, `Promise<void>`, `Promise<Download>`). Envelopes (`{issue: {...}}`) and the `{errors: [...]}` body are descriptor facts the engine consumes. They never appear on the public API, per boundary-discipline.

Every dominant access pattern traces through this one structure with no "add an index later":

| Access pattern | Where it reads |
| --- | --- |
| `rm.issues.get(42)` | `SLOTS.issues.get` -> `{op: getIssue, positional: ["issue_id"]}` -> `engine.call` |
| Toolkit lists every read-only op for a server | `catalog.filter(annotations.readOnlyHint && available(version))` |
| Guard before network | `op.since/until` against the declared version |
| Retry decision | `op.safety` and the error kind |
| Filter validation | `op.filters[key].ops` |
| Unwrapping, empty bodies | `op.response` |

Flat input works because the collision count is 0 across all 94 operations. The generator asserts it, so a future spec that breaks it fails the build with the op id instead of producing a lossy type. Filters nest under `where`, so a path param `project_id` and a filter `project_id` can coexist.

### The generated-vs-handwritten seam

| Generated (`src/generated/`, committed, never edited, `gen --check` in CI) | Hand-written |
| --- | --- |
| `versions.ts` (VERSIONS, Ladder) | `core/op.ts`, the contract the generated code imports |
| `schemas.ts` (one type per schema, `@since` JSDoc, PascalCase) | `core/engine.ts`, `wire.ts`, `listing.ts`, `files.ts`, `errors.ts`, `config.ts`, `quirks.ts` |
| `ops.ts` (the registry, metadata only) | `redmine.ts` (the single file importing both halves) |
| `slots.ts` (namespace table) | `Extras` (`issues.transition`, `files`) |
| `resources.ts` (explicit method signatures, `Resources<V>`) | `generator/overlay.ts` (the only hand-written generator input) |
| `catalog.ts` (docs, JSON Schema, annotations, its own entrypoint) | `testing.ts`, `catalog.ts` entry shims |

The seam is **one direction and one file of types**. Generated code imports `core/op.ts` and `core/version.ts` and contains no logic. The engine imports no generated data, so it is tested with a hand-made three-op registry and a regenerate cannot change runtime behaviour. Enforcement is structural: an oxlint `no-restricted-imports` rule for the direction, and `package.json#exports` exposing four entries (`.`, `./testing`, `./catalog`, `./package.json`) so internals cannot be imported from outside.

**One way to do each task.** Namespaces are *generated* from the same registry, so there is no hand-maintained facade parallel to `ops`. `rm.issues.get` is the way for people. `rm.call(op, input)` is the dispatch seam for generic code and is what the namespaces call. A hand-written method may only add a **new** name. A type-level `Shadowed` check (`sketch/redmine.ts`) fails the build if `Extras` redefines a generated slot. Behaviour changes to generated slots go in the generic runtime (listing, includes, quirks) or the overlay, never in a per-resource override.

**What the overlay holds** (validated: every key must exist in the merged spec): slot renames, `hide` (redundant variants such as `createIssueUnderProject`, and ops with a hand-written replacement like uploads), safety overrides, filter words (`status_id: open -> o`), keyset-capable ops, and conflict resolutions. Slot naming is derived (tag -> namespace, method and path shape -> `get|list|create|update|delete`, else a verb from the operationId). `getX` plus `getXByProject` merge into one `list({project_id?, ...})` by shape.

### Core

- **Engine.** One `createEngine` owns the only shared mutable state, a FIFO semaphore (`maxConcurrent`, default 8, released during backoff sleeps). `call` is guard, dispatch, then `execute`, which loops over attempts. All decisions are delegated to pure functions in `wire.ts` (`planRequest`, `interpret`, `retryDecision`, `decode`), per boundary-discipline. The engine is an impure shell of about 150 lines.
- **URL and subpath.** `ResolvedConfig.base` always ends in `/`. Operation paths are relative with no leading slash, so `new URL(path, base)` keeps `/redmine/`. Userinfo in `baseUrl` is rejected (it would leak into logs).
- **Auth.** A sealed union `{apiKey} | {basic} | {bearer}` compiled once into `Authenticator { headers(), onUnauthorized() }`. API key is `X-Redmine-API-Key` only. Bearer takes a string or `{token(), refresh?()}`. On 401 the refresh runs once and the request replays once, only if replayable. Nothing else sees the union.
- **Errors.** One `RedmineError` class carrying `data: RedmineErrorData`, a discriminated union (`validation`, `unauthorized`, `forbidden`, `not_found`, `switch_user_rejected`, `not_acceptable`, `http`, `protocol`, `network`, `timeout`, `aborted`, `unsupported_version`, `invalid_input`, `transition_not_allowed`). `RedmineError.is(e, kind)` narrows. `data` is JSON-serializable for tools, `cause` is dropped from `toJSON`, URLs never hold credentials (there is no query key). 422 messages are raw and localized, never parsed.
- **Retries.** Pure `retryDecision`, table-tested. `429` retries any method (provably not executed). `502/503/504`, network failure and timeout retry only `read` (GET) and `idempotent` (DELETE) operations. POST, PUT and PATCH never retry, because a repeated PUT with `notes` appends a second journal. Streamed bodies never retry. Full-jitter exponential backoff honours `Retry-After` up to a cap.
- **Timeouts and cancellation.** Per attempt, `AbortSignal.any([callerSignal, AbortSignal.timeout(ms)])`. A timeout is `timeout`, the caller's abort is `aborted`, and the two are distinguished by which signal fired.
- **Empty bodies.** `interpret` treats empty 2xx text as `undefined`. Requests without a body send no `Content-Type` and no `"null"`. A non-JSON 2xx on a JSON op is `protocol/non_json` with a hint that the base URL probably points at a login page.
- **Impersonation.** `CallOptions.as` becomes `X-Redmine-Switch-User` for that call only. `rm.with({as})` returns an immutable derived client sharing the engine and semaphore. The 412 becomes `switch_user_rejected`.
- **Observability.** One `onEvent` callback with `request | response | retry | error` events, redacted by construction. This is also the future audit hook.

### Pagination and filters

- **`Listing<T>`** is the only way to read a list operation: `AsyncIterable<T>` plus `page()`, `pages()`, `all({max})`. It is lazy and deliberately not thenable, so there is no "did I await the first page or everything" ambiguity. `limit`/`offset` are pager-owned, not part of the input (the catalog re-adds them for tools, which call `page()`).
- **Guards against servers that ignore parameters** (`walk` in `sketch/listing.ts`): advance the offset by the number of items that *arrived*, not by `limit`. Fail with `protocol/pagination_offset_mismatch` when the response's echoed `offset` differs from the requested one (the 6.0.1 `/projects` bug class). Fail with `pagination_stalled` when a page repeats the previous ids. Stop on empty or `offset >= total_count`. A hard page cap (10,000) throws `page_cap`.
- **Offset drift.** `paging: "keyset"` is offered only where the registry says so (`issues`, via the `issue_id` filter): `sort=id` plus `issue_id=>=last+1`, offset always 0. It is immune to inserts and deletes mid-walk. Incremental sync is just `where: { updated_on: { gte } }`. Giving `sort` or the keyset filter yourself with keyset paging is `invalid_input`.
- **Filter DSL** (`compileWhere`, pure). Keys are the wire param names (`status_id`, `assigned_to_id`, `cf_12`), so there is no alias table to drift. The legal operators per field come from the spec's `Operators:` line, so `Cond<V, Caps>` narrows the type per field (`status_id` accepts `not`, not `contains`) and the compiler rejects an operator the server does not document *before the network*. Redmine would silently ignore it and return everything. One grammar (`V | V[] | {not} | {gte|lte|between} | {contains|starts_with|...} | {any|none} | {raw}`). `{raw}` is the only escape hatch, for relative-date and `ev` operators.

### Facade scope

MVP resources (`issues`, `projects`, `users`, `timeEntries`) are **generated**, with no hand-written per-resource facade. What would normally be facade logic is generic and driven by `Op` data: unwrapping, `Included<T, I>` for `include` narrowing, `Listing`, the filter DSL, quirk normalization. The hand-written domain layer is `Extras`, which adds *new verbs only*. MVP ships `issues.transition` (validated status change, idempotent) and `files`. Every other namespace (groups, versions, wiki, relations, memberships, news, queries, attachments metadata, search, ...) exists on day one with full types because slots come from the registry.

### Uploads and downloads

`files.upload(source, meta)` is step 1 of the two-step upload (`octet-stream` forced, otherwise 406) and returns an `UploadRef` ready for `uploads: [...]`. It accepts `Blob | Uint8Array | ArrayBuffer | ReadableStream`. A stream is sent once and never retried or 401-replayed. `files.download` resolves the path against `baseUrl` and **ignores** the absolute `content_url` in attachment JSON, which behind a proxy carries a foreign host and would leak the credential. It returns a streamed `Download` with a `bytes()` convenience. Both go through `Engine.send`, so auth, timeouts, concurrency, impersonation and redaction are identical to JSON calls.

### Testing

- **Unit tests (fake transport).** `fakeRedmine()` routes by *operation*, built from the same descriptors the engine uses, so a route renamed by a spec bump fails here. Fixtures are domain values wrapped into the real envelope by the descriptor. Pure modules (`planRequest`, `interpret`, `retryDecision`, `compileWhere`, `walk`) get table-driven tests. The engine is exercised with a hand-made registry. Behaviours covered: subpath URL composition, header-only key, empty bodies, 422 mapping, retry matrix per `safety`, 401 refresh replay, semaphore ceiling, abort vs timeout, pagination guards (server ignores offset, over-returns, repeats a page), keyset walk.
- **Contract tests (real Redmine).** `tests/contract/` runs the same suite over a matrix of `redmine:6.1` and `redmine:7.0` containers (`REDMINE_URL_6_1`, `REDMINE_URL_7_0`, an admin key seeded in global setup). Three suites:
  1. *Round-trip*: CRUD for the four MVP resources, uploads, impersonation (admin and non-admin), `include=allowed_statuses`, 422 shape.
  2. *Conformance*: every read operation callable without prior state is validated against the **merged output JSON Schema** (devDependency validator). This is how spec drift and server drift are discovered for 7.1 before users find them.
  3. *Availability*: for each operation with `since: "7.0"`, assert the 6.1 server rejects it and the 7.0 server accepts it. This empirically verifies the `since` metadata the guard and the types depend on.

### Agent toolkit and MCP

`redmine-ts-sdk/catalog` exports one `OpMeta` per operation: id, namespace and verb, summary, description, **`inputSchema` (JSON Schema 2020-12 of the canonical flat input)**, `outputSchema`, `kind`, derived `annotations` (GET -> `readOnlyHint`, DELETE -> `destructiveHint`, PUT/PATCH -> `idempotentHint`), `since/until`, `stability`. The tool layer's handler is `(input) => rm.call(ops[id], input)`: the schema shape, the call shape, and the TypeScript input type are the same node rendered three ways, so there is no translation layer to maintain. `availableIn(version)` uses the same ladder as the runtime guard, so a 6.1 server never advertises a 7.0 tool. The catalog is its own entrypoint, so docs and JSON Schemas cost the client bundle nothing. Curated triage tools are written against `rm.issues.*`, report failures with `RedmineError.toJSON()`, and audit through `onEvent`. Nothing in the SDK imports `@modelcontextprotocol/sdk`.

### Interface depth, judged

The public surface is `createRedmine` (one config object), the `Redmine<V>` client (namespaces plus `call`, `with`, `files`), `ops`, `RedmineError`, `Listing`, and the generated data types. It hides: URL and subpath handling, auth, retry and idempotency policy, the semaphore, timeouts and abort merging, empty-body handling, envelope unwrapping, include narrowing, filter compilation and validation, pagination guards and keyset walks, version gating, quirk normalization, and secret redaction. The caller coordinates nothing: one call is one operation. The surface is a function of the registry, so growing the API grows generated code, not the hand-written interface.

## Synthesis decision

*Left for arena.*

## Tradeoffs accepted

- We accept **over-optional fields** in exchange for honest typing under additive patch drift (`wiki_page.summary.project` is optional even for a declared 7.0 client, because it appeared in 7.0.1).
- We accept that **the client object imports every operation descriptor** (no per-operation tree shaking) in exchange for one data-driven binder and a registry the toolkit shares. Descriptors are small plain objects. Docs and JSON Schema live in the separate catalog entry. If bundle size matters later, `core/` is already registry-generic, so a functional entrypoint is additive.
- We accept **two entry styles** (`rm.issues.get(...)` and `rm.call(ops.getIssue, ...)`) in exchange for generic code (toolkit, hidden variants, plugin ops) that does not need namespaces. They are not parallel implementations: namespaces are positional sugar over `call`, generated from the same table, and `Extras` cannot shadow a slot.
- We accept **declared, not detected, versions**. Detection is impossible (the server hides it), and a probe would pick types from a guess.
- We accept **POST/PUT/PATCH never retry**, which loses some resilience, because Redmine has no idempotency key and a repeated PUT with `notes` duplicates a journal.
- We accept **snake_case data and camelCase SDK options**. Data equals the wire (zero transformation, `cf_12` keys, model familiarity). Options are SDK concepts, not Redmine's.
- We accept **filter keys named by wire params** (`assigned_to_id`, not `assigned_to`) over prettier aliases, because the alias table would be a hand-synced list.
- We accept **no name-to-id resolution** (`status: "In Progress"`) in the SDK. It needs cached lookups and instance config, and belongs in the toolkit on top of `rm.call`.
- We accept **parsing operator lists out of description text** at generation time. It is checked (4 of 148 params have none and are explicitly overlay-listed) and fails the build on a new shape.

## Alternatives considered

- **Per-version subpaths with duplicated generated types (research.md).** Rejected: duplicates ~39 schemas to express 4 field additions, forces import rewrites on upgrade, cannot be honest at patch granularity, and splits shared types for the toolkit. Interface depth is worse: the caller must learn a version-selected module tree. It hides nothing the superset does not.
- **Generic, untyped client (the owner's MCP shape: list paths, send request).** Maximum compatibility and tiny, but exposes the whole wire to every caller and gives no types, no retry policy and no guard. It is the right escape hatch and exists here as `rm.call(op, input)`, but it is not the primary surface.
- **Hand-written facade over generated operations.** Gives nicer names per resource, but creates two lists of the same operations that drift, and scales hand-work with the API. Rejected for the hand-synced-list and two-ways red flags. The generated namespaces plus `Extras` give the same call sites.
- **Off-the-shelf generator (hey-api, orval) plus a thin wrapper.** Output is generic functions with no `since`, safety, filter or include metadata, which the guard, retry policy, DSL and toolkit all need. The spec is small enough that our emitter (guess: about 900 lines) pays for itself.
- **Runtime version probe to pick behaviour.** Fragile signatures, wrong at patch level, and unnecessary: nothing at runtime needs the version except the optional guard.

## Open questions and risks

- **Biggest risk: the generator carries the design.** It must turn nullable, `oneOf`, envelopes, include-to-property mapping, filter-operator parsing and slot naming into correct explicit types. Is it acceptable that the first session's critical path is the generator, with a thin hand-written client usable only after it lands? A fallback is to hand-write the four MVP `ops` entries first and let the generator replace them.
- Is declaring `version` as a **generic type parameter** worth its cost? It costs one lookup table and one intersection, but a user who builds the config from an env string gets `Version` (wide), not a literal, and so the wide `Resources`. Should `createRedmine` accept a string and narrow only when a literal is given?
- **Superset typing for removed fields.** When a future version drops a field, `until` handles operations but the merge currently treats property removal as a conflict. Do we want `@until` on properties instead of a build failure?
- Are `RedmineError` kinds `unsupported_version` and `invalid_input` right as errors rather than a TypeScript-only protection? Local refusals before the network are surprising to callers coming from the raw API.
- Is `Listing` without a thenable acceptable ergonomically? `await rm.issues.list()` is a type error, which is the point, but it differs from most SDKs.
- Redmine 6.0 is not in the vendored specs. Deriving it means a third spec file produced by hand. Do real 6.0 instances justify that, given 6.0 is legacy stable?
- `AbortSignal.any` is available on Node 22, Bun, Deno and current browsers, but the package tsconfig has `lib: ["es2023"]` and `types: ["node"]`. Does `tsgo` resolve `AbortSignal.any` from `@types/node`, or does the SDK need a DOM-lib addition? I did not check.

## Next implementation step

Write `generator/parse.ts` and `generator/merge.ts` against the two vendored specs and assert the measured drift (`addedOps: [removeUsersFromGroup@7.0]`, 4 added properties, 0 conflicts) as the first test, before any emitter exists.
