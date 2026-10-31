# Read data

This page covers getting a record, filtering lists, and walking pages. The examples use a client `rm` made as in the [quickstart](../../packages/sdk/README.md#quickstart). [Call shape](reference.md#call-shape) explains how every method takes its input.

## Get one record with related data

`include` asks Redmine to embed related data. The included properties become required in the result type:

```ts
const issue = await rm.issues.get({ issue_id: 42, include: ["journals"] });
console.log(issue.subject, `${issue.journals.length} journal entries`);
```

Without `include: ["journals"]`, `issue.journals` is possibly `undefined` and the second line does not compile. Redmine omits some included keys when they are empty, such as `relations` and `children`. Those stay optional.

### Journals come oldest first

The client returns an issue's `journals` and `changesets`, and a news item's `comments`, oldest first for every API key. Redmine sends these lists newest first when the key's user sets **Display comments** to **In reverse chronological order** in **My account**. The client's order does not follow that setting. The REST API does not send the setting, so the client reads the order from the list itself. It reverses a list whose first entry is later than its last, and puts news comments, which come without dates, in `id` order. To show newest first in a UI, reverse the list. To keep Redmine's order, pass `normalize: false` to `createRedmine`. That also turns off the client's other response fixes, such as `hours` sent as `"8/1"`.

```ts
const asSent = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  normalize: false,
});
const issue = await asSent.issues.get({ issue_id: 42, include: ["journals"] });
console.log(issue.journals.map((journal) => journal.id));
```

## Filter lists with `where`

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

The operators are `not`, `gte`, `lte`, `between`, `contains`, `not_contains`, `starts_with`, `ends_with`, `any`, and `none`. Each field accepts only the operators the spec documents for it, so `status_id: { contains: "x" }` does not compile. Redmine ignores an unknown filter and returns every row. To prevent that, the client throws `invalid_input` before any request when a key is unknown or an operator is undocumented. `{ raw }` sends its string as is, for relative dates and operators the object form does not cover, except next to a `project_id` other than one id, as below.

### Match one of several values

An array goes on the wire as `a|b`, which Redmine splits for most filters. A few id filters read only the first value and split it on commas: `issue_id`, `parent_id`, `child_id`, `done_ratio`, the relation filters (`relates`, `blocks`, and the rest), and `issue.parent_id` on time entries. For those the client sends `a,b`. The input is the same array either way, so this call returns both issues:

```ts
const pair = await rm.issues.list({ where: { issue_id: [4, 9], status_id: "any" } }).all();
console.log(pair.map((issue) => issue.id));
```

### Filter by several projects

Redmine reads `project_id` as the one project to scope the request to, and answers 404 to `project_id=1|2`. So when `project_id` is anything but one id or identifier, such as a list of two or more ids, `{ not }` or `"mine"`, the client sends the whole `where` in Redmine's long form, such as `f[]=project_id&op[project_id]==&v[project_id][]=1&v[project_id][]=2`. A standard filter there reads its value the way Redmine reads the short form. A custom field there takes an object condition or a plain value. Its `{ raw }`, or a plain value that starts with `<`, `>`, `!`, `*`, `~`, `^` or `$`, is `invalid_input`, because Redmine reads those by the field's format, which the client does not know.

The form also decides whether subprojects match. One id or identifier, alone or as a one-element list, includes the issues of subprojects. A list of two or more ids does not, and `{ not: id }` excludes only that project, not its subprojects. In a list of two or more or under `{ not }`, `project_id` takes ids, so an identifier there is `invalid_input`.

```ts
const twoProjects = await rm.issues.list({ where: { project_id: [1, 2] } }).count();
console.log(`${twoProjects} open issues in projects 1 and 2, not counting their subprojects`);
```

### Filters that need one project

Redmine drops some filters without an error and returns a wider list, so the client refuses them with `invalid_input` on every request. `category_id` and `subproject_id`, and `issue.category_id` on time entries, need one `project_id`, because Redmine offers them only inside one project. A `query_id` takes no other filter but one `project_id`, because Redmine runs the saved query's own filters.

### Include closed issues

Redmine's issue list returns only open issues when `status_id` is absent. Pass `status_id: "any"` to include closed ones. The words `"open"`, `"closed"` and `"any"` are Redmine's status operators, so each stands alone: `{ not: "closed" }` means open, and a word in a list with status ids is `invalid_input`.

```ts
const allStatuses = await rm.issues
  .list({ where: { project_id: "web", status_id: "any" } })
  .count();
console.log(`${allStatuses} issues in web, open and closed`);
```

### Search the issue tree

On an id filter that takes `contains`, the value is an id and the match is a search of the issue tree. `parent_id: { contains: 42 }` returns every issue below #42, `child_id: { contains: 42 }` every issue above it, and `issue_id: { contains: 42 }` on time entries the entries of #42 and its subtasks.

```ts
const belowEpic = await rm.issues.list({ where: { parent_id: { contains: 42 } } }).all();
console.log(`${belowEpic.length} open issues below #42`);
```

## Walk pages

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
