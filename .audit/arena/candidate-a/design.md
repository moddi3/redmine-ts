# redmine-ts-sdk: candidate A, "one registry, one surface"

The whole SDK is generated from one merged operation registry. Every one of the ~94 operations
becomes a typed method `rm.<namespace>.<verb>(input, opts)` on day one. Each method takes one flat,
snake_case input object. A small hand-written core runs every call through one pipeline. There are
no per-version entrypoints. You import one package. Saying which Redmine you run is an optional
type-narrowing hint, not an import path.

## Usage (caller's view)

### README quickstart

```ts
import { createRedmine, RedmineError } from 'redmine-ts-sdk'

const rm = createRedmine({
  baseUrl: 'https://tracker.example.com/redmine/', // the subpath is kept
  auth: { apiKey: process.env.REDMINE_API_KEY! },   // always sent as the X-Redmine-API-Key header
  redmine: '6.1',                                   // optional: hides operations newer than 6.1
})

const issue = await rm.issues.get({ issue_id: 42, include: ['journals', 'allowed_statuses'] })
issue.allowed_statuses?.map((s) => s.name)

for await (const i of rm.issues.list({
  project_id: 'web',
  status_id: { open: true },             // status_id=o
  updated_on: { gte: '2026-10-01' },     // updated_on=>=2026-10-01
  assigned_to_id: { none: true },        // assigned_to_id=!*
  cf_12: ['S1', 'S2'],                   // cf_12=S1|S2
})) {
  console.log(i.id, i.subject)           // pages of 100, drift-proof, deduplicated
}

await rm.issues.update({ issue_id: 42, status_id: 3, notes: 'Fixed in r1234' })   // void, empty body handled

await rm.groups.removeUsers({ group_id: 5, user_ids: [1, 2] })
//        ^^^^^^^^^^^ type error with redmine: '6.1'. This operation exists since 7.0.
```

The rules a reader needs:

- Every operation is `rm.<namespace>.<verb>(input, opts?)`. The input is one flat object: path params,
  query params, and the body's envelope fields side by side, named exactly as on the wire.
  `{ issue: { subject } }` on the wire is `{ subject }` in the input.
- What comes back depends on the operation. One entity comes back unwrapped (`Issue`, not
  `{ issue }`). A paged list comes back as a lazy `Listing<T>`, a small fixed list as `T[]`, an empty
  204 as `void`, and a file as a `Download`.
- Filters are typed per field from the spec's operator lists. A bare value or an array means
  equals. An object with one operator key means anything else. `raw('...')` is the escape hatch.
- `opts` is the same everywhere: `{ signal, timeoutMs, as, retry }`. `as: 'jsmith'` impersonates for
  that one call.
- Every failure is a `RedmineError` with a discriminated `problem`. Switch on `problem.kind`.

### Call site 1: nightly triage script

```ts
const stale = rm.issues.list({
  project_id: 'web',
  status_id: { open: true },
  updated_on: { olderThanDays: 30 },     // updated_on=<t-30
  sort: 'updated_on',
})

console.log(`stale: ${await stale.count()}`)          // one request with limit=1
for await (const page of stale.pages()) await notify(page.items)

try {
  await rm.issues.update({ issue_id: 7, status_id: 99 })
} catch (e) {
  if (!(e instanceof RedmineError)) throw e
  switch (e.problem.kind) {
    case 'validation': log(e.problem.messages); break   // raw, localized strings, never matched on
    case 'not_found':  log(e.problem.hint); break
    default: throw e
  }
}
```

### Call site 2: a time-tracking service acting for its users, with an attachment

```ts
const rm = createRedmine({ baseUrl, auth: { apiKey: adminKey }, fetch: proxiedFetch })

export async function logWork(login: string, issueId: number, hours: number, report: Blob) {
  await rm.timeEntries.create(
    { issue_id: issueId, hours, activity_id: 9, comments: 'pairing' },
    { as: login },                                      // X-Redmine-Switch-User for this call only
  )
  await rm.issues.update(
    { issue_id: issueId, notes: 'Report attached', uploads: [{ file: report, filename: 'report.pdf' }] },
    { as: login },                                      // the file is uploaded first, then sent as a token
  )
}

const entry = await rm.timeEntries.get({ time_entry_id: 3 })
entry.hours satisfies number                             // "8/1" from a buggy 6.0.1 server is already 8

const file = await rm.attachments.download({ attachment_id: 17, filename: 'report.pdf' })
await file.body.pipeTo(destination)                      // URL built from baseUrl, never from content_url
```

### Call site 3: our MCP server or agent toolkit, built on the same registry

```ts
import { operations } from 'redmine-ts-sdk/operations'
import { inputSchemas } from 'redmine-ts-sdk/schemas'

const tools = operations
  .filter((op) => op.readOnly && op.versions.includes('7.0'))
  .map((op) => ({
    name: op.id,                                   // getIssue
    description: op.summary,
    inputSchema: inputSchemas[op.id],              // the flat input: the same object the method takes
    annotations: { readOnlyHint: op.readOnly, destructiveHint: op.destructive, idempotentHint: op.idempotent },
    handler: (input: unknown) => callByInfo(rm, op, input),   // rm[op.namespace][op.verb](input)
  }))
```

`versions` lists every supported Redmine version that has the operation, so nobody compares
version strings. `callByInfo` is ten lines in the toolkit package. It is not an SDK export.

## Shape

### Module map

```
spec/redmine-openapi/*.yaml            vendored, pinned tags (input)
packages/sdk/gen/                      build-time only, not shipped
  generate.ts                          reads every vendored tag, merges, emits src/generated/*
  merge.ts                             superset merge + drift report + semver classification
  surface.ts                           hand-written: naming overrides, retry overrides, operator aliases
packages/sdk/src/
  index.ts                             createRedmine, RedmineError, raw, public types
  def.ts                               OperationDef: the contract between generated and hand-written code
  client.ts                            parse options, build namespaces from the registry, Redmine<V>
  execute.ts                           the one pipeline: gate, auth, limiter, retry, timeout, decode
  request.ts                           pure: flat input -> URL + headers + body; filter compile
  listing.ts                           Listing<T>: paging, keyset, dedupe, limit-ignored guard
  errors.ts                            Problem union, RedmineError, status -> problem mapping
  files.ts                             upload body, Download wrapper
  normalize.ts                         symptom-keyed fixes (hours "8/1"), keyed by envelope name
  testing.ts                           fake fetch for unit tests (exported as /testing)
  generated/                           committed output of gen/
    model.ts                           superset entity types with @since and @stability JSDoc
    operations.ts                      Operations type map + inputs (types only)
    registry.ts                        runtime OperationDef table (method, path, routing, flags)
    versions.ts                        RedmineVersion, OpsIn per version
    schemas.ts                         JSON Schema 2020-12 for inputs and outputs (/schemas)
```

Package exports: `.`, `./operations` (public `OperationInfo[]`, no paths or methods),
`./schemas`, `./testing`. Call chain from the user: `client.ts` closure, then `execute.ts`, then
`request.ts` and `errors.ts`. That is three files.

### The core data structure: the merged registry

One `OperationDef` per operationId, merged across every vendored tag. It is the single source of
truth that the methods, the type map, the version gate, retries, pagination, filter compilation,
JSON Schemas, and tool annotations are all derived from. Nothing else lists operations.
(per model-the-domain, encode-lessons-in-structure)

```ts
interface OperationDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string                       // 'issues/{issue_id}.json', relative, never a leading slash
  route: Record<string, 'path' | 'query' | 'csv' | 'filter' | 'envelope' | 'body'>
  filters: Record<string, readonly OperatorName[]>   // parsed from the spec's "Operators:" lines
  cfFilters: boolean                 // accepts cf_<id> filter keys
  envelope: string | null            // 'issue'
  bodyType: 'json' | 'octet-stream' | null
  response: { kind: 'entity'; key: string } | { kind: 'list'; key: string } | { kind: 'paged'; key: string }
          | { kind: 'empty' } | { kind: 'binary' }
  since: RedmineVersion              // earliest vendored tag that has it
  retry: 'safe' | 'never' | { unlessFields: readonly string[] }
  readOnly: boolean; destructive: boolean; stability: Stability
  keyset?: string                    // 'issue_id' for getIssues: id filter usable for drift-proof paging
}
```

Measured on both pinned specs (probe script in `candidate-a/probe/shape.mjs`): path params,
query params, and envelope fields never share a name in any of the 94/93 operations. 27 bodies are a
single envelope. 3 (`createUser`, `updateUser`, `updateMyAccount`) carry siblings next to
`user` (`send_information`, `pref`), which stay top-level keys. One body is octet-stream
(uploads). 144 query params document an operator list. 39 of the 7.0 operations return an empty
2xx body. The flat input is collision-free today, and the generator fails the build if a future spec
introduces a collision.

### How a call flows

`rm.issues.update(input, opts)` is a closure over `registry.updateIssue`, built once per client by
looping over the registry. `execute(def, input, opts)` then:

1. Gate. If the client declared `redmine` and `def.since` is newer, it throws `unsupported_operation`
   before any network call. Types already hide the method, so this only catches casts and JS callers.
2. Encode (pure, `request.ts`). Each input key is routed by `def.route`. Path params are
   `encodeURIComponent`-filled into the template. `include` and other `csv` params are joined with
   commas. `filter` params are compiled to operator syntax. Envelope fields go back into
   `{ issue: {...} }`. The URL is joined onto a base that was normalized to end in `/`, so
   `/redmine/` survives.
3. Upload inline files. A `uploads` entry with a `file` is POSTed to `uploads.json` as
   octet-stream and swapped for its token before the main request.
4. Send through the per-client limiter (default 4 in flight), with auth headers and `as`. Each
   attempt gets `AbortSignal.any([opts.signal, AbortSignal.timeout(timeoutMs)])`.
5. Retry when `def.retry` allows it: network errors and 429/502/503/504, exponential backoff with
   jitter, `Retry-After` honored, 2 retries by default. POST is never retried. `updateIssue` is
   retried only when the input has no `notes` and no `uploads`, because a replayed PUT with notes
   writes a second journal. A DELETE that returns 404 on a retry counts as success, since the first
   attempt already did the work. (per make-operations-idempotent)
6. Bearer: a 401 triggers one single-flight `refresh()` shared by all concurrent calls, then one
   replay.
7. Decode by `def.response.kind`. Empty bodies never reach `JSON.parse`. Envelopes are unwrapped,
   symptom normalizers run (`hours: "8/1"` becomes `8`), and non-2xx statuses map to a `Problem`.

### Version strategy: superset types, metadata gate, optional narrowing

The measured drift decides it. From 6.1.3 to 7.0.1 Redmine added 1 operation and 3 additive
fields, and removed nothing. The server cannot report its version. A generic "list paths, send any
request" MCP works across versions because the API is additive and the server ignores parameters it
doesn't know. Per-version subpaths turn a 1-operation difference into a second copy of every type,
a second import path, a docs fork, and an import migration whenever a user upgrades Redmine.
They buy almost nothing in exchange.

So:

- The generator merges every vendored tag into one superset model. An operation's `since` is the
  earliest tag that contains it. A field missing from any supported tag is optional and carries
  `@since 7.0` in JSDoc. A field present in every tag keeps its required-ness.
- `createRedmine()` without `redmine` returns `Redmine<RedmineVersion>`, the full surface. That is the
  "it just works" mode. A 404 from an operation newer than the oldest supported version gets
  `problem.hint` ("removeUsers was added in Redmine 7.0. On an older server this 404 is expected").
- `createRedmine({ redmine: '6.1' })` returns `Redmine<'6.1'>`. A generated `OpsIn['6.1']` union removes
  newer methods from the type, and the runtime gate backs it. Field-level narrowing is deliberately
  not done.
- The merge emits a drift report and classifies each change. Additive changes are a minor SDK
  release. A widened response type, a removed operation, or a narrowed request type fails the
  generator until `gen/surface.ts` acknowledges it, and the report names the required major bump.
  This keeps the guarantee research.md wanted from "no floating latest", that types never change
  silently, without the subpaths. (per type-system-discipline: derive from the schema)
- Patch-level regressions (6.0.1 hours, ignored offset/limit) are handled by symptom in
  `normalize.ts` and `listing.ts`, never by version number.

Cost of adding Redmine 7.1: vendor `7.1.x-rN.yaml`, then run `vp run gen`. The report lists the
Documents API operations (default naming gives `documents.list/get/create/...`), plus new fields
marked `@since 7.1`. Then add `redmine:7.1` to the contract matrix and ship a minor release. The
7.1 upload `content_type` change needs no code. The SDK keeps sending it, 7.1 ignores it, and a doc
line notes it. Nobody changes an import. Adding a derived 6.0 works the same way. It is one more
vendored file, and every operation's `since` drops to `6.0`.

### Generated versus hand-written seam

The generator emits data and types only, never control flow. Its inputs are the vendored specs and
`gen/surface.ts`, which holds four small tables: verb overrides (`getIssuesByProject` →
`issues.listInProject`), retry overrides, operator aliases (`parent_id` `~` → `descendantOf`), and drift
acknowledgements. The default naming rule is tag → namespace, and `get`/`create`/`update`/`delete`
prefix → verb, with a plural `get` becoming `list`. The generator fails on an unmapped or duplicate
`namespace.verb`, so every op gets exactly one method.

Hand-written core never names an operation. It reads `OperationDef` fields. The one exception is
`normalize.ts`, which keys symptom fixes by envelope name (`time_entry`, `time_entries`). That is
resource knowledge, not operation knowledge. A CI step runs `gen --check` and fails if
`src/generated` is stale. (per build-the-lever)

### Filters

`filters.ts` holds the one operator table, name → symbol plus arity: `is`/`not`/`everWas`/
`neverWas`/`changedFrom` take a value or an array, `between` takes a pair, `any`/`none`/`open`/
`closed`/`today`... take `true`, `daysAgo`/`olderThanDays`/`withinPastDays` take a number, and the
rest take one value. The generator maps each field's documented symbols to names, so
`status_id` accepts `{ open: true }` but not `{ contains: 'x' }`. `Filter<V, Ops>` is a union of
single-key objects, so two operators on one field cannot be expressed. The same table produces the
JSON Schema `anyOf` the tools layer hands an LLM.

Checked with tsc 7.0.2 against `probe/usage.ts` (the sketch compiles). The checks are: a method
newer than the declared version is a type error, two operators on one field are rejected, an
operator outside a field's list is rejected, `await listing` is not an array, and `raw()` is
accepted. The two-operator check needed `& { [other]?: never }`. A plain union of single-key objects
let `{ gte, lte }` through.

### Pagination

`Listing<T>` is lazy and not thenable. Nothing is sent until you iterate it or call `page()`,
`pages()`, `toArray({ max })`, or `count()`. Iteration uses `limit=100`. For an operation with
`def.keyset` and no caller `sort` or `issue_id`, iteration switches to `sort=id` plus
`issue_id=>=<last+1>`, so concurrent edits can't shift offsets. Otherwise it pages by offset and
dedupes by `id`. If a page repeats the previous first id, or holds more items than the limit, or
the server echoes a different offset, the server ignored paging. Iteration yields the unseen items
once and stops instead of looping.

### Uploads and downloads

Inline: any input whose body has `uploads` (or `createFile`'s `file`) accepts
`{ file: Blob | Uint8Array | ReadableStream, filename, description?, content_type? }` next to plain
tokens. `rm.attachments.upload(...)` stays as a method because it is an operation, and returns the
token object. Downloads are `binary` operations and return
`Download { body, content_type, filename, size, blob(), arrayBuffer() }`. The URL always comes from
`baseUrl` plus the path template.

### Interface depth

The public surface is `createRedmine`, `RedmineError`, `raw`, and the generated method tree with
one call convention. Behind it the SDK hides URL and subpath handling, envelope wrapping, filter
syntax, pagination strategy and its guards, upload sequencing, retry policy per operation, auth
refresh, impersonation headers, empty-body decoding, and normalization. The caller still sees
snake_case entity types. That is a fixed constraint and the honest domain vocabulary. The caller
never sees `.{format}`, `nometa`, headers, offsets, or envelopes.

### What it deliberately does not do

- Name resolution ("In Progress" → 7, `severity` → `cf_12`), journal diffs, and token budgets.
  They belong to the toolkit, built on `rm` plus a cached catalog.
- Response validation by default. `schemas.ts` makes a dev-mode check possible as an opt-in
  `onEvent` consumer.
- Webhooks. That is a later subpath, reusing `model.ts` types.

### Testing

- Unit (`vp test`): `createFakeFetch(routes)` from `/testing` records every `Request`. Tests
  assert observable behavior: the exact URL including the subpath, headers (API key header, never a
  `key=` query), the body envelope, retry counts, decoded output, and `problem.kind`.
  `request.ts`, `filters.ts`, and `normalize.ts` are pure and table-tested. (per
  test-behavior-not-implementation)
- Generator: fixture spec pairs check drift classification. A snapshot of `registry.ts` covers
  both real specs.
- Contract (`vp test --project contract`): docker compose runs `redmine:6.1` and `redmine:7.0`.
  Setup enables REST and mints an admin key via `rails runner`. One suite runs per version with
  `redmine` declared. It covers the MVP lifecycle (project → issue with an upload → update with notes
  → filtered iteration → time entry → delete), a 412 impersonation, a 422 message array, and a
  registry sweep. The sweep calls every GET whose inputs can come from seeded data and validates the
  response against `outputSchemas`, which makes it the spec-drift alarm.

### Tools and MCP

They are derived, not designed separately. `operations` gives id, namespace, verb, summary,
`since`, readOnly/idempotent/destructive, and stability. `inputSchemas[id]` is the flat input,
so the tool's argument is exactly the SDK method's argument, and the handler is a one-line dispatch.
The curated triage toolset is hand-written in the toolkit on top of the same methods.

## Synthesis decision

To be filled in by arena.

## Tradeoffs accepted

- We accept optional `@since` fields on 7.0 (3 fields today) in exchange for one type model and
  no import churn when a user upgrades Redmine.
- We accept shipping the whole registry (~94 small entries, a few KB gzipped, schemas excluded) in
  exchange for string-keyed, uniformly generated methods with no hand-written facade.
- We accept flattening the body envelope, the one shape transformation, in exchange for one flat
  object that is the method argument, the tool input schema, and the JSON Schema at once.
- We accept generated verb names that need a small override table (`listInProject`) in exchange for
  zero hand-written per-resource code.
- We accept that `since` means "since the oldest vendored tag" (6.1), not the true origin version.
  The tag-level "Availability" stays in JSDoc only.

## Alternatives considered

- Per-version subpaths (`redmine-ts-sdk/6.1`, `/7.0`), as in research.md. It loses on depth. It
  exposes the version choice in every import, duplicates every type for a 1-operation difference,
  and forces an import migration on every Redmine upgrade. The guarantee it buys is "types never
  change silently", and the drift classifier delivers that without the cost.
- Hand-written resource facade over a generic `rm.call(op, input)`. That gives two ways to call
  every MVP operation, and a facade that covers 4 of ~20 resources. Contributors copy whichever
  form they see first.
- Version-generic field types (`Issue<V>`). This would give exact required-ness per version, but
  every entity type would carry a type parameter through user code to fix 3 optional fields.

## Open questions and risks

- Biggest risk: does Redmine silently ignore unknown request body attributes on every endpoint? The
  superset lets a 6.1 user send a 7.0-only field. Contract tests should check that it is ignored and
  not a 422.
- Is `updateWikiPage` safe to retry? It may create a duplicate wiki version. Should it start as
  `never`?
- Should the inline upload path delete orphaned uploads when the main request fails, or rely on
  Redmine's prune task?
- Can the official image serve a relative URL root (`/redmine`) for a real subpath contract test, or
  does that stay a unit-level guarantee?
- Do we want the `issues.listInProject`-style verbs at all, or should scoped variants be reachable only
  through the global list with a `project_id` filter?

## Next implementation step

Write `gen/merge.ts` plus `generate.ts` emitting `registry.ts`, `operations.ts`, and `versions.ts`
from both specs, with the drift report, because every other module reads `OperationDef`.
