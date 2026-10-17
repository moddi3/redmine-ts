# Candidate C: versioned editions

Per-version subpath entrypoints, made as strong as I can make them. One shared runtime. Each Redmine x.y gets an *edition*: a subpath that exports the generated types for that version and a `createRedmine` already bound to it. Everything that varies by version is generated from the vendored spec. Nothing about versions is hand-maintained.

## Usage (caller's view)

### README

```sh
npm i redmine-ts-sdk
```

Pick the edition that matches your server (Administration > Information shows the version). Pin it in one file.

```ts
// src/redmine.ts — the only file in your app that names a Redmine version
export * from 'redmine-ts-sdk/7.0'
```

```ts
import { createRedmine, type Issue } from './redmine'

const rm = createRedmine({
  baseUrl: 'https://tracker.example.com/redmine/', // subpath kept
  auth: { apiKey: process.env.REDMINE_API_KEY! },  // sent only as X-Redmine-API-Key
})

const issue = await rm.issues.get(42, { include: ['journals', 'allowed_statuses'] })
issue.journals // Journal[] (narrowed because it was included)

for await (const it of rm.issues.list({
  where: {
    project: 'web',
    status: 'open',
    updated_on: { gte: '2026-10-01' }, // updated_on=>=2026-10-01
    assigned_to: { none: true },       // assigned_to_id=!*
    cf: { 12: ['S1', 'S2'] },          // cf_12=S1|S2
  },
})) {
  // pages of 100 fetched lazily
}

// Every spec operation is reachable on day one, fully typed, by operationId.
await rm.call('addWatcher', { issue_id: 42, user_id: 7 })

// Version drift is a compile error, not a 404.
await rm.call('removeUsersFromGroup', { group_id: 3, 'user_ids[]': [7, 8] }) // ok on 7.0
```

On a 6.1 edition the last line fails to type-check: `'removeUsersFromGroup'` is not an operation of Redmine 6.1. On 7.0, `CustomField['is_for_all']` is `boolean`. On 6.1 the property does not exist. Neither edition lies about the other.

When your server upgrades, change one line (`/6.1` to `/7.0`). The compiler then lists every place the new version's types differ from what your code assumed. Each edition also re-exports the version-neutral pieces (errors, auth, config, call options, filter types) as the same bindings the root `redmine-ts-sdk` exports, so app code imports only from the pin file. Libraries that must not name a version import those pieces from the root.

Edition rules: adding an edition for a new Redmine release is an SDK minor. Removing an EOL edition is an SDK major. There is no floating "latest", so an SDK upgrade never silently changes your types.

### Call site 1: an app script with error handling

```ts
import { createRedmine, isRedmineError } from './redmine'

const rm = createRedmine({ baseUrl, auth: { apiKey } })

try {
  await rm.issues.update(42, { status_id: 5, notes: 'Done' }, { as: 'jsmith' }) // impersonate per call
} catch (e) {
  if (isRedmineError(e, 'validation')) console.error(e.detail.messages) // raw, localized; never matched on
  else if (isRedmineError(e, 'switch_user_failed')) console.error(`no active user ${e.detail.login}`)
  else throw e
}

const { token } = await rm.uploads.create(file, { filename: 'log.txt' })
await rm.issues.update(42, { uploads: [{ token, filename: 'log.txt' }] })
```

### Call site 2: an MCP server talking to several Redmine servers

The version is configuration here, known only at runtime.

```ts
import { createRedmineFor, parseRedmineVersion, type AnyRedmine } from 'redmine-ts-sdk/versions'
import { inputSchemas } from 'redmine-ts-sdk/versions/schemas'

const clients: AnyRedmine[] = config.instances.map((i) =>
  createRedmineFor(parseRedmineVersion(i.version), { baseUrl: i.url, auth: i.auth }), // '7.0.1' → '7.0'; no default
)

for (const rm of clients) {
  // rm.operations holds only the operations this server's version has.
  for (const op of Object.values(rm.operations)) {
    server.tool(`${rm.version}:${op.id}`, op.summary, inputSchemas[rm.version][op.id], op.hints,
      (input) => rm.callUntyped(op.id, input))
  }
}

// Typed code still works per instance after narrowing on the discriminant.
const rm = clients[0]
if (rm.version === '7.0') await rm.call('removeUsersFromGroup', { group_id: 3, 'user_ids[]': [7] })
```

`callUntyped` on an operation the instance's version lacks throws `RedmineError` with `kind: 'unsupported_in_version'` and `availableIn: ['7.0']`, before any network call.

### Call site 3: a reusable helper that works on any edition

```ts
import type { CommonRedmine } from 'redmine-ts-sdk/versions'

export async function closeStale(rm: CommonRedmine, days: number) {
  for await (const it of rm.issues.list({ where: { status: 'open', updated_on: { lt: `t-${days}` } } })) {
    await rm.issues.update(it.id, { status_id: 5, notes: 'Closed as stale' })
  }
}
```

`CommonRedmine` is one client type over `CommonOperations`, computed at type level from the edition type maps: the operations every edition has, outputs as unions (what any server may return), inputs as intersections (what every server accepts). It is not a union, so generic facade methods stay callable, which a union of editions would not allow. Every edition's client is assignable to it, and a type test enforces that. `AnyRedmine` is the discriminated union for code that must narrow to reach edition-only operations.

## Shape

### Data structures

The whole design rests on one split of each spec operation into two generated halves.

1. **`OperationDescriptor`** (runtime value). `id`, `method`, `path` (no `.{format}`), path and query param lists with an encoding per query param (`scalar`, `csv`, `brackets`, `spread` for `cf_x`), body kind (`json`, `binary`, none), the body's top-level keys, response kind (`json`, `empty`, `binary`), list metadata (`itemsKey`) when the response has `total_count` plus one array, `since`, `stability` (from the tag's "Status: Alpha" text), and tool hints (`readOnly`, `destructive`, `idempotent`) derived from the method.
2. **`Operations`** (type only). `{ [operationId]: { input; output; item? } }`, emitted as a type alias (an interface would lack the implicit index signature the constraints need). `input` is **flat**: path params, query params and the body's top-level keys merged into one object, with `format` and header params removed. The generator fails the build if two of those collide. The same flat object is what the JSON Schema for tools describes, so TypeScript callers and LLM tools share one input shape.
3. **Edition**. `{ version, operations: Registry<Operations>, createRedmine }`, one per vendored x.y spec, emitted into `src/generated/<x.y>/`. The registry is typed `satisfies Registry<Operations>`, so its keys and the type map cannot drift. Both come from one generator pass over one spec.
4. **`VERSIONS` and `AVAILABILITY`** (`src/generated/versions.ts`). The version list, derived from spec file names (latest revision per x.y). `AVAILABILITY` maps every operation id ever seen to the versions that have it. This is where `since` comes from and what `unsupported_in_version` errors cite.

Spec files are the single source of truth for versions. The generator emits the version list. `vite.config.ts` builds the pack entry map from it and tsdown `exports: true` writes the package `exports` field. The contract-test matrix iterates it to pick Docker images. Adding a spec file is the only edit, per encode-lessons-in-structure (no hand-synced list).

### Module map

```
spec/redmine-openapi/<tag>.yaml      vendored, pinned (exists)
spec/overlays/<x.y>.yaml             OpenAPI Overlays: backport spec-precision fixes, local corrections
packages/sdk/
  scripts/gen.ts                     build-time generator (node allowed): load, overlay, diff, emit
  src/
    index.ts                         root entry: version-neutral only. Errors, Auth, RedmineConfig, CallOptions, RedmineVersion
    versions.ts                      /versions: createRedmineFor, parseRedmineVersion, AnyRedmine, CommonRedmine
    versions-schemas.ts              /versions/schemas: inputSchemas per version (kept out of client bundles)
    testing.ts                       /testing: fake fetch with request recording
    core/operation.ts                descriptor types, toWireRequest (pure), defineOperation
    core/transport.ts                fetch, URL join, auth, timeout, retries, concurrency, body/empty handling
    core/errors.ts                   RedmineError + discriminated detail
    core/client.ts                   createRedmineClient: call, callUntyped, paginate, facade assembly
    core/paginate.ts                 offset and keyset iteration with stall guard
    core/where.ts                    filter DSL to Redmine operator syntax (pure)
    core/normalize.ts                symptom normalizers keyed by operation id
    facade/{issues,projects,users,time-entries,attachments}.ts   generic over structural op constraints
    generated/                       committed, never edited by hand
      versions.ts                    VERSIONS, AVAILABILITY
      6.1/{types,operations,registry,schemas,index}.ts
      7.0/{types,operations,registry,schemas,index}.ts   index.ts is the /7.0 entry
```

Public subpaths: `.`, `./6.1`, `./7.0`, `./versions`, `./versions/schemas`, `./testing`. Adding 7.1 adds `./7.1` and nothing else. Internals are unreachable because only these entries are in `exports`, per the importable-internals red flag.

### Flow of one call

`rm.issues.get(42, { include })` → facade builds flat input `{ issue_id: 42, include }` → `call('getIssue', input)` → `toWireRequest(descriptor, input)` (pure: fills path, encodes query, picks body keys) → `transport.send` (URL join under the base subpath, auth header, `X-Redmine-Switch-User` from `opts.as`, concurrency slot, timeout signal, retry if idempotent) → parse by `descriptor.response` (empty body is `undefined`, not a `.json()` crash) → `normalize[descriptor.id]?.(body)` → facade unwraps `{ issue }`. Three files from facade to wire: `facade/issues.ts`, `core/client.ts`, `core/transport.ts`.

### Load-bearing decisions

- **The facade is written once and instantiated per edition.** `IssuesFacade<O extends IssuesOps>` reads its input and output types from `O`. `IssuesOps` is a structural floor (the operations and fields the facade relies on). Each generated `index.ts` instantiates `createRedmineClient<'7.0', Operations>`. If a future spec breaks the facade's assumptions, the generated entry for that edition fails to compile and points at the gap. No conditional types over a superset, per type-system-discipline.
- **Version lives in the client value, not in global state.** `rm.version` is a literal type, so `AnyRedmine` is a discriminated union. Multi-instance processes hold several editions side by side, sharing one runtime chunk.
- **Validation at the boundary only.** Typed calls trust their types. `callUntyped` (the LLM and JSON path) checks operation availability for the instance version. It validates against JSON Schema only when the caller passes a validator, so the SDK stays dependency-free, per boundary-discipline.
- **Quirks are keyed by symptom, never by version.** `hours: "8/1"` (6.0.1) is parsed wherever a number was expected and a string arrived. A list returning more than `limit` items, or repeating the first id at a new offset, trips the pagination guard. Version numbers do not reach the runtime except in `unsupported_in_version`.
- **Errors are one class with a discriminated `detail`.** `instanceof RedmineError` works across editions because errors live in the shared runtime chunk. `isRedmineError(e, kind)` narrows `detail`.
- **Retries only for idempotent methods.** GET, PUT, DELETE retry on network errors and 502/503/504 with backoff. POST never retries. `descriptor.hints.idempotent` drives this, so plugin operations from `defineOperation` follow the same rule.
- **Bearer refresh is single-flight.** On 401 with a `refresh` callback, one refresh runs and concurrent requests await it. Each request is retried once, so a broken refresh cannot loop.

### Interface depth

The public surface per edition is `createRedmine`, the four facades plus `uploads` and `attachments`, `call`, `callUntyped`, `paginate`, `operations`, and the exported types. Behind it sit URL joining under subpaths, auth strategies, retry policy, concurrency, timeouts, empty-body handling, query encoding of four styles, pagination with stall detection, the operator DSL, and symptom normalizers. Callers never see `Request`, `Response`, or query encoding. Wire *data* types are public in snake_case by the owner's decision. Wire *transport* types are not.

## Version strategy on the evidence

Measured drift 6.1.3-r1 to 7.0.1-r1: 1 of ~94 operations added (`removeUsersFromGroup`), 0 removed. 3 of 39 schemas changed, all additive: `custom_field` gained `is_for_all` (required), `default_value_mode`, and `projects`. `wiki_page.summary` gained `project`. Journal items gained `required` lists. The last is spec precision, not server change.

### Where editions beat a single entrypoint

- **Type truth for both versions at once.** A single superset type must pick for `custom_field.is_for_all`. If it is required, it lies to every 6.1 user (`undefined` at runtime, `boolean` in types). If it is optional, every 7.0 user loses the guarantee the 7.0 spec makes. Editions give each version its exact type. Today that is 4 fields and 1 operation. It is small, and it is exactly the class of bug types exist to catch.
- **Removals and type changes stay representable.** A superset can only express additions. When a version removes a field or changes its type, a single entrypoint needs conditional types keyed by a version parameter, which is per-version typing reinvented with worse error messages. Behaviour changes ride along too: 7.1 stops honouring the client's upload `content_type` (per research.md), and a 7.1 edition can document that on `uploads.create` without a version branch in shared docs.
- **Upgrades become a reviewed type diff.** Changing `/6.1` to `/7.0` in the pin file makes the compiler enumerate every assumption that changed. With one entrypoint, the same upgrade compiles silently, and any regression shows up at runtime.
- **SDK releases never move a user's types.** No floating latest means new versions are opt-in.
- **Tools per server are correct by construction.** An MCP instance built on a 6.1 edition does not advertise `removeUsersFromGroup`. A generic MCP advertises it everywhere and lets the server 404.

### Where editions lose

- **Ceremony is ahead of the drift.** About 1% of operations and 8% of schemas differ. For most callers the 6.1 and 7.0 types are identical, and choosing an edition is a decision with no visible payoff yet. The owner's generic MCP "just works" across versions because the runtime really is version-agnostic. This design agrees and keeps one runtime. Editions only change types and registry membership.
- **Version-agnostic library code needs a computed supertype.** Helpers take `CommonRedmine` and lose edition-only operations and fields. Reaching them means switching to `AnyRedmine` and narrowing on `rm.version`. A single entrypoint needs neither type. Two client types for "any version" is a real cost to learn, even though each has one job.
- **Spec-revision noise looks like server drift.** The journal `required` lists differ between the two specs only because the spec improved. Without overlays, 6.1 users would get weaker journal types for no server reason. The fix is a maintainer duty (backport precision via `spec/overlays/6.1.yaml`, guided by the generated drift report).
- **Linear growth.** Each edition is another generated tree (~94 operation types, 39 schemas) in `.d.ts` and another registry in JS. A multi-version MCP loads N registries (estimated at a few KB each minified, a guess until measured).
- **Users must know their server version.** Redmine does not report it over the API, so the choice cannot be automated. A single entrypoint does not need the answer at all.

### Verdict

At today's drift, a single entrypoint with superset types would be simpler for most callers and only slightly less truthful. Editions win when drift grows, and the evidence says it will: 7.1 brings the Documents API and a behavioural upload change, and Redmine plans to tie major releases to the Ruby and Rails cycle. This candidate's bet is that the edition cost can be pushed to near zero (one pin line for users, zero hand edits per version for maintainers) while the type truth compounds. If the arbiter forecasts drift staying at about 1% per release, the single entrypoint should win.

## Maintainer cost: adding Redmine 7.1

1. `spec/fetch.sh 7.1.0-r1`.
2. `vp run gen`. This emits `generated/7.1/`, adds `'7.1'` to `VERSIONS`, recomputes `AVAILABILITY`, and writes `spec/DRIFT.md` (operations added and removed, fields added and removed, requiredness changes, type changes, classified as additive or breaking).
3. Review `DRIFT.md`. Precision-only differences are backported to older versions with an overlay, then regenerated.
4. `vp check`. Either the facade compiles against 7.1, or the errors name the operation or field the facade assumed.
5. `vp test`. The contract matrix picks up `redmine:7.1` from `VERSIONS`. The image must be pulled.
6. Optional. Add a `documents` facade. It is reachable through `rm.call('getDocuments', …)` on the 7.1 edition from step 2.
7. Release as an SDK minor.

When the release is additive, steps 1 to 5 take minutes, a guess based on the 6.1 to 7.0 diff size. When it is breaking, the compiler finds the work in step 4.

## Generator: what it emits

Per edition: `types.ts` (one exported type per component schema, named in PascalCase, e.g. `Issue`, `CustomField`, with snake_case properties. `nullable` becomes `| null`, `oneOf` a union, `enum` a literal union, and `format: binary` becomes `Blob | Uint8Array | ReadableStream`. JSDoc carries the description, `@since` for fields added after the oldest edition, and `@stability alpha`), `operations.ts` (the `Operations` type map), `registry.ts` (descriptors), `schemas.ts` (JSON Schema 2020-12 of each flat input, with `nullable` converted), and `index.ts` (the entry). Shared: `versions.ts`. The seam: generated files export data and types only. Every function lives in hand-written `core/` and `facade/`, which import generated types but are never imported by the generator.

`since` for operations present in the oldest vendored spec comes from the tag's "Availability: 1.4" text. Otherwise it is the first edition whose spec has the operation.

## Testing

- **Unit (fake fetch).** `/testing` exports `createFakeFetch(routes)`, which records each `Request`. Tests assert observable wire behaviour: the URL under a subpath base, headers (`X-Redmine-API-Key` present and no `key=` query), empty PUT handling, retry counts per method, the 412 mapping, the pagination stall guard, and DSL output strings. `toWireRequest` and `compileWhere` are pure and table-tested, per test-behavior-not-implementation.
- **Type tests.** `tests/types/*.ts` uses `@ts-expect-error` for `removeUsersFromGroup` on 6.1, `is_for_all` on 6.1, include narrowing, every edition's `Redmine` being assignable to `CommonRedmine`, and `AnyRedmine` narrowing on `version`. `vp check` type-checks them.
- **Generator.** `vp run gen --check` regenerates into memory and fails on any diff with committed output. A unit test on `diffSpecs` asserts the known 6.1 to 7.0 drift.
- **Contract.** `describe.each(VERSIONS)` against Docker `redmine:<v>`, seeded through the REST API with an admin key (REST API enabled at container start). Each response is validated against that edition's response schema. This test proves the central claim, that edition types match each real server.

## Agent toolkit and MCP

Tools derive from `rm.operations` (id, summary, hints, since, stability) plus `inputSchemas[version][id]` (the flat input shape), and execute through `rm.callUntyped`. The curated triage tools in the later package call the typed facade on a narrowed edition. Annotations come from `descriptor.hints`. No redesign is needed. The registry and flat inputs are already the tool shape, and `callUntyped` is already the JSON boundary.

## Synthesis decision

Left for arena.

## Tradeoffs accepted

- We accept one pin file per consuming app in exchange for every upgrade being a compiler-enumerated diff.
- We accept that neutral pieces (errors, config types) are importable from both the root and each edition, as the same bindings, in exchange for app code importing only from its pin file. Identity holds, so `instanceof` and narrowing agree whichever path was used.
- We accept N generated trees in exchange for exact types per version without conditional types.
- We accept the flat-input collision check failing the build in exchange for one input shape shared by TypeScript and tool schemas. If the spec ever collides, the generator needs a rename rule. Today it does not, by my reading, and `gen` verifies it.
- We accept two "any version" types (`CommonRedmine` for helpers, `AnyRedmine` for narrowing) in exchange for no superset types. The common type is derived from the edition maps, never written by hand.
- We accept that `callUntyped` does not validate input by default, in exchange for zero runtime dependencies. MCP callers inject a Standard Schema or JSON Schema validator.
- We accept that `rm.call('uploadAttachmentFile', …)` and `rm.uploads.create(…)` both exist. The facade adds Blob, stream, and content-type handling, so it is policy, not a pass-through. The rule is to use the facade where one exists.

## Alternatives considered

- **Single entrypoint, superset types with `since` JSDoc and a runtime guard.** Smallest surface, and no version choice for callers. It loses on type truth (it must lie to one version on required additions) and cannot express removals without version-parameterized conditional types. It hides less: the caller learns about version drift at runtime.
- **One client generic over a version parameter (`createRedmine<'7.0'>()`), types as conditionals over a superset.** It keeps one import path, but every type becomes `Pick`/conditional machinery keyed by version, hover types become unreadable, and error messages degrade. It keeps the edition idea while losing per-version generation.
- **Runtime-only versioning (generic MCP style: list paths, send any request).** It is maximally robust across versions but gives TypeScript callers nothing. It is the right shape for `callUntyped` and is kept as that layer, not as the whole design.

## Open questions and risks

- Does the type machinery hold at full size? Measured on a reduced harness (the sketch plus a 6.1 copy without `removeUsersFromGroup` and the 7.0-only `custom_field` fields, about 25 operations, `tsc` 7.0.2 strict), all of these pass: both editions assignable to `CommonRedmine`, a generic `issues.get` with include narrowing callable on it, `removeUsersFromGroup` rejected on 6.1 and on `CommonRedmine`, `is_for_all` rejected on 6.1, `AnyRedmine` narrowing on `version`. Removing `deleteIssue` from the 6.1 map fails the 6.1 entry with "Property 'deleteIssue' is missing". Two sketch bugs surfaced and are fixed. `Operations` must be a type alias, not an interface, to satisfy the index signature. `CommonOperations` must omit `item` when neither side has one. What is unmeasured is check time and hover readability at ~94 operations times N editions.
- Does rolldown put `core/errors.ts` in one shared chunk across `/6.1`, `/7.0`, and the root? If not, `instanceof` breaks across editions. The first build should assert this in a test.
- Should 6.0 get an edition? It requires deriving a spec, and research says to add it only when real instances exist.
- Is `spec/DRIFT.md` review enough of a gate, or should breaking drift fail CI until acknowledged?
- Flat input collisions: my reading of the spec found none, but this is unverified until `gen` runs.

## Next implementation step

Write `scripts/gen.ts` up to emitting `generated/7.0/registry.ts` and `operations.ts` for `getIssue`, and table-test `toWireRequest` against it, because every other module consumes that pair.
