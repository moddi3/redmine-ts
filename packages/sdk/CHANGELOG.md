# @redmine-ts/sdk

## 0.9.0

### Minor Changes

- 0e5d3ca: Generate from the spec tags `6.1.3-r2` and `7.0.2-r2`. `groups.create` now requires `name`, which Redmine always required. Issue relations, changesets, attachment authors and child trackers are typed as always present. The issue date filters document UTC timestamps, and the `where` legend says that a lower bound on a time also matches the second before it.

## 0.8.0

### Minor Changes

- 11c4676: A bearer `token()` that throws or rejects now fails the call with the new error kind `credentials` instead of `network`, with the error as `cause`. The client no longer retries it, so retry inside `token()` if its source can fail briefly. A `switch` over `kind` that checks for every kind needs a `credentials` case.

## 0.7.2

### Patch Changes

- 53d8b12: The READMEs on npm are shorter and link to task guides on GitHub. The SDK README keeps the install steps, the requirements, the quickstart, and what the client catches. It links to guides for reading data, writing records, configuration, errors, and the reference. The MCP README keeps the quick start for Claude Code. It links to guides for each client, the shared server with OAuth, the tools, the settings, authentication, and embedding. Runtime behavior is unchanged.
- 815be14: The client now refuses a number that has no wire form with kind `invalid_input`, before anything is sent. A `NaN` or `Infinity` in a typed body went out as `null`, so `issues.update({ issue_id: 42, estimated_hours: NaN })` cleared the field. In a path parameter, a query value, or a `where` filter it went out as the word `NaN`. Redmine answered 404 for `issues/NaN.json` and read `limit=NaN&offset=NaN` as its defaults. A typed body also refuses a function, which was dropped, and a bigint or a circular object, which threw a raw `TypeError`. Typed and `rm.request` bodies refuse an `undefined` array item, which went out as `null`. `Listing.page()` refuses an `offset` that is not a whole number from 0 and a `limit` that is not a whole number from 1.

  A `BearerSource.token()` that never settles no longer holds the call and its concurrency slot. The wait for `token()` counts against `timeoutMs`, and the call's `signal` ends it without cancelling the token promise. A `token()` that throws or rejects fails the call as `network`, with the error as `cause`. Before, the raw error escaped. A caller that aborts while a shared `refresh()` runs stops waiting, and the refresh goes on for the other callers.

  `timeoutMs` takes a positive number up to 2147483647, on the client and per call, and anything else is `invalid_input`. Before, a per-call `NaN`, `Infinity`, `0`, or negative value timed out after about 1 ms, and so did `2 ** 31` at either level.

## 0.7.1

### Patch Changes

- 829396f: `access: "no-delete"` now also refuses the updates that make Redmine delete records, with kind `access_denied` before the update is sent: `journals.update` with blank `notes`, `issues.update` or `wiki.update` with `deleted_attachment_ids`, and `memberships.update` with `role_ids` that name none of the membership's current roles. Redmine drops the roles a key cannot manage, so a membership update with roles in `role_ids` first reads the membership with one `GET`. The check reads the request as it would be sent, so `rm.request` to those routes is refused too, with PUT or PATCH, `.json` or `.xml`, and fields in the query string. The error's new `data.deletes` says what Redmine would delete. A method refusal has no `deletes`, as before.

  The `journals.update` description now covers both behaviors. Redmine 6.1.0 to 6.1.3 and 7.0.0 delete a journal left with empty `notes` and no `details`. Later releases keep it, but `include=journals` leaves it out until it has notes again.

- da27f53: The `where` description of the issue, project and user lists now says that their timestamp filters, such as `updated_on`, also take a UTC time to the second, such as `2026-10-31T08:00:00Z`. Redmine then compares the time, not only the day.

## 0.7.0

### Minor Changes

- 948cfac: Call options take `onResponse`, which gets the status of each response the call receives, retries included. The last one is the response the call resolved with, so `rm.request` callers can tell a 201 or a 202 from a 200:

  ```ts
  let status = 0;
  const body = await rm.request(
    { method: "POST", path: "issues.json", body: { issue: { project_id: 1, subject: "New" } } },
    { onResponse: (response) => (status = response.status) },
  );
  ```

- 43d3da7: `where` refuses filters Redmine drops without an error, on every request. `category_id` and `subproject_id`, and `issue.category_id` on time entries, need one `project_id`, and `query_id` takes no filter but one `project_id`. Before, both went out in the short form and came back wider than asked.

  `status_id`'s `"open"`, `"closed"` and `"any"` stand alone. `{ not: "closed" }` now means open and `{ not: "open" }` closed. Before, they went out as `!closed` and `!open`, which Redmine reads as a status id, so every issue came back. A word in a list, such as `["open", 3]`, is `invalid_input`, where Redmine read it as open issues and dropped the 3.

  `contains` on `parent_id`, `child_id`, and `issue_id` and `issue.parent_id` on time entries takes the id as a number too.

  Filter descriptions in the catalog and the JSDoc use the `where` grammar: a summary, the value, and the forms the filter takes. Redmine's own syntax stays on the `raw` form. Every filter's description now names its value, such as `issue id` for the relation filters, `group id` and `role id`.

### Patch Changes

- 86e9cd4: An inline upload that passes a `ReadableStream` another call is sending at the same moment now gets `invalid_input` before it sends anything, as one made after that call does. It failed at `fetch` as `network` before. A call that fails before it sends its stream releases it, so a later call can upload it.

## 0.6.0

### Minor Changes

- 55df491: `Issue` and `IssueSummary` now type `project`, `tracker`, `status`, `priority` and `author` as required, and `id` as required in `parent` (#65). Redmine sends them on every issue that `issues.get`, `issues.list` and `issues.create` return. Under `strict`, `issue.project.name` now type-checks without `?.`, and so does `issue.parent.id` once `issue.parent` is checked. The redmine-openapi spec leaves these fields optional, so the generator corrects it until upstream does. The catalog's output schemas for these methods require the fields too.

  This can break the type check of code that builds an `Issue` or `IssueSummary` by hand, such as a mock or a test fixture. Such code must now set all five fields, and `id` in any `parent`.

## 0.5.0

### Minor Changes

- d49ab0f: `issues.get` returns `journals` and `changesets` oldest first, and `news.get` returns `comments` oldest first, for every API key. `rm.request` and clients from `rm.with` return the same order.

  Before, the order followed the **Display comments** setting of the key's user. Redmine builds each list oldest first and reverses all of it for a user who reads comments in reverse chronological order. The REST API does not send that setting, so the client reverses a list when its first entry is later than its last. Journals compare by `created_on`, then `id`. Changesets compare by `committed_on`, and two with the same time stay as sent, because the API sends no changeset id. Comments come in `id` order, because the API sends no comment date. That is the order they were posted in, and it differs from Redmine's order only for a comment whose date was set or changed in the database, such as by an import.

  To show newest first in a UI, reverse the list. To keep Redmine's order, pass `normalize: false`.

### Patch Changes

- d0dbb5b: `issues.list` and `timeEntries.list` now accept a `project_id` filter with a list of ids, `{ not }`, `"mine"`, `"bookmarks"` or a `raw` condition such as `1|2`. Before, Redmine answered 404 to each of them, because it reads `project_id` as the one project to scope the request to. The client now sends such a request in Redmine's long filter form (`f[]`, `op[...]`, `v[...][]`) with every other filter of the `where`. For issues, it adds the open-status filter that the short form starts from, so the results still leave out closed issues unless `status_id` says otherwise.

  - One id or one identifier goes out as before and still includes the issues of subprojects, and so does a list with one id. A list of two or more ids does not include them, the same as the project filter in Redmine's issue list. `{ not: id }` excludes only that project, not its subprojects.
  - A standard filter next to such a `project_id` reads its value the way Redmine reads the short form. A custom field there takes an object condition or a plain value. Its `raw`, or a plain value that starts with `<`, `>`, `!`, `*`, `~`, `^` or `$`, fails with `invalid_input`, because Redmine reads those by the field's format, which the client does not know.
  - `category_id` and `subproject_id`, and `issue.category_id` on time entries, fail with `invalid_input` next to such a `project_id`. Redmine offers them only inside one project and drops them from any other query, so the results would leave the filter out. `query_id` fails the same way, because Redmine runs a saved query without reading the long form's filters, `project_id` included.
  - An identifier in a list of two or more ids or under `{ not }` now fails with `invalid_input` before the request. Redmine compares those values with project ids and would match nothing.

- 5dc6521: The README names the spec tag this release is generated from, `7.0.2-r1`, instead of `7.0.1-r1`. It now opens with what the client catches before a request, and names Bun 1.4.4 as the version CI tests.

## 0.4.0

### Minor Changes

- ee5d737: `issues.create`, `issues.update`, `news.create`, `news.update` and `wiki.update` take files in `uploads`. The call uploads each `{ file, filename, content_type?, description? }` entry to `uploads.json`, one at a time in list order, then sends the record with a reference to each file. References from `attachments.upload` can sit in the same list, and `attachments.upload` is unchanged. Before the first request the client checks `access`, the declared version, each file entry and the record's input, so a refused call stores nothing.

  When such a call fails after those checks, `error.uploads` holds your entries with each file Redmine acknowledged replaced by its reference. Pass it back as `uploads` to retry without sending those files again. It stays out of `toJSON`, because a token lets other users attach the file. A `ReadableStream` that is locked, appears twice, or was already sent by an earlier upload is refused before anything is sent.

  `uploads` is now typed `UploadEntry[]`, and `InlineUpload` and `UploadEntry` are exported. `CatalogEntry.inlineUploads` names the input that takes files, and every catalog input schema is unchanged.

## 0.3.1

### Patch Changes

- bda4eaa: Vendor the Redmine OpenAPI spec 7.0.2-r1. `Issue.children` is now the recursive `IssueChild[]`, with `id` and `subject` required and nested `children`, which Redmine 6.1 and 7.0 both send. Descriptions in the types and the catalog pick up 7.0.2's notes on comma-separated id lists, the default assignee, and which children and memberships are visible.

## 0.3.0

### Minor Changes

- 9c54bb6: The client type follows `access`. With a literal `access: "read-only"`, the client has only the methods that send `GET`: reads, listings, `attachments.download` and `attachments.thumbnail`. `issues.transition`, `attachments.upload` and every other write are gone, and `rm.request` takes only `method: "GET"`. With `"no-delete"`, the methods that send `DELETE` are gone, and `rm.request` does not take `"DELETE"`. `rm.with()` keeps the access, and `Redmine` takes it as a second type parameter, as in `Redmine<"7.0", "read-only">`.

  Code that called a write on a literal read-only client, which failed at runtime with `access_denied`, no longer compiles. An access typed `Access`, such as one read from an environment variable, keeps every method. The runtime refusal is unchanged.

## 0.2.1

### Patch Changes

- 8a0e64e: Fix `issues.update({ issue_id, assigned_to_id: null })`, which Redmine silently ignored. The client now sends `""` for that field, which clears the assignee. Every other nullable field already cleared with `null`.

  Fix filters that took a list of ids but matched only the first one. `where: { issue_id: [4, 9] }` returned issue 4 alone, because Redmine splits `issue_id`, `parent_id`, `child_id`, `done_ratio`, the relation filters (`relates`, `blocks`, and the rest) and `issue.parent_id` on time entries on commas, not on `|`. The client now sends `4,9` for those filters, for `=` and `not` lists. Ranges and every other filter are unchanged.

## 0.2.0

### Minor Changes

- f79c38b: Add `access` to `createRedmine`. `"read-only"` sends only `GET` requests and `"no-delete"` refuses `DELETE`. Any other request fails with the new error kind `access_denied` before anything is sent, for every method, listing, `issues.transition`, `attachments.upload` and `rm.request`. The default, `"full"`, changes nothing.

  Add the `@redmine-ts/sdk/catalog` entrypoint for tool layers such as MCP servers. `catalog` has one entry per client method with its id, namespace and verb, title, description, docs link, HTTP method, safety class, versions, stability, a JSON Schema (draft 2020-12) of its input, and a JSON Schema of the item it returns. It is a separate entrypoint, so the main bundle does not grow.

## 0.1.0

### Minor Changes

- b390f92: First release. A typed, zero-dependency client for the Redmine REST API, for Redmine 6.1 and 7.0. Types and operations are generated from the community Redmine OpenAPI spec. It covers every resource in the spec, filters lists with typed operators, pages with `for await`, uploads and downloads attachments, impersonates users, and throws one `RedmineError` type with a `kind` for each failure.
