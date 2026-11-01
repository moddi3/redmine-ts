# Architecture

This page explains the design of `@redmine-ts/sdk`, the reasons behind it, and how `@redmine-ts/mcp` builds on it. The SDK's design came from a bakeoff between three designs. The candidates are in `.audit/arena/`, and [Synthesis decision](#synthesis-decision) records the outcome. The type contract lives in `packages/sdk/src/core/*.ts`.

## Problem

The goal is a typed Redmine client that has no runtime dependencies and uses only web platform APIs. The MCP server in `packages/mcp` builds on it, and so can a future agent toolkit. HTTP is not the hard part. The hard parts are these:

1. The server never reports its version.
2. The community OpenAPI spec in `spec/redmine-openapi/`, vendored at pinned tags, is the only structured source of truth.
3. Redmine has many behaviours that a naive client gets wrong. A naive client drops the subpath of a base URL. PUT and DELETE return empty bodies, and a 422 returns an array of localized errors. Offsets drift, and uploads take two steps. Impersonation fails with a 412, or Redmine silently ignores it on a non-admin key. `hours` sometimes arrives as `"8/1"`.

## Usage

```ts
import { createRedmine, RedmineError } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine", // subpath kept
  auth: { apiKey: process.env.REDMINE_API_KEY! }, // X-Redmine-API-Key header only
  version: "6.1", // optional; narrows types and refuses newer operations before any request
});

const issue = await rm.issues.get({ issue_id: 42, include: ["journals", "allowed_statuses"] });
console.log(issue.journals.length); // journals is Journal[], not optional, because it was included

for await (const open of rm.issues.list({
  where: {
    project_id: "web",
    status_id: "open", // status_id=o
    assigned_to_id: { none: true }, // assigned_to_id=!*
    updated_on: { gte: "2026-10-01" }, // updated_on=>=2026-10-01
    cf_12: ["S1", "S2"], // cf_12=S1|S2
  },
  sort: "updated_on:desc",
})) {
  console.log(open.subject); // fetched in pages of 100; `break` stops fetching
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

There is one entrypoint, one runtime, and one type model. The research proposed per-version subpaths (`/6.1`, `/7.0`). The measurements below decided against them.

- From 6.1.3-r1 to 7.0.1-r1, the spec added 1 operation (`removeUsersFromGroup`) and removed none. In 3 schemas, it added 4 properties. Everything else is identical.
- `wiki_page.summary.project` appeared in 7.0.1, a patch release. A module of types fixed per x.y version would still be wrong for 7.0.0 users. The honest type for a field that a later release adds is optional.
- Per-version modules duplicate every type to express one operation. They force every consumer to rewrite imports on a server upgrade. They also give an MCP server that talks to several instances a family of client types instead of one.
- The owner's generic Redmine MCP server works across versions because Redmine changes its API only by adding to it. The SDK keeps that property. Without a `version`, the client offers every operation and guards none. A 404 from an operation newer than the oldest supported version carries a hint.

The mechanics:

- The generator merges all vendored specs into a superset. An operation's `since` is the first spec that has it. When a newer spec drops the operation, `until` is the last spec that has it.
- A property is required only when the latest spec requires it **and** it exists in every supported version's schema. A `required` list that grew between spec revisions, such as the journal lists in 7.0.1, counts as spec precision, not server drift. A property missing from an older version is optional and carries `@since`.
- A non-additive change, such as a type change or a removed property, fails generation until `generator/overlay.ts` records a decision. The generator never picks a side silently.
- `overlay.corrections` is the one place where the generator changes the specs. A correction covers properties that the spec leaves optional and Redmine always sends. Before the merge, each correction adds those properties to a schema's `required` list in every vendored spec. Today the corrections cover the issue's `project`, `tracker`, `status`, `priority`, `author`, and `parent.id`. Generation fails once requiring a property no longer changes the merged spec. The merge takes `required` from the latest spec, so an upstream fix in that spec is enough to force the correction's removal.
- `overlay.descriptions` replaces an operation's description where the newest spec is wrong for an older supported release. Today the one entry is `updateJournal`. The 7.0.2-r1 text says that Redmine keeps a journal left with empty notes, and Redmine does so only from 6.1.4 and 7.0.1. Each entry quotes the spec text it replaces, so any spec change to that description fails generation.
- `createRedmine<const V>` captures a literal `version`. The generated `Resources<V>` intersects `Additions70` only when `AtLeast<V, "7.0">` holds. `AtLeast` is a lookup table (`Ladder`), not type arithmetic. A wide `RedmineVersion`, such as the result of `parseRedmineVersion(env)`, gets every method. The runtime guard still applies.
- `core/quirks.ts` and the pagination guards fix patch-level quirks by symptom, never by version number.

So adding a Redmine version is a minor release, and no user changes an import. [Add a Redmine version](../CONTRIBUTING.md#add-a-redmine-version) lists the steps. Dropping an end-of-life version is a major release.

### Data structures

The central type is `Op<Id, In, Ret>` (`core/op.ts`). It is plain data: the method, the relative path that already ends in `.json`, path params, query styles (`scalar`, `csv`, `brackets`, `repeat`), filter specs, the body (`json` with `envelope` and `siblings`, `binary`, or `value`), the response shape (`item`, `list`, `empty`, `binary`), includes, `since` and `until`, `safety`, and `stability`. `In` and `Ret` are phantom types.

- `In` is the canonical flat input. It holds path params, query keys, body fields (the fields inside the envelope, plus siblings), and `where` for filters. We measured no key collisions across all 94 operations, and the generator asserts that none exist.
- `Ret` is `Promise<T>`, `Listing<T>`, `Promise<void>`, or `Promise<Download>`.
- Envelopes and the `{ errors: [...] }` body never reach the public API.
- `repeat` (`k=a&k=b`) and the `value` body exist only for `rm.request`. The `value` body sends any JSON value from `input[key]` verbatim. The generator never emits either of them, so adding them to the contract changed no generated code.

Every method has the form `rm.<namespace>.<verb>(input, options?)`. The input is the same object as an MCP tool's JSON input, so the MCP server needs no translation layer for JSON operations.

### Generated versus hand-written

| Generated (`src/generated/`, committed, never edited)                                             | Hand-written                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `versions.ts`: VERSIONS, Ladder                                                                   | `core/op.ts`, the contract that generated code imports                   |
| `schemas.ts`: one type per schema, PascalCase, snake_case fields, `@since` and `@stability` JSDoc | `core/engine.ts`, the impure shell: fetch, limiter, retries, timeouts    |
| `ops.ts`: the operation registry, data only                                                       | `core/wire.ts`, pure: plan, interpret, retryDecision, decode             |
| `slots.ts`: namespace to verb to op                                                               | `core/listing.ts`: filter DSL compiler, `Listing`                        |
| `resources.ts`: explicit method signatures, `Resources<V>`, `HttpMethods`                         | `core/config.ts`, `errors.ts`, `files.ts`, `quirks.ts`, `version.ts`     |
| `catalog.ts`: JSON Schemas and metadata per namespace method                                      | `redmine.ts`: assembly, the only module that imports both halves         |
|                                                                                                   | `catalog.ts`: the `./catalog` entrypoint, which adds the extras' entries |
|                                                                                                   | `generator/overlay.ts`: the only hand-written generator input            |

The engine never imports generated operation data. So the unit tests run it against a hand-made registry, and a new generation run cannot change runtime behaviour. `vp run gen:check` regenerates in memory and fails on any diff. `package.json#exports` exposes only `.` and `./catalog`, so a user cannot import internals.

Hand-written resource logic lives in `Extras` in `redmine.ts`. The extras are `issues.transition`, `attachments.upload`, `attachments.download`, and `attachments.thumbnail`. A type check fails the build if an extra shadows a generated method. The one piece of hand-written resource logic outside `Extras` is the upload step of the generated create and update methods. `core/files.ts` composes that step, as **Uploads** under Core behaviour describes.

Some scoped variants have a global sibling that takes the same scope as a filter or a body field. Examples are `getIssuesByProject` next to `getIssues?project_id=`, `createIssueUnderProject` next to `createIssue`, and `getTimeEntriesByIssue`. The overlay hides these variants from the namespaces so that each task has one way to do it. They stay in the registry. `rm.request()` is the untyped fallback for endpoints that the spec does not cover, such as plugin endpoints. It builds an unregistered `Op` for each call, so it goes through the same pipeline as every other method. Its `body` takes any JSON value (the `value` body kind), and `rm.request` validates the body on entry. A function, a symbol, a bigint, or a non-finite number is `invalid_input`, because `JSON.stringify` would silently drop it or turn it into `null`. Its `arrayFormat` picks the query style for array values: `brackets` (the default), `comma`, or `repeat`. The input holds the body under a key of its own, so body keys and query keys never collide.

### Core behaviour

- **URL.** The base always ends in `/`, and operation paths never start with one, so `new URL(path, base)` keeps `/redmine/`. The client rejects userinfo in `baseUrl`.
- **Auth.** The options are `{ apiKey }`, `{ basic }`, and `{ bearer: string | { token, refresh } }`. The API key goes only in `X-Redmine-API-Key`. Bearer refresh is single-flight, so concurrent 401s share one refresh. Each request then replays once, and only when its body is replayable.
- **Errors.** One `RedmineError` carries `data`, a discriminated union on `kind`. `RedmineError.is(e, kind)` narrows the type. The 422 messages are raw and localized, so callers display them and never parse them. `toJSON` drops `cause`.
- **Conflicts.** The `conflict` kind means a stale edit, and `wire.interpret` is the only code that assigns it. A 409 is always a conflict. The probes saw one, with an empty body, for a stale wiki `version`. Redmine answers a stale issue `lock_version` with 422 and `{"errors":[]}`. The response alone cannot tell that answer apart from a validation failure with no messages. So a 422 with no messages is a conflict only when the request body carried `lock_version`. `planRequest` records that fact on the `Plan` as `lockVersion`, whether `lock_version` was at the top level or inside the envelope. The engine hands `lockVersion` to `interpret`. Any other 422 stays `validation`. The API never returns `lock_version`, so callers rarely send it. The probe output is in `.audit/probes/conflicts.out.txt`.
- **Retries.** The engine retries any method after a 429. After a 502, 503, or 504, a network error, or a timeout, it retries only `read` (GET) and `idempotent` (DELETE) operations. POST, PUT, and PATCH never retry after those failures, because a replayed PUT with notes duplicates a journal. Streamed bodies never retry. Backoff is full-jitter exponential and honours `Retry-After` up to a cap.
- **Timeouts and cancellation.** Each attempt runs under `AbortSignal.any([caller, AbortSignal.timeout(ms)])`. A timed-out signal maps to `timeout`, and the caller's signal maps to `aborted`. For downloads, the timeout and the concurrency slot cover the request until headers arrive. The body stream then belongs to the caller.
- **Clearing a field.** Redmine skips a falsy `assigned_to_id` in `Issue#safe_attributes=`. So `{"issue":{"assigned_to_id":null}}` leaves the assignee in place, and `""` clears it. Every other nullable field of the updatable resources clears with `null` (`.audit/probes/clear-fields.out.txt`). `RequestBody.clear` lists the body fields that the client sends as `""` when the input is `null`. `overlay.clearAsEmpty` sets that list per operation, and today it names only `updateIssue.assigned_to_id`. `planRequest` applies the list and changes no other field or value. On create, `null` and `""` both mean "unassigned", and the project's default assignee still applies.
- **Empty bodies.** An empty 2xx body decodes to `undefined`. A request without a body sends no Content-Type. A non-JSON 2xx on a JSON operation is `protocol/non_json`, with a hint about login pages and wrong subpaths.
- **Impersonation.** Per call, the client sends `{ as }` as the `X-Redmine-Switch-User` header. `rm.with({ as })` derives a client that shares the engine. On a non-admin key, Redmine ignores the header and runs the request as the key's own user. So Redmine records a write under the wrong user and reports no error (`.audit/probes/redmine-behavior.out.txt`). The engine therefore checks before it sends. The first request that carries `as` waits for one `GET users/current.json`, sent without `as`, and reads `admin` from the answer (`core/impersonation.ts`). For a non-admin key, the call throws `switch_user_rejected` with `reason: "not_admin"`, and the engine never sends the impersonated request. Each engine caches its verdict, so derived clients share it, and concurrent first calls share one check in flight. A failed check, such as a 401, a network error, or a timeout, rejects with its own error. The engine does not cache that failure, so it never reports one as `not_admin`. A caller that aborts stops waiting on the shared check, and the check goes on for the other callers. The engine refuses bad input before it spends the check. Redmine answers 412 to an unknown or inactive login. That 412 becomes `switch_user_rejected` with `reason: "rejected_by_server"` only when the call sent a switch header. A 412 without one is a plain `http` error. The check shows up in `onEvent` as a `getCurrentUser` request, and it costs one extra request per engine. The engine does not refresh the verdict when the key's role changes later.
- **Access.** `access` is `"full"` (the default), `"no-delete"`, or `"read-only"`, and `resolveConfig` validates it. `core/config.ts` holds a table of the HTTP methods that each mode allows. The engine checks that table next to the declared version, before it plans or sends a request. So the check covers namespace methods, listings, downloads, and `rm.request`, whose op carries the caller's method. A refusal is `access_denied` with the mode and the method. `no-delete` also refuses an update whose fields make Redmine delete records. `DELETING_UPDATES` in `core/wire.ts` lists those updates, keyed by the route that Rails sends to the update action. `run()` checks the planned request with the engine's `checkDeletion(op, plan, options)`, so `rm.request` meets the same rule. That refusal adds `deletes`, a sentence that says what Redmine would delete. The rule for a membership update is the one rule that needs the server. Redmine drops each named role that the key cannot manage, and the API does not list the roles that a non-admin key manages. So a non-empty `role_ids` can still leave the membership with no roles, and Redmine then deletes the membership. For such an update, the rule returns a read, and the engine first sends `GET memberships/<id>.json` with the call's options. The engine sends the update only when `role_ids` names a role that the membership has now, because Redmine keeps that role whether or not the key manages it. The read shows up in `onEvent` as `getMembership`, and a failed read rejects the call with its own error. `issues.transition` asks the engine about its update before it sends its read, so a read-only client refuses the whole transition. Derived clients share the config and cannot widen it. The client type follows a literal `access` too. `createRedmine<const V, const A>` captures it. `Redmine<V, A>` keeps a namespace method only when `AllowedMethods[A]` contains the HTTP method that the namespace method sends. `AllowedMethods` is the type-level copy of the table. The generator emits each method's HTTP method as `HttpMethods` in `resources.ts`. The HTTP methods of the extras are hand-written in `ExtraHttpMethods` beside `Extras`, and a missing entry there fails the build. The narrowing filters keys in one mapped type. An access that allows every method skips the filter, so the full client type stays exactly what it was. `rm.request` takes `RawRequest<AllowedMethods[A]>`, and `with` returns `Redmine<V, A>`. A wide `Access` type allows every HTTP method, so the client keeps every method, as it does for a wide version. The runtime check stays as defense in depth.
- **Uploads.** Redmine attaches a file in two requests. `POST uploads.json` takes the bytes and returns a token, and the record's `uploads` list carries the token. The six operations whose body references the spec's `uploads` component also take file entries in that list. `overlay.inlineUploads` names the component. The generator marks each body field that references the component as `body.uploads`, which code reads only through `uploadKey(op)`. The generator types that field as `UploadEntry[]`, and each entry is a reference or an `InlineUpload`. Generation fails when the component changes shape, when a body references it below the top level, or when a top-level field named `uploads` stops referencing it. Each of these changes would silently drop the feature. `redmine.ts` sends a marked method through `createUploadingCall` in `core/files.ts`. `createUploadingCall` composes two kinds of engine call. One `Op` stays one request, and neither the engine nor `wire.ts` knows about inline uploads. Without a file entry, the call is a plain `engine.call`. With a file entry, `createUploadingCall` applies the access and version checks to both operations and checks each entry. It also dry-runs `planRequest` for each upload, and for the record with placeholder tokens. It claims the streams before it awaits the engine's deletion check on the record's plan, so a concurrent call cannot pass the stream check in between. Only then does it upload the files one at a time in list order and send the record. A `RedmineError` thrown after the claim carries `uploads`. That list is the input list with each acknowledged file replaced by its reference. The `uploads` property is non-enumerable and left out of `toJSON`, because a token lets anyone who can edit a record attach the file. The client deletes nothing on failure, for three reasons. `no-delete` refuses DELETE. After an unknown record outcome, a delete could remove an attachment that Redmine had attached moments before. The references are also the retry state. A retry reuses acknowledged references. Reuse does not make an upload exactly-once, because a lost upload response leaves a stored file that the client never learns about. A stream is single-use. The engine records each stream body in a module-wide `WeakSet` in `core/files.ts` as it hands the body to fetch. An inline upload refuses a stream that is locked, repeated, or already sent. A call refused before fetch, such as a `read-only` `attachments.upload`, leaves its stream usable. Uploads run one at a time, so at most one is in flight, and the failure state is one array. `CatalogEntry.inlineUploads` marks the input in the catalog, and `inputSchema` keeps the JSON form, so the MCP tools do not change. The MCP server keeps the two-step `attachments_upload`. A content form in `uploads` would add about 3.7K to 4.3K schema characters across five of the most-used tools. Over `--http`, all the files would also share one request body of about 6.7 MiB.
- **Concurrency.** A FIFO limiter (default 4) caps the requests in flight per engine. A request gives its slot back while it sleeps in backoff. Requests share four pieces of mutable state. The limiter and the cached admin check are per engine, so a client and the clients that `rm.with` derives from it share them. The bearer token that a refresh returned and the refresh in flight live in the config's authenticator (`core/config.ts`), which derived clients also share. The `WeakSet` of sent streams in `core/files.ts` is module-wide, so every client in the process shares it.
- **Observability.** One `onEvent` callback receives request, response, retry, and error events. The engine builds these events already redacted.

### Pagination and filters

- **`Listing<T>`.** A listing is lazy and offers `for await`, `page()`, `pages()`, `all({ max })`, and `count()`. It is not thenable. Offset paging advances by the number of items received. A listing throws `protocol/pagination_offset_mismatch` when the server echoes a different offset. The 6.0.1 `/projects` bug belongs to that class. A listing throws `pagination_stalled` on a repeated page, and it throws `page_cap` instead of silently truncating the results.
- **Keyset paging.** `paging: "keyset"` works on issues and uses `sort=id` with `issue_id=>=last+1`. Inserts and deletes during the walk do not disturb it, but it is not a snapshot.
- **Filter DSL.** Keys are wire param names (`status_id`, `assigned_to_id`, `cf_12`), so no alias table can drift out of sync. Each field's legal operators come from the spec's `Operators:` lines. `Cond<V, Caps>` narrows the type per field. `compileWhere` rejects an unknown key or an undocumented operator before any request. The probes on 6.1 and 7.0 saw Redmine silently ignore an unknown key and return every row. They saw an undocumented operator return zero rows (`.audit/probes/redmine-behavior.out.txt`). `{ raw }` is the fallback for relative dates. Redmine reads `project_id` as the request's project before it reads filters, and it answers 404 to anything but one id or identifier. For any other `project_id` value, `longForm` sends the whole query as `f[]`, `op[k]`, and `v[k][]`, including the keyset bound. `longForm` reads a standard filter's value with a port of Redmine's `Query#add_short_filter` and the spec's operators. On 6.1 and 7.0, those operators match Redmine's operator table for the field's type. A custom field's table depends on its format, which the client does not know. So in the long form, a custom field takes the operator that its condition names. A `raw` condition on a custom field, or a value that starts with an operator character, is `invalid_input`. On every request, `checkScope` refuses two things that Redmine would drop with no error. The first is a filter that `IssueQuery` or `TimeEntryQuery` adds only `if project`, sent without one project. The second is any filter except one `project_id` next to `query_id`, because Redmine runs the saved query's own filters. `FilterSpec.scoped` marks the first kind, and `overlay.projectScoped` sets it. A word such as `"open"` for `status_id` is an operator. So `compileWord` accepts a word only on its own, or under `not`, where the word means its opposite. The generator writes each filter's description in this grammar, in `generator/filters.ts`. A description has a summary, the filter's value, and the forms that the filter takes. The spec's wire syntax stays on the `raw` form. The value comes from the spec's operators and `Values:` lines. Where the spec says nothing, the value comes from `overlay.filterValues` and `overlay.subtrees`. Generation fails for a filter without a value.
- **List separators.** Redmine's short filter syntax splits a value on `|`. A few id filters read only the first value and split that value on commas. So `issue_id=4|9` returns issue 4 alone, and `issue_id=4,9` returns both. These filters are `issue_id`, `parent_id`, `child_id`, `done_ratio`, the nine relation filters, and `issue.parent_id` on time entries. For them, `FilterSpec.join` is `","`. `overlay.commaLists` sets it per query class, and the generator emits it. Issues and time entries each build their operations from one query. `compileWhere` joins `=` and `not` lists with `join`. A range keeps `|`, because `><a|b` is a pair. A filter without `join` is unchanged. So the table is symptom data, and no server version appears in it. The probes observed the comma behaviour on 6.1 and 7.0 (`.audit/probes/id-list-filters.out.txt`).

### Testing

- **Unit tests.** They use a fake `fetch` with a hand-made registry, so they test the engine without the generator. They assert observable behaviour: the exact URL including the subpath, headers (never a `key=` query), body envelopes, retry counts per safety class, decoded output, and error kinds.
- **Type tests.** `tests/types/*.ts` uses `@ts-expect-error` for version gating, access narrowing, include narrowing, and filter operator capabilities. `vp check` typechecks these files.
- **Generator tests.** They assert the known 6.1 to 7.0 drift, zero input collisions, and the requiredness rule.
- **Contract tests.** These run against three real Redmine servers in Docker: 7.0, 6.1, and 7.0 under `/redmine`. `node scripts/redmine-env.ts up` starts them. The tests cover CRUD for issues, projects, users, and time entries. They also cover pagination, filters, upload with attach and download, inline uploads with their retry and replay rules, include narrowing, and 404, 409, 422, and 412 errors. Other tests check the impersonation guard against an admin key and a non-admin key, version gating against the real 6.1 server, and the `read-only` and `no-delete` access modes. The last group checks the catalog's input and output schemas against real requests and responses.

### Catalog

`@redmine-ts/sdk/catalog` is a second entrypoint of the package, so the main bundle does not carry the schemas. The generator writes `src/generated/catalog.ts` from the same `OpModel` that types the inputs. Every field keeps the spec schema that the generator rendered it from, so the JSON Schema and the TypeScript input come from one node. `src/catalog.ts` adds hand-written entries for the four extras.

- **Inputs.** Each method has one closed object (`additionalProperties: false`). `required` matches the TypeScript input, and the spec's descriptions stay. `nullable` becomes a union with `null`, and `oneOf` becomes `anyOf`. `where` lists each documented filter as the `Cond` forms that `compileWhere` accepts: a scalar or a non-empty array, `{ raw }`, and only the operator objects whose wire code the filter documents. This schema is narrower than the `Cond` capability types, which group operators. A unit test proves that the schema and the compiler agree on a table of conditions for every filter. `sort`, `pageSize`, and `paging` appear only where the list takes them.
- **Outputs.** Each output is the schema of one item. Requiredness follows the generated types, with the superset rule and with sparse includes optional. Objects stay open, so a property that a newer server adds never fails validation. The catalog marks an item `optional` when its operation can answer 204, as `updateWikiPage` can. A contract test validates every read method's real responses, and the results of the writes that seed them, against these schemas on all three servers.
- **Shape.** Component schemas become shared constants in the generated file, and each schema embeds them as object references. So each schema is self-contained, with no `$ref`. The generator fails on a recursive component. The binary `file` of `attachments.upload` has no JSON type. The tool layer owns that boundary. `inlineUploads` names the input whose entries may carry bytes, and its schema lists only the JSON form.

### MCP server

`@redmine-ts/mcp` in `packages/mcp` turns the catalog into MCP tools. Nothing in the SDK imports MCP code, so the SDK still has no runtime dependencies. The MCP package depends on the official MCP TypeScript SDK (`@modelcontextprotocol/server`), on `jose` to verify client assertion JWTs, and on `zod` to parse its settings, workflow tool inputs, and OAuth messages. The CLI reads its flags with `parseArgs` from `node:util`.

- **Tools.** The server generates one tool per catalog entry, named `<namespace>_<verb>`. It adds seven hand-written workflow tools, or eight with a files directory. They run on the same code path. Each tool's hints come from its HTTP method, as the [hints table](mcp/tools.md#generated-tools) lists. The server, not the SDK, owns the JSON boundary for binary inputs and for list paging.
- **Access.** The server passes its access mode and declared version to the SDK client. So the SDK refuses, before any request, a call that the mode or the version does not allow, whatever the MCP client asks.
- **Transports.** stdio serves a local client. `createRedmineMcpHandler` is a web-standard request handler for Streamable HTTP, and the CLI's `--http` serves it through `node:http`. On `SIGINT` or `SIGTERM`, the CLI closes the HTTP server and lets the requests in flight finish. A second signal stops it at once.
- **OAuth.** The server is its own authorization server for MCP clients, and it signs people in through Redmine's OAuth. It seals codes, tokens, states, and registrations with AES-GCM under keys that HKDF derives from one secret, so it needs no database. Enforcing single use, rotating refresh tokens, and ending a sign-in all need shared state, which a `GrantStore` holds. The CLI keeps that store in memory. [Grant store](mcp/authentication.md#grant-store) lists the guarantees with and without a shared store.

[MCP server package](roadmap.md#mcp-server-package) in the roadmap records the decisions behind the server.

## Synthesis decision

The bakeoff had three runners. A ran on Opus and B ran on Sonnet, and both designed freely. C ran on Opus with the task of making the strongest case for the research's per-version subpaths. The cross-judge was GPT-6.1-Sol. It scored A 22, C 21, and B 20.

- **Version strategy.** A and B each reached the superset with an optional declared version on their own. C concluded that a single entrypoint is simpler at today's drift. So the superset with an optional declared version is the consensus shape.
- **Base.** The public API is A's design: one method convention with a single flat-object input, no public operation descriptors, and no second public dispatcher. The judge preferred it over B's positional ids with `rm.call`. The TypeScript guidance also favours object arguments. The internals are B's: the pure `wire` module, the engine with no generated imports, `Listing` with explicit pagination errors, the error union, `Extras` with the no-shadow check, `Included<T, I>`, and `where` nesting for filters.
- **Grafts from A.** Single-flight bearer refresh, `Listing.count()`, and the 404 hint for operations newer than the oldest version when the caller declares no version.
- **Grafts from C.** The version list derives from spec file names, and the requiredness rule separates spec-precision changes from server drift.
- **Grafts from the judge.** `removeUsersFromGroup` sends `user_ids[]` as repeated query params, where A and B sketched a JSON body. Single scalar bodies (`addWatcher`, `addUserToGroup`) have no envelope. User bodies carry top-level siblings (`send_information`, `pref`). The synthesis drops A's rule that a DELETE 404 on retry counts as success, because `removeUsersFromGroup` returns 404 legitimately. Streamed downloads have a defined lifecycle.
- **Rejected.** Per-version subpaths (C), hand-written per-resource facades (C), filter alias tables (C), positional arguments and a public `rm.call` (B), and inline uploads inside create and update (A). An explicit `attachments.upload` keeps the two-step semantics visible, and the SDK could add inline uploads later without breaking anything. The SDK added them later beside `attachments.upload`, as **Uploads** under Core behaviour describes.

## Tradeoffs accepted

- We accept over-optional fields. There are four today, such as `custom_field.is_for_all`, which 7.0 requires and 6.1 does not have. In exchange we get one type model, and a server upgrade changes no imports.
- We accept `rm.issues.get({ issue_id: 42 })` over `get(42)`. In exchange we get one calling convention, self-documenting arguments, and a method input that is identical to the tool input.
- We accept that request types are a superset too. A 6.1 client can send a 7.0-only field. We observed on real 6.1 and 7.0 servers that Redmine ignores unknown body attributes, and the request succeeds.
- We accept filter keys named by wire params (`assigned_to_id`), with no prettier aliases, because an alias table would be a list that someone syncs by hand.
- We accept that the SDK does no name-to-id resolution, such as `"In Progress"` to 7. That job belongs in the toolkit, over cached lookups.
- We accept that POST, PUT, and PATCH never retry automatically after a timeout, a network error, or a 502, 503, or 504. Redmine has no idempotency key.
- We accept that `since` means "earliest vendored spec", which is 6.1, not the version that truly introduced the operation.

## Open questions

- Should Redmine 6.0 get a derived spec? Only if real 6.0 instances need it. 6.0 is legacy stable.
- Which runtime should validate responses? The options are none by default, or an opt-in Standard Schema hook. The question is deferred.
