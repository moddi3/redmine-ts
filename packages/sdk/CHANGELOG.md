# @redmine-ts/sdk

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
