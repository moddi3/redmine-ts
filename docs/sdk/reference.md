# SDK reference

This page lists the shape of a call, the client's namespaces, the exported types, raw requests, and the catalog for tool layers.

## Call shape

Every operation is `rm.<namespace>.<verb>(input, options?)`. `input` is one flat object with snake_case keys, named as in the Redmine API. It holds path parameters, query parameters, and body fields side by side. The client puts each key where Redmine expects it and adds the JSON envelope. For example, `rm.issues.update({ issue_id: 42, notes: "Fixed" })` sends `PUT issues/42.json` with the body `{ "issue": { "notes": "Fixed" } }`.

A number in `input` must be finite. JSON would send `NaN` or `Infinity` as `null`, and `null` clears most fields. A URL would carry the word `NaN`. So the client throws `invalid_input` for a non-finite number in a path, query, body, or `where` value, before it sends anything. An `undefined` item in a body array fails the same way.

## Namespaces

Methods marked 7.0+ need Redmine 7.0 or later. A client declared with `version: "6.1"` does not offer them.

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

Some Redmine endpoints have no method because another method does the same job. For example, `GET /projects/{id}/issues.json` is `issues.list({ where: { project_id } })`. To call one of those endpoints anyway, use `rm.request`.

## Types

The package exports a type for every input and every schema. Input types take their names from the spec's operation ids, such as `GetIssuesInput`, `GetIssuesWhere`, `GetIssueInclude`, and `CreateIssueInput`. Schema types use the schema name, such as `Issue`, `Project`, and `TimeEntry`.

## Call an endpoint the spec does not cover

`rm.request` sends an untyped request with the same auth, retries, timeouts, and errors as typed calls. Use it for plugin endpoints. `path` is relative to `baseUrl`, without a leading slash. The result is the parsed JSON as `unknown`, or `undefined` for an empty body.

`body` takes any JSON value: an object, array, string, number, boolean, or `null`. The client sends it as is, with no envelope. A function, symbol, bigint, non-finite number, or `undefined` array item fails with `invalid_input`, and so does a body on `GET`. A non-finite number in `query` fails the same way. Leave `body` out to send none. The body and `query` are separate, so both can use the same key.

By default, the client sends an array in `query` as `k[]=a&k[]=b`. Set `arrayFormat` to `"comma"` for `k=a,b` or `"repeat"` for `k=a&k=b`. Redmine itself reads the first two. With a repeated key, Redmine keeps only the last value, so use `"repeat"` only for a plugin that expects it.

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

## Catalog for tool layers

`@redmine-ts/sdk/catalog` describes every client method as data, for tool layers such as MCP servers and agent toolkits that turn methods into tools. It is a separate entrypoint, so an app that only calls the client never loads its schemas.

```ts
import { catalog } from "@redmine-ts/sdk/catalog";

const readTools = catalog
  .filter((entry) => entry.method === "GET")
  .map((entry) => ({
    name: `${entry.namespace}_${entry.verb}`,
    description: [entry.title, entry.description].filter(Boolean).join("\n\n"),
    inputSchema: entry.inputSchema,
    annotations: { readOnlyHint: true },
  }));
console.log(`${readTools.length} read tools`);

const listIssues = catalog.find((entry) => entry.id === "getIssues");
console.log(listIssues?.output.kind); // "list": output.schema describes one issue
```

`catalog` has one entry per method: the generated namespace methods and the hand-written `issues.transition`, `attachments.upload`, `attachments.download`, and `attachments.thumbnail`. Each entry has:

- `id`, the spec's operation id, or a stable id for a hand-written method. `namespace` and `verb` name the method as `rm[namespace][verb](input)`.
- `title`, `description`, and `docsUrl`, from the spec.
- `method`, `safety`, `since`, `until`, and `stability`. `method` is what `access` checks.
- `inputSchema`, a JSON Schema (draft 2020-12) of the method's input object. It refuses unknown keys and requires what the TypeScript input requires. For a list, `where` accepts each filter in the forms the client compiles, with only the operators the spec documents for that filter. It also accepts `cf_<id>` keys where custom field filters apply.
- `inlineUploads`, the input key whose entries may also carry file bytes, such as `"uploads"` on `issues.create`, or `null`. `inputSchema` describes only the JSON form of those entries, `{ token, filename, content_type, description }`, so a tool layer that accepts file content adds its own form for that key.
- `output`, with `kind` `"item"`, `"list"`, `"empty"`, or `"binary"`. For an item or a list, `schema` describes one returned record. Output schemas allow properties they do not name and require only what the types require. The contract tests validate real responses from Redmine 6.1 and 7.0 against them. `optional: true` on an item means Redmine can answer with no body, as `wiki.update` does for an existing page.

The schemas carry no `$ref`, so each schema is complete on its own. The `file` input of `attachments.upload` has no JSON type, because JSON cannot carry bytes. The tool layer decides how to accept file bytes, for example as base64 text.
