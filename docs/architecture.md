# @redmine-ts/sdk architecture

This is the synthesized design from a three-way design bakeoff, with candidates in `.audit/arena/`. The type contract lives in `packages/sdk/src/core/*.ts`. Bodies marked `not implemented` are filled against it.

## Problem

We want a typed, zero-dependency, runtime-agnostic Redmine client that a later MCP server and agent toolkit can sit on. HTTP is not the hard part. These are:

1. The server never reports its version.
2. The community OpenAPI spec (`spec/redmine-openapi/`, pinned tags) is the only structured source of truth.
3. Redmine has many behaviours a naive client gets wrong. Subpath base URLs get dropped, PUT and DELETE return empty bodies, 422 returns localized error arrays, offsets drift, uploads take two steps, impersonation fails with a 412 (or is silently ignored on a non-admin key), and `hours` sometimes arrives as `"8/1"`.

## Usage

```ts
import { createRedmine, RedmineError } from "@redmine-ts/sdk";

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
- `overlay.corrections` is the one place the generator changes the specs. Each correction adds properties to a schema's `required` list in every vendored spec before the merge, for fields the spec leaves optional and Redmine always sends: today the issue's `project`, `tracker`, `status`, `priority`, `author` and `parent.id`. Generation fails once requiring a property no longer changes the merged spec. The merge takes `required` from the latest spec, so an upstream fix there is enough to force the correction's removal.
- `overlay.descriptions` replaces an operation's description where the newest spec is wrong for an older supported release. Today that is `updateJournal`: the 7.0.2-r1 text says a journal left with empty notes is kept, which holds only from 6.1.4 and 7.0.1. Each entry quotes the spec text it replaces, so any spec change to that description fails generation.
- `createRedmine<const V>` captures a literal `version`. The generated `Resources<V>` intersects `Additions70` only when `AtLeast<V, "7.0">` holds. This is a lookup table (`Ladder`), not type arithmetic. A wide `RedmineVersion` (from `parseRedmineVersion(env)`) gets the full surface. The runtime guard still applies.
- Patch-level quirks are fixed by symptom in `core/quirks.ts` and the pagination guards, never by version number.

Adding Redmine 7.1 takes five steps. Run `spec/fetch.sh 7.1.0-r1`, then `vp run gen`, and read the drift report. Then add `redmine:7.1` to `docker/compose.yaml` and `scripts/redmine-env.ts`, and ship a minor release. No user changes an import. Dropping an EOL version is a major release.

### Data structures

The central type is `Op<Id, In, Ret>` (`core/op.ts`). It is plain data: method, relative path with `.json` baked in, path params, query styles (`scalar`, `csv`, `brackets`, `repeat`), filter specs, body (`json` with `envelope` and `siblings`, `binary`, or `value`), response shape (`item`, `list`, `empty`, `binary`), includes, `since`/`until`, `safety` and `stability`. `In` and `Ret` are phantom types.

- `In` is the canonical flat input: path params, query keys, body fields (inner envelope fields plus siblings), and `where` for filters. It was measured collision-free across all 94 operations, and the generator asserts it.
- `Ret` is `Promise<T>`, `Listing<T>`, `Promise<void>` or `Promise<Download>`.
- Envelopes and the `{ errors: [...] }` body never reach the public API.
- `repeat` (`k=a&k=b`) and the `value` body (any JSON value from `input[key]`, sent verbatim) exist only for `rm.request`. The generator never emits them, which is why they were added to the contract without touching generated code.

Every method is `rm.<namespace>.<verb>(input, options?)`. The input is the same object a tool's JSON input will be, so the later toolkit needs no translation layer for JSON operations.

### Generated versus hand-written

| Generated (`src/generated/`, committed, never edited)                                         | Hand-written                                                          |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `versions.ts`: VERSIONS, Ladder                                                               | `core/op.ts`, the contract generated code imports                     |
| `schemas.ts`: one type per schema, PascalCase, snake_case fields, `@since`/`@stability` JSDoc | `core/engine.ts`, the impure shell: fetch, limiter, retries, timeouts |
| `ops.ts`: the operation registry, data only                                                   | `core/wire.ts`, pure: plan, interpret, retryDecision, decode          |
| `slots.ts`: namespace to verb to op                                                           | `core/listing.ts`: filter DSL compiler, `Listing`                     |
| `resources.ts`: explicit method signatures, `Resources<V>`, `HttpMethods`                     | `core/config.ts`, `errors.ts`, `files.ts`, `quirks.ts`, `version.ts`  |
| `catalog.ts`: JSON Schemas and metadata per namespace method                                  | `redmine.ts`: assembly, the only module importing both halves         |
|                                                                                               | `catalog.ts`: the `./catalog` entrypoint, adds the extras' entries    |
|                                                                                               | `generator/overlay.ts`: the only hand-written generator input         |

The engine never imports generated operation data, so it is tested against a hand-made registry, and a regenerate cannot change runtime behaviour. `vp run gen:check` regenerates in memory and fails on any diff. `package.json#exports` exposes `.` and `./catalog`, so internals cannot be imported.

Hand-written resource logic lives in `Extras` (`redmine.ts`): `issues.transition` and `attachments.upload/download/thumbnail`. A type check fails the build if an extra shadows a generated method. The one exception is the upload step of the generated create and update methods, which `core/files.ts` composes, as **Uploads** under Core behaviour describes.

Some scoped variants have a global sibling that takes the same scope as a filter or body field. Examples are `getIssuesByProject` next to `getIssues?project_id=`, `createIssueUnderProject` next to `createIssue`, and `getTimeEntriesByIssue`. These are hidden from namespaces so that each task has one way to do it. They stay in the registry. `rm.request()` is the untyped escape hatch for endpoints the spec does not cover, such as plugins. It builds an unregistered `Op` per call, so it shares the whole pipeline. Its `body` is any JSON value (the `value` body kind), validated at that boundary: a function, symbol, bigint, non-finite number or `undefined` array item is `invalid_input`, because `JSON.stringify` would drop or null them silently. Typed bodies pass the same check (`wire.jsonText`). Its `arrayFormat` (`brackets` by default, `comma`, `repeat`) picks the query style for array values. The body travels under a key of its own, so body and query keys never collide.

### Core behaviour

- **URL.** The base always ends in `/`, and operation paths never start with one, so `new URL(path, base)` keeps `/redmine/`. Userinfo in `baseUrl` is rejected.
- **Auth.** The options are `{ apiKey }`, `{ basic }` and `{ bearer: string | { token, refresh } }`. The API key goes only in `X-Redmine-API-Key`. Bearer refresh is single-flight across concurrent 401s, with one replay, and only when the body is replayable. A source may hand one `token()` or `refresh()` promise to many callers, so the engine never cancels one. It races the wait for `token()` against the attempt's signal, which includes the timeout, and the wait for a shared refresh against the caller's signal only. A `token()` that throws or rejects is `network`, with the error as `cause`.
- **Errors.** One `RedmineError` carries `data`, a discriminated union on `kind`. `RedmineError.is(e, kind)` narrows. The 422 messages are raw and localized, so callers display them and never parse them. `toJSON` drops `cause`.
- **Conflicts.** `conflict` is a stale edit, and `wire.interpret` is its only classifier. A 409 is always a conflict (observed on a stale wiki `version`, with an empty body). Redmine answers a stale issue `lock_version` with 422 and `{"errors":[]}`, which is indistinguishable from an empty validation failure by the response alone, so a 422 with no messages is a conflict only when the request body carried `lock_version`. `planRequest` records that fact on the `Plan` (`lockVersion`, top level or inside the envelope) and the engine hands it to `interpret`. Any other 422 stays `validation`. The API never returns `lock_version`, so callers rarely send it. Observed in `.audit/probes/conflicts.out.txt`.
- **Retries.** A 429 retries any method. 502, 503, 504, network errors and timeouts retry only `read` (GET) and `idempotent` (DELETE) operations. POST, PUT and PATCH never retry, because a replayed PUT with notes duplicates a journal. Streamed bodies never retry. Backoff is full-jitter exponential and honours `Retry-After` up to a cap.
- **Timeouts and cancellation.** An attempt takes a concurrency slot, then runs under `AbortSignal.any([caller, timeout])`, which bounds both the wait for credentials and the exchange. Time spent queued for a slot does not count. A timed-out signal maps to `timeout`, the caller's signal to `aborted`. For downloads, the timeout and the concurrency slot cover the request until headers arrive. The body stream then belongs to the caller.
- **Clearing a field.** Redmine skips a falsy `assigned_to_id` in `Issue#safe_attributes=`, so `{"issue":{"assigned_to_id":null}}` leaves the assignee and `""` clears it. Every other nullable field of the updatable resources clears with `null` (`.audit/probes/clear-fields.out.txt`). `RequestBody.clear` lists the body fields that go on the wire as `""` when the input is `null`, set by `overlay.clearAsEmpty` per operation (today `updateIssue.assigned_to_id`). `planRequest` applies it, and it is a no-op for any other field or value. On create, `null` and `""` both mean "unassigned", and the project's default assignee still applies.
- **Wire values.** A caller value becomes wire text in four places: the JSON body (`jsonText`), a path segment (`fillPath`), a query value (`queryText`) and a `where` scalar (`listing.scalar`). Each one asks `util.unsendable` before it converts the value, so a `NaN` or `Infinity` is `invalid_input` before the network. JSON would write it as `null`, which clears most fields. In a URL, Redmine answers the word `NaN` with a 404 or a 422, or reads it as a default, such as 25 for `limit=NaN` (observed on 6.1 and 7.0).
- **Empty bodies.** Empty 2xx text decodes to `undefined`. Bodyless requests send no Content-Type. A non-JSON 2xx on a JSON operation is `protocol/non_json`, with a hint about login pages and wrong subpaths.
- **Impersonation.** Per call, `{ as }` becomes `X-Redmine-Switch-User`. `rm.with({ as })` derives a client that shares the engine. Redmine ignores the header on a non-admin key and runs the request as the key's own user, so a write is silently misattributed (`.audit/probes/redmine-behavior.out.txt`). The engine therefore refuses before sending. The first request that carries `as` waits for one `GET users/current.json`, sent without `as`, and reads `admin` from it (`core/impersonation.ts`). A non-admin key throws `switch_user_rejected` with `reason: "not_admin"` and the impersonated request is never sent. The verdict is cached per engine, so derived clients share it, and concurrent first calls share one in-flight check. A failed check (401, network, timeout) rejects with its own error and is not cached, so it is never reported as `not_admin`. A caller that aborts stops waiting on the shared check without cancelling it for the others. Bad input is refused before the check is spent. Redmine's own 412 on an unknown or inactive login is `switch_user_rejected` with `reason: "rejected_by_server"`, and only when the call sent a switch header: a 412 without one is a plain `http` error. The check shows up in `onEvent` as a `getCurrentUser` request, and the cost is one extra request per engine. The verdict is not refreshed when the key's role changes later.
- **Access.** `access` is `"full"` (the default), `"no-delete"` or `"read-only"`, validated in `resolveConfig`. It is a table of allowed HTTP methods per mode in `core/config.ts`. The engine checks it next to the declared version, before planning or sending, so it covers namespace methods, listings, downloads and `rm.request`, whose op carries the caller's method. A refusal is `access_denied` with the mode and the method. `no-delete` also refuses an update whose fields make Redmine delete records. `DELETING_UPDATES` in `core/wire.ts` keys them by the route Rails sends to the update action, and `run()` checks the planned request with the engine's `checkDeletion(op, plan, options)`, so `rm.request` meets the same rule. That refusal adds `deletes`, a sentence that says what Redmine would delete. A membership update is the one rule that needs the server. Redmine drops each named role that the key cannot manage, and the API does not list the roles a non-admin key manages, so a non-empty `role_ids` can still leave the membership without roles, which deletes it. For such an update the rule returns a read, and the engine sends `GET memberships/<id>.json` first, with the call's options. It sends the update only when `role_ids` names a role that the membership has now, because Redmine keeps that role whether or not the key manages it. The read shows up in `onEvent` as `getMembership`, and a failed read rejects the call with its own error. `issues.transition` asks the engine about its update before it sends the read, so a read-only client refuses the whole transition. Derived clients share the config and cannot widen it. The client type follows a literal `access` too. `createRedmine<const V, const A>` captures it, and `Redmine<V, A>` keeps a namespace method only when `AllowedMethods[A]`, the type twin of the table, contains the HTTP method it sends. The generator emits each method's HTTP method as `HttpMethods` in `resources.ts`. The extras' are hand-written in `ExtraHttpMethods` beside `Extras`, where a missing entry fails the build. It is key filtering in one mapped type, and an access that allows every method skips it, so the full client type is exactly what it was. `rm.request` takes `RawRequest<AllowedMethods[A]>`, and `with` returns `Redmine<V, A>`. A wide `Access` looks up every method and keeps the full surface, as a wide version does. The runtime check stays as defense in depth.
- **Uploads.** Redmine attaches a file in two requests. `POST uploads.json` takes the bytes and returns a token, and the record's `uploads` list carries the token. The six operations whose body references the spec's `uploads` component also take file entries in that list. `overlay.inlineUploads` names the component, and the generator marks each body field that references it as `body.uploads`, read only through `uploadKey(op)`, and types the field `UploadEntry[]`, which is a reference or an `InlineUpload`. Generation fails when the component changes shape, when a body references it below the top level, or when a top-level field named `uploads` stops referencing it, because each reshape would drop the feature without a word. `redmine.ts` sends a marked method through `createUploadingCall` in `core/files.ts`. That function composes two kinds of engine call, so one `Op` stays one request, and the engine and `wire.ts` know nothing about it. Without a file entry it is `engine.call`. With one, it refuses on access and version for both operations, checks each entry, and dry-runs `planRequest` for each upload and for the record with placeholder tokens. It claims the streams before it awaits the engine's check of the record's plan for an update that deletes, so a concurrent call cannot pass the stream check in between. Only then does it upload the files one at a time in list order and send the record. A `RedmineError` after the claim carries `uploads`, the list with each acknowledged file replaced by its reference. The property is non-enumerable and outside `toJSON`, because a token lets anyone who can edit a record attach the file. The client deletes nothing on failure. `no-delete` refuses DELETE, a delete after an unknown record outcome could remove an attachment Redmine had just attached, and the references are the retry state. A retry reuses acknowledged references. That does not make an upload exactly-once, because a lost upload response leaves a stored file the client never learns about. A stream is single-use, so the engine records each stream body as it hands it to fetch, in a module-wide `WeakSet` in `core/files.ts`, and an inline upload refuses a stream that is locked, repeated, or already sent. A call refused before fetch, such as a `read-only` `attachments.upload`, leaves its stream usable. Uploads run one at a time, so at most one is in flight and the failure state is one array. `CatalogEntry.inlineUploads` marks the input in the catalog while `inputSchema` keeps the JSON form, so the MCP tools do not change. The MCP server keeps the two-step `attachments_upload`. A content form in `uploads` would add about 3.7K to 4.3K schema characters across five of the most used tools, and over `--http` all the files would share one 4 MiB request body.
- **Concurrency.** A FIFO limiter (default 4) caps the requests in flight per engine. It is released during backoff sleeps. Requests share four pieces of mutable state. The limiter and the cached admin check are per engine, so a client and the clients that `rm.with` derives from it share them. The bearer token a refresh returned, and the refresh in flight, live in the config's authenticator (`core/config.ts`), which derived clients share too. The `WeakSet` of sent streams in `core/files.ts` is module-wide, so every client in the process shares it.
- **Observability.** One `onEvent` callback receives request, response, retry and error events, which are redacted by construction.

### Pagination and filters

- **`Listing<T>`.** It is lazy and offers `for await`, `page()`, `pages()`, `all({ max })` and `count()`. It is not thenable. Offset paging advances by the number of items received. It throws `protocol/pagination_offset_mismatch` when the echoed offset differs (the class of the 6.0.1 `/projects` bug), and `pagination_stalled` on a repeated page. It also throws `page_cap` rather than truncating silently.
- **Keyset paging.** `paging: "keyset"` (issues) uses `sort=id` with `issue_id=>=last+1`. It is immune to inserts and deletes during the walk, but it is not a snapshot.
- **Filter DSL.** Keys are wire param names (`status_id`, `assigned_to_id`, `cf_12`), so there is no alias table to drift. Each field's legal operators come from the spec's `Operators:` lines. `Cond<V, Caps>` narrows the type per field, and `compileWhere` rejects an unknown key or an undocumented operator before the network. Observed on 6.1 and 7.0, Redmine silently ignores an unknown key and returns every row, and it evaluates an undocumented operator into zero rows (`.audit/probes/redmine-behavior.out.txt`). `{ raw }` is the escape hatch for relative dates. Redmine reads `project_id` as the request's project before it reads filters, and answers 404 to anything but one id or identifier. For such a value, `longForm` sends the whole query as `f[]`, `op[k]` and `v[k][]`, keyset bound included. It reads a standard filter's value with a port of Redmine's `Query#add_short_filter` and the spec's operators, which match Redmine's operator table for the field's type on 6.1 and 7.0. A custom field's table depends on its format, which the client does not know. So a custom field there takes the operator its condition names, and its `raw`, or a value that starts with an operator character, is `invalid_input`. On every request, `checkScope` refuses what Redmine would drop with no error: a filter that `IssueQuery` or `TimeEntryQuery` adds only `if project`, without one project, and any filter but one `project_id` next to `query_id`, because Redmine runs the saved query's own filters. `FilterSpec.scoped` marks the first kind, set by `overlay.projectScoped`. A word such as status_id's `"open"` is an operator, so `compileWord` takes it only alone, and under `not` as its opposite. The generator writes each filter's description in this grammar (`generator/filters.ts`): a summary, its value, and the forms it takes, while the spec's wire syntax stays on the `raw` form. The value comes from the spec's operators and `Values:` lines, or from `overlay.filterValues` and `overlay.subtrees` where the spec says nothing, and generation fails for a filter without one.
- **List separators.** Redmine's short filter syntax splits a value on `|`, but a few id filters read only the first value and split that on commas, so `issue_id=4|9` returns issue 4 alone and `issue_id=4,9` returns both (`issue_id`, `parent_id`, `child_id`, `done_ratio`, the nine relation filters, and `issue.parent_id` on time entries). `FilterSpec.join` is `","` for those, set by `overlay.commaLists` per query class (issues and time entries each build their operations from one query) and emitted by the generator. `compileWhere` joins `=` and `not` lists with it. A range keeps `|`, because `><a|b` is a pair. A filter without `join` is unchanged, so the table is symptom data and no server version appears in it. Observed on 6.1 and 7.0: `.audit/probes/id-list-filters.out.txt`.

### Testing

- **Unit tests.** They use a fake `fetch` with a hand-made registry, so the engine is tested without the generator. They assert observable behaviour: the exact URL including the subpath, headers (never a `key=` query), body envelopes, retry counts per safety class, decoded output and error kinds.
- **Type tests.** `tests/types/*.ts` uses `@ts-expect-error` for version gating, access narrowing, include narrowing and filter operator capabilities. `vp check` typechecks them.
- **Generator tests.** They assert the known 6.1 to 7.0 drift, zero input collisions, and the requiredness rule.
- **Contract tests.** These run against real Docker Redmine 7.0, 6.1, and 7.0 under `/redmine` (`node scripts/redmine-env.ts up`). They cover CRUD for issues, projects, users and time entries, pagination, filters, upload with attach and download, inline uploads with their retry and replay rules, include narrowing, 404/409/422/412 errors, the impersonation guard against an admin and a non-admin key, version gating against the real 6.1 server, the `read-only` and `no-delete` access modes, and the catalog's input and output schemas against real requests and responses.

### Catalog

`@redmine-ts/sdk/catalog` is a second pack entry, so the main bundle does not carry the schemas. The generator writes `src/generated/catalog.ts` from the same `OpModel` that types the inputs: every field keeps the spec schema it was rendered from, so the JSON Schema and the TypeScript input come from one node. `src/catalog.ts` adds hand-written entries for the four extras.

- **Inputs.** One closed object per method (`additionalProperties: false`), `required` as in the TypeScript input, spec descriptions kept, `nullable` as a union with `null`, `oneOf` as `anyOf`. `where` lists each documented filter as the `Cond` forms `compileWhere` accepts: a scalar or a non-empty array, `{ raw }`, and only the operator objects whose wire code the filter documents. That is narrower than the `Cond` capability types, which group operators, and a unit test proves schema and compiler agree on a table of conditions for every filter. `sort`, `pageSize` and `paging` appear only where the list takes them.
- **Outputs.** The schema of one item. Requiredness follows the generated types (the superset rule, sparse includes optional), and objects stay open, so a property a newer server adds never fails validation. An item that can answer 204 (`updateWikiPage`) is marked `optional`. A contract test validates every read method's real responses, and the results of the writes that seed them, against these schemas on all three servers.
- **Shape.** Component schemas become shared constants in the generated file and are inlined by reference, so each schema is self-contained with no `$ref`. The generator fails on a recursive component. The binary `file` of `attachments.upload` has no JSON type: the tool layer owns that boundary. `inlineUploads` names the input whose entries may carry bytes, and its schema lists only the JSON form.

### MCP server (later)

Tool annotations come from the catalog: a read gives `readOnlyHint`, DELETE gives `destructiveHint`, PUT gives `idempotentHint`. The MCP server also owns the JSON boundary for binary inputs and list paging, which the SDK surface does not have to share. Nothing in the SDK imports `@modelcontextprotocol/sdk`.

## Synthesis decision

The bakeoff had three runners. A ran on Opus and B on Sonnet, both designing freely. C ran on Opus, assigned to steelman the research's per-version subpaths. The cross-judge was GPT-6.1-Sol, which scored A 22, C 21 and B 20.

- **Version strategy.** A and B converged on their own on the superset with an optional declared version. C's own verdict was that a single entrypoint is simpler at today's drift. This is the consensus shape.
- **Base.** The public surface is A's: one method convention with a single flat-object input, no public operation descriptors, and no second public dispatcher. The judge preferred it over B's positional ids plus `rm.call`, and the TypeScript guidance favours object arguments. The internals are B's: the pure `wire` module, the engine with no generated imports, `Listing` with explicit pagination errors, the error union, `Extras` with the no-shadow check, `Included<T, I>`, and `where` nesting for filters.
- **Grafts from A.** Single-flight bearer refresh, `Listing.count()`, and the 404 hint for operations newer than the oldest version when no version is declared.
- **Grafts from C.** The version list derives from spec file names, and the requiredness rule separates spec-precision changes from server drift.
- **Grafts from the judge.** `removeUsersFromGroup` sends `user_ids[]` as repeated query params (A and B sketched a JSON body). Single scalar bodies (`addWatcher`, `addUserToGroup`) have no envelope. User bodies carry top-level siblings (`send_information`, `pref`). A's "DELETE 404 on retry counts as success" rule was dropped, because `removeUsersFromGroup` returns 404 legitimately. Streamed downloads have a defined lifecycle.
- **Rejected.** Per-version subpaths (C), hand-written per-resource facades (C), filter alias tables (C), positional arguments and a public `rm.call` (B), and inline uploads inside create/update (A). An explicit `attachments.upload` keeps two-step semantics visible, and inline uploads can be added later without breaking anything. They were added later beside it, as **Uploads** under Core behaviour describes.

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
