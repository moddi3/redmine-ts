# @redmine-ts/sdk

A typed TypeScript client for the [Redmine](https://www.redmine.org) REST API, for Redmine 6.1 and 7.0. It has no runtime dependencies and talks to the server through the platform `fetch`. Its types and operations are generated from the community [Redmine OpenAPI spec](https://github.com/d-yoshi/redmine-openapi).

Use it to script a Redmine instance, sync it with another system, or build tools and agents on top of it. It handles the parts of the Redmine API that hand-rolled clients usually get wrong: base URLs under a subpath, empty `PUT` and `DELETE` responses, localized `422` errors, offsets that drift while paging, two-step uploads, and impersonation.

## Install

```sh
npm install @redmine-ts/sdk
```

The package is ESM only. It runs on Node 22 or later, Bun, Deno, and in browsers behind a proxy. See [Runtime support](#runtime-support).

## Quickstart

```ts
import { createRedmine } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

const issue = await rm.issues.get({ issue_id: 42, include: ["journals"] });
console.log(issue.subject, `${issue.journals.length} journal entries`);

for await (const open of rm.issues.list({
  where: {
    project_id: "web",
    status_id: "open",
    assigned_to_id: "me",
    updated_on: { gte: "2026-10-01" },
  },
  sort: "updated_on:desc",
})) {
  console.log(`#${open.id} ${open.subject}`);
}
```

`createRedmine` validates the config and sends nothing. The client keeps the `/redmine` subpath of `baseUrl` in every request URL. It sends the API key only in the `X-Redmine-API-Key` header, never in the URL. The other `auth` forms are `{ basic: { login, password } }` and `{ bearer }`, where `bearer` is a token string or an object with `token()` and an optional `refresh()`. After a 401, concurrent requests share one `refresh()` call, and each request is sent once more.

## Call an operation

Every operation is `rm.<namespace>.<verb>(input, options?)`. `input` is one flat object with snake_case keys, named as in the Redmine API. It holds path parameters, query parameters, and body fields side by side. The client puts each key where Redmine expects it and adds the JSON envelope. For example, `rm.issues.update({ issue_id: 42, notes: "Fixed" })` sends `PUT issues/42.json` with the body `{ "issue": { "notes": "Fixed" } }`.

The package exports a type for every input and every schema. Input types are named after the spec's operation id: `GetIssuesInput`, `GetIssuesWhere`, `GetIssueInclude`, `CreateIssueInput`, and so on. Schema types use the schema name: `Issue`, `Project`, `TimeEntry`.

### Filter lists with `where`

List operations take filters under `where`. The keys are Redmine's filter parameter names, and custom fields are `cf_<id>`. A value or an array of values means "equals". An object picks another operator:

```ts
import { createRedmine, type GetIssuesWhere } from "@redmine-ts/sdk";

const untriaged: GetIssuesWhere = {
  project_id: "web", // project_id=web
  status_id: "open", // status_id=o
  tracker_id: { not: 3 }, // tracker_id=!3
  assigned_to_id: { none: true }, // assigned_to_id=!*
  done_ratio: { between: [0, 50] }, // done_ratio=><0|50
  subject: { contains: "crash" }, // subject=~crash
  cf_12: ["S1", "S2"], // cf_12=S1|S2
  created_on: { raw: "<t-30" }, // created_on=<t-30, older than 30 days
};
```

The operators are `not`, `gte`, `lte`, `between`, `contains`, `not_contains`, `starts_with`, `ends_with`, `any`, and `none`. Each field accepts only the operators the spec documents for it, so `status_id: { contains: "x" }` does not compile. Redmine ignores an unknown filter and returns every row. To prevent that, the client throws `invalid_input` before any request when a key is unknown or an operator is undocumented. `{ raw }` sends its string as is, for relative dates and operators the object form does not cover.

Redmine's issue list returns only open issues when `status_id` is absent. Pass `status_id: "any"` to include closed ones.

### Narrow results with `include`

`include` asks Redmine to embed related data. The included properties become required in the result type:

```ts
const issue = await rm.issues.get({ issue_id: 42, include: ["journals"] });
console.log(issue.subject, `${issue.journals.length} journal entries`);
```

Without `include: ["journals"]`, `issue.journals` is possibly `undefined` and the second line does not compile. Redmine omits some included keys when they are empty, such as `relations` and `children`. Those stay optional.

## Declare the server version

Redmine does not report its version over the API. You can declare it with `version`, and it is optional:

- Without `version`, the client offers every operation it knows and sends every call. If an operation is newer than the server, Redmine answers 404, and the error's `hint` names the likely cause.
- With a literal such as `version: "6.1"`, calling an operation added after 6.1 does not compile. At runtime the client refuses it with `unsupported_version` before any request.
- With a version read from config, `parseRedmineVersion` turns `"7.0.1"` into `"7.0"` and throws `invalid_input` for an unsupported version. The client type then offers every operation, and the runtime refusal still applies.

```ts
import { createRedmine, parseRedmineVersion, RedmineError } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: process.env.REDMINE_URL!,
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  version: parseRedmineVersion(process.env.REDMINE_VERSION ?? "7.0"),
});

try {
  await rm.groups.removeUsers({ group_id: 3, user_ids: [7, 9] });
} catch (error) {
  if (!RedmineError.is(error, "unsupported_version")) throw error;
  for (const user_id of [7, 9]) await rm.groups.removeUser({ group_id: 3, user_id });
}

const legacy = createRedmine({
  baseUrl: "https://legacy-tracker.example.com",
  auth: { apiKey: process.env.LEGACY_API_KEY! },
  version: "6.1",
});

// @ts-expect-error removeUsers exists since Redmine 7.0; this client declared 6.1
await legacy.groups.removeUsers({ group_id: 3, user_ids: [7, 9] });
```

There is one entrypoint for all supported versions, not `@redmine-ts/sdk/6.1` and `@redmine-ts/sdk/7.0`. From 6.1 to 7.0 the spec added one operation and four properties, so per-version modules would duplicate every type to express that difference, and every server upgrade would change your imports. A property that only newer servers return is optional and tagged `@since` in its JSDoc. The measurements behind this choice are in [docs/architecture.md](https://github.com/moddi3/redmine-ts/blob/main/docs/architecture.md).

## Handle errors

Every failure is a `RedmineError`. `error.data` is a union keyed by `kind`, and `RedmineError.is(error, kind)` narrows it:

```ts
try {
  await rm.issues.update({ issue_id: 42, subject: "" });
} catch (error) {
  if (RedmineError.is(error, "validation")) {
    console.error(error.data.messages.join("\n"));
  } else if (RedmineError.is(error, "not_found")) {
    console.error(`Issue 42 is gone or hidden from this user (request ${error.request_id})`);
  } else {
    throw error;
  }
}
```

A stale edit is a `conflict`. Pass the `version` you read when you update a wiki page. If someone saved in between, the update fails and the page keeps the other edit:

```ts
try {
  await rm.wiki.update({
    project_id: "web",
    wiki_page_title: "Runbook",
    text: "Restart the worker first.",
    version: 7,
  });
} catch (error) {
  if (!RedmineError.is(error, "conflict")) throw error;
  const latest = await rm.wiki.get({ project_id: "web", wiki_page_title: "Runbook" });
  console.error(`Someone saved version ${latest.version} first, merge your change into it`);
}
```

| `kind`                   | Cause                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `validation`             | 422. `data.messages` are in the API user's language. Show them, and do not match on them.                                        |
| `conflict`               | A stale edit. 409 for a wiki `version`, or a 422 with no messages when the request carried `lock_version`. Re-read and merge.    |
| `unauthorized`           | 401.                                                                                                                             |
| `forbidden`              | 403. A disabled REST API also answers 403.                                                                                       |
| `not_found`              | 404. `data.hint` explains a likely cause when the client knows one.                                                              |
| `switch_user_rejected`   | `data.reason` is `"not_admin"`: the key is not an admin's, so nothing was sent. See [Act as another user](#act-as-another-user). |
| `switch_user_rejected`   | `data.reason` is `"rejected_by_server"`: Redmine answered 412 because the login is unknown or inactive.                          |
| `not_acceptable`         | 406.                                                                                                                             |
| `http`                   | Any other status. `data.body` holds up to 2 KiB of the response.                                                                 |
| `protocol`               | The response does not match the operation, such as a body that is not JSON or a page that repeats. `data.hint` names the cause.  |
| `network`                | `fetch` threw.                                                                                                                   |
| `timeout`                | An attempt ran longer than `timeoutMs`.                                                                                          |
| `aborted`                | Your `signal` aborted the call.                                                                                                  |
| `unsupported_version`    | The declared `version` lacks the operation. Nothing was sent.                                                                    |
| `invalid_input`          | Bad config, an unknown filter, or conflicting paging options. Nothing was sent.                                                  |
| `transition_not_allowed` | `issues.transition` asked for a status the workflow does not allow.                                                              |

An issue carries a `lock_version` that Redmine checks, but the API never returns it, so most callers never send one. If you pass it through `rm.request`, a stale value is a `conflict` with `data.status` 422. Any other 422 with no messages stays `validation`.

Errors and `onEvent` events never contain credentials. `JSON.stringify(error)` gives `name`, `message`, `op`, `request_id`, and the `data` fields, and leaves out `cause`.

## Paginate

`list` returns a `Listing`. Creating one sends nothing, and it is not a promise. Iterate it, or call one of its methods:

```ts
const open = rm.issues.list({ where: { project_id: "web", status_id: "open" } });
console.log(`${await open.count()} open issues`);

const first = await open.page({ limit: 25 });
console.log(`showing ${first.items.length} of ${first.total_count}`);

const statuses = await rm.issueStatuses.list().all();
console.log(statuses.map((status) => status.name));

const recent = await rm.issues
  .list({ where: { updated_on: { gte: "2026-10-01" } }, sort: "updated_on:desc" })
  .all({ max: 500 });
console.log(`${recent.length} issues updated this month`);

for await (const issue of rm.issues.list({ paging: "keyset", pageSize: 100 })) {
  console.log(issue.id, issue.updated_on);
}

for await (const page of rm.timeEntries.list({ from: "2026-10-01", to: "2026-10-31" }).pages()) {
  console.log(`offset ${page.offset}: ${page.items.length} entries`);
}
```

- `for await` walks every page. `pageSize` sets the items per request, 100 by default, which is Redmine's default maximum.
- `page({ offset, limit })` fetches one page. Its `total_count` is `undefined` for lists Redmine does not page, such as `issueStatuses.list()`.
- `count()` sends one request with `limit=1` and returns `total_count`.
- `all({ max })` collects every item into an array. With more than `max` items it throws `protocol` with reason `page_cap` instead of returning a truncated list.
- `pages()` yields whole pages.
- `paging: "keyset"` on `issues.list` walks by ascending id, so issues created or deleted during the walk do not shift the pages. It cannot be combined with `sort`.

When the server ignores `offset` or repeats a page, the walk stops with a `protocol` error instead of looping or skipping items.

## Create, update, and attach files

`create` returns the new record. `update` returns nothing, because Redmine answers it with an empty body. `notes` on an issue update adds a journal entry. Redmine uploads take two steps. `attachments.upload` sends the bytes and returns a reference, and `uploads` on `issues.create`, `issues.update`, `news.create`, `news.update`, or `wiki.update` attaches it:

```ts
const created = await rm.issues.create({
  project_id: "web",
  tracker_id: 1,
  subject: "Checkout fails on Safari 19",
  description: "The pay button does nothing after the address step.",
});

await rm.issues.update({
  issue_id: created.id,
  priority_id: 4,
  notes: "Reproduced on 19.1, raising the priority.",
});

const upload = await rm.attachments.upload({
  file: await readFile("trace.zip"),
  filename: "trace.zip",
  content_type: "application/zip",
});
await rm.issues.update({ issue_id: created.id, notes: "Trace attached.", uploads: [upload] });
```

`file` takes a `Blob`, `Uint8Array`, `ArrayBuffer`, or `ReadableStream`. The client never retries a `ReadableStream` upload, because the stream can be read only once.

```ts
const issue = await rm.issues.get({ issue_id: created.id, include: ["attachments"] });
for (const attachment of issue.attachments) {
  const file = await rm.attachments.download(attachment);
  await writeFile(file.filename, await file.bytes());
}
```

`download` takes any object with `id` and `filename` and builds the URL from `baseUrl`. It ignores the attachment's `content_url`, which can name another host behind a proxy and would receive your API key. The result has `filename`, `content_type`, `size`, a `body` stream that you read once, and `bytes()`. `attachments.thumbnail` works the same way.

## Act as another user

With an admin API key, Redmine runs a request as another user when it carries `X-Redmine-Switch-User`. Pass `as` for one call, or derive a client with `with`:

```ts
await rm.timeEntries.create(
  { issue_id: 42, hours: 1.5, activity_id: 9, comments: "Triage" },
  { as: "jsmith" },
);

const asJsmith = rm.with({ as: "jsmith" });
try {
  await asJsmith.issues.update({ issue_id: 42, notes: "Picked up by jsmith." });
} catch (error) {
  if (!RedmineError.is(error, "switch_user_rejected")) throw error;
  console.error(
    error.data.reason === "not_admin"
      ? "This API key does not belong to an admin, so it cannot act as another user"
      : `Cannot act as ${error.data.login}: no such active user`,
  );
}
```

Only an admin key can switch users. Redmine ignores the header on a non-admin key and runs the request as the key's own user, with no error, so a write would be saved under the wrong author. The client guards against this. Before the first request that carries `as`, it sends `GET users/current.json` without `as` and reads `admin` from the answer. If the key is not an admin's, the call fails with `switch_user_rejected` and `data.reason` `"not_admin"`, and nothing impersonated is sent.

That check is one extra request per client. Clients derived through `with` share it, and calls that start at the same time wait for the same check. The answer is kept for the life of the client, so a key that changes role later needs a new client. A check that fails, such as a 401 or a network error, throws that error and is repeated on the next call. `onEvent` reports it as a `getCurrentUser` request. A login that Redmine does not know fails with `"rejected_by_server"`.

A derived client shares the parent's `maxConcurrent` limit. `with` accepts any call option, so `rm.with({ timeoutMs: 5000 })` works too.

## Retries, timeouts, and concurrency

| Option           | Default | Meaning                                                               |
| ---------------- | ------- | --------------------------------------------------------------------- |
| `timeoutMs`      | 30000   | Time limit for each attempt.                                          |
| `maxConcurrent`  | 4       | Requests in flight per client, shared with clients derived by `with`. |
| `retry.attempts` | 2       | Extra attempts after the first.                                       |
| `retry.baseMs`   | 250     | Base of the exponential backoff with full jitter.                     |
| `retry.maxMs`    | 5000    | Cap for one backoff delay and for `Retry-After`.                      |

The client retries a 429 for every method. It retries 502, 503, 504, network errors, and timeouts only for `GET` and `DELETE`. After those failures a `POST`, `PUT`, or `PATCH` may already have reached Redmine, which has no idempotency key, so a replayed `PUT` with `notes` would add the journal entry twice. `retry: false` turns retries off.

```ts
const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  timeoutMs: 10_000,
  maxConcurrent: 8,
  retry: { attempts: 4, maxMs: 10_000 },
  onEvent: (event) => {
    if (event.type === "retry") console.warn(`${event.op}: retry in ${event.delay_ms} ms`);
  },
});

const users = await rm.users
  .list({ where: { status: 1 } }, { signal: AbortSignal.timeout(60_000), retry: false })
  .all();
```

Every method takes call options as its second argument: `signal`, `timeoutMs`, `retry`, and `as`. `onEvent` receives `request`, `response`, `retry`, and `error` events.

## Call an endpoint the spec does not cover

`rm.request` sends an untyped request with the same auth, retries, timeouts, and errors as typed calls. Use it for plugin endpoints. `path` is relative to `baseUrl`, without a leading slash. The result is the parsed JSON as `unknown`, or `undefined` for an empty body.

`body` takes any JSON value: an object, array, string, number, boolean, or `null`. It is sent as it is, with no envelope. A function, symbol, bigint, or non-finite number fails with `invalid_input`, and so does a body on `GET`. Leave `body` out to send none. The body and `query` are separate, so both can use the same key.

An array in `query` goes out as `k[]=a&k[]=b` by default. Set `arrayFormat` to `"comma"` for `k=a,b` or `"repeat"` for `k=a&k=b`. Redmine itself reads the first two. With a repeated key it keeps only the last value, so use `"repeat"` only for a plugin that expects it.

```ts
interface ChecklistItem {
  id: number;
  subject: string;
  is_done: boolean;
}

const { checklists } = (await rm.request({
  method: "GET",
  path: "issues/42/checklists.json",
})) as { checklists: ChecklistItem[] };

await rm.request({
  method: "POST",
  path: "issues/42/checklists.json",
  body: { checklist: { subject: "Update the changelog", is_done: false } },
});

await rm.request({
  method: "PUT",
  path: "issues/42/checklists/order.json",
  body: [3, 1, 2],
});

const { boards } = (await rm.request({
  method: "GET",
  path: "agile_boards.json",
  query: { project_ids: [1, 2], archived: false },
  arrayFormat: "repeat",
})) as { boards: unknown[] };

console.log(`${boards.length} boards`);
```

## Bring your own fetch

The `fetch` option replaces `globalThis.fetch` for every request the client sends. Use it to add gateway headers, route through a proxy, or test your code without a server:

```ts
const throughGateway: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("X-Gateway-Token", process.env.GATEWAY_TOKEN!);
  return fetch(input, { ...init, headers });
};
```

```ts
const sent: { method: string; url: string }[] = [];
const fakeRedmine: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  sent.push({ method: request.method, url: request.url });
  return Response.json({ issue: { id: 42, subject: "Stubbed issue" } });
};

const test = createRedmine({ baseUrl: "https://redmine.test", fetch: fakeRedmine });
const issue = await test.issues.get({ issue_id: 42 });
// sent: [{ method: "GET", url: "https://redmine.test/issues/42.json" }]
```

To use an HTTP proxy in Node, pass the `fetch` from [undici](https://github.com/nodejs/undici) with a `ProxyAgent` dispatcher.

## Runtime support

- Node 22 or later, Bun, and Deno. The client uses only web platform APIs, such as `fetch`, `URL`, `AbortSignal.any`, and web streams.
- Browsers through a same-origin proxy. Redmine sends no CORS headers, and an API key in a browser is readable by anyone who opens the developer tools. Point `baseUrl` at a proxy on your origin that adds the key on the server.
- The package has no `node:` imports and no dependencies. It is ESM only, so load it with `import`, not `require`.

## Namespaces

Methods marked 7.0+ exist since Redmine 7.0. A client declared as `version: "6.1"` does not offer them.

| Namespace         | Methods                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `issues`          | `list`, `create`, `get`, `update`, `delete`, `addWatcher`, `removeWatcher`, `transition`   |
| `projects`        | `list`, `create`, `get`, `update`, `delete`, `archive`, `unarchive`, `close`, `reopen`     |
| `memberships`     | `list`, `create`, `get`, `update`, `delete`                                                |
| `users`           | `list`, `create`, `get`, `update`, `delete`, `current`                                     |
| `timeEntries`     | `list`, `create`, `get`, `update`, `delete`                                                |
| `news`            | `list`, `get`, `update`, `delete`, `listByProject`, `create`                               |
| `relations`       | `list`, `create`, `get`, `delete`                                                          |
| `versions`        | `list`, `create`, `get`, `update`, `delete`                                                |
| `wiki`            | `list`, `get`, `update`, `delete`, `getVersion`                                            |
| `queries`         | `list`                                                                                     |
| `attachments`     | `get`, `update`, `delete`, `upload`, `download`, `thumbnail`                               |
| `issueStatuses`   | `list`                                                                                     |
| `trackers`        | `list`                                                                                     |
| `issueCategories` | `list`, `create`, `get`, `update`, `delete`                                                |
| `enumerations`    | `listIssuePriorities`, `listTimeEntryActivities`, `listDocumentCategories`                 |
| `roles`           | `list`, `get`                                                                              |
| `groups`          | `list`, `create`, `get`, `update`, `delete`, `addUser`, `removeUsers` (7.0+), `removeUser` |
| `customFields`    | `list`                                                                                     |
| `search`          | `list`, `listByProject`                                                                    |
| `files`           | `list`, `create`                                                                           |
| `myAccount`       | `get`, `update`                                                                            |
| `journals`        | `update`                                                                                   |
| `repositories`    | `addRelatedIssue`, `removeRelatedIssue`                                                    |

Some Redmine endpoints have no method because another method does the same job. For example, `GET /projects/{id}/issues.json` is `issues.list({ where: { project_id } })`. `rm.request` reaches them if you need them.

## Acknowledgements

The types and operations in this package are generated from [redmine-openapi](https://github.com/d-yoshi/redmine-openapi) by [d-yoshi](https://github.com/d-yoshi), an unofficial OpenAPI 3.0.3 description of the Redmine REST API released under the MIT license. This release uses its tags `6.1.3-r1` and `7.0.1-r1`.

If a field or operation looks wrong, the cause is most likely in the spec. Please report it at [d-yoshi/redmine-openapi/issues](https://github.com/d-yoshi/redmine-openapi/issues), and open an issue at [moddi3/redmine-ts/issues](https://github.com/moddi3/redmine-ts/issues) so the SDK picks up the fix.

## License

MIT
