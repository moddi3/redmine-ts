# @redmine-ts/sdk

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
