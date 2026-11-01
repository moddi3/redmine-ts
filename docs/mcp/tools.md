# MCP tools

The server lists seven hand-written workflow tools for the common jobs, or eight with a files directory, and one generated tool for each SDK method. This page covers which tools a server lists, how to filter and page a list, and what a tool returns. [Workflow tools in detail](workflow-tools.md) covers how `issue_context`, `people_find`, and the file tools work.

## Workflow tools

Seven hand-written tools cover what an agent does most, in fewer calls than the generated tools need. `tools/list` returns them first. They share the generated tools' validation, error results, and warning on user-written text.

| Tool                                                                  | Kind  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`issue_context`](workflow-tools.md#read-an-issue-with-issue_context) | read  | One issue with everything an agent needs to work on it: the full description, the statuses it can move to, relations read from this issue (`{relation: "blocked by", issue_id: 12}`), subtasks with their status, attachment metadata, watchers, and the newest journals as readable changes. It returns as many journals as fit in the [result budget](#result-size), and a cursor to the older ones.                                                       |
| `reference_data`                                                      | read  | Statuses, trackers, priorities, time entry activities, the current user, and custom field definitions for an admin key. With `project_id`, it adds the project's trackers, categories, versions, members with roles, issue custom fields, and modules.                                                                                                                                                                                                       |
| [`people_find`](workflow-tools.md#find-people)                        | read  | Finds people by name among a project's members, or on an issue and in its project. Returns each person's id, name, and login for an `@login` mention. Works with any key, unlike `users_list`.                                                                                                                                                                                                                                                               |
| `issues_transition`                                                   | write | Changes the status by id or by name, after it checks the workflow. A refusal lists the allowed statuses by id and name. With `notes`, it returns the journal that holds the notes, as `issues_update` does.                                                                                                                                                                                                                                                  |
| [`attachments_upload`](workflow-tools.md#attach-and-save-files)       | write | Uploads a file from `content_text`, `content_base64`, or, with a files directory, `path`. Returns the reference to pass in `uploads` of `issues_create`, `issues_update`, `news_create`, `news_update`, or `wiki_update`. The file can be at most 5 MB, Redmine's default limit. Over HTTP, a `content_text` near 5 MB can exceed the request limit once JSON escapes its line breaks, quotes, and control characters. Send such a file as `content_base64`. |
| `attachments_download`                                                | read  | Returns an image up to 1 MB as image content, a text file up to 100 KB as text, or a thumbnail. Any other file returns its metadata and a note.                                                                                                                                                                                                                                                                                                              |
| `raw_request`                                                         | read  | Sends one request to any REST path, for plugin endpoints and fields the typed tools miss. Every mode lists it. The access mode decides which methods it sends, and its hints and description say so.                                                                                                                                                                                                                                                         |

## Generated tools

Each tool takes its name from the SDK method it calls, as `<resource>_<verb>` in snake case. `rm.issues.list` becomes `issues_list`, `rm.timeEntries.create` becomes `time_entries_create`, and `rm.issues.addWatcher` becomes `issues_add_watcher`. `tools/list` returns them in the SDK's catalog order, so the order is the same on every start.

Every tool has a `title` and all four hints, set from its HTTP method:

| Method           | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| ---------------- | -------------- | ----------------- | ---------------- | --------------- |
| `GET`            | `true`         | `false`           | `true`           | `false`         |
| `POST`           | `false`        | `false`           | `false`          | `false`         |
| `PUT` or `PATCH` | `false`        | `true`            | `true`           | `false`         |
| `DELETE`         | `false`        | `true`            | `true`           | `false`         |

An update counts as destructive because it overwrites data that exists. `openWorldHint` is `false` because the tools reach only your Redmine instance.

Inputs take ids, not names. `reference_data` maps the common names to ids in one call. A tool's description also names where to find each id it takes. For `user_id`, the description names `people_find`, which finds only a project's members and an issue's people. Where `people_find` cannot find the user, the description names `users_list`. That is the case on the tools that need an admin key, and on `memberships_create`, which adds someone who is not a member yet.

## Which tools the server lists

Three settings decide which tools `tools/list` returns: the access mode, the declared Redmine version, and whether the key belongs to an admin. A files directory adds `attachments_save`. Over OAuth, a request uses the stricter of the server's mode and the mode of the token's [scope](authentication.md#scopes-and-access-modes).

The counts on this page are for an admin's key, Redmine 7.0 or no declared version, and no files directory.

### Access modes

The access mode decides which tools the server lists and which requests the SDK sends. When you set the mode in more than one way, such as `REDMINE_MCP_ACCESS=no-delete` and `--read-only`, the strictest one wins.

| Mode        | Lists                                                   | Sends                          |
| ----------- | ------------------------------------------------------- | ------------------------------ |
| `full`      | All 93 tools.                                           | Every method.                  |
| `no-delete` | 77 tools. The `DELETE` tools are gone.                  | `GET`, `POST`, `PUT`, `PATCH`. |
| `read-only` | 44 tools, the reads and `raw_request` limited to `GET`. | `GET` only.                    |

With `REDMINE_MCP_FILES_DIR` set, each mode lists one more tool, [`attachments_save`](workflow-tools.md#attach-and-save-files).

A client can still call a tool the mode hides, for example from a tool list it cached earlier. The server then answers with an error that names the mode, and the SDK sends nothing to Redmine.

`no-delete` also refuses an update that would make Redmine delete records:

- Blank `notes` on `journals_update`.
- `deleted_attachment_ids` on `issues_update` or `wiki_update`.
- `memberships_update` with `role_ids` that name none of the membership's current roles.

To check `role_ids`, the server reads the membership first. The error says what Redmine would delete, and for a membership it says how to swap roles in two updates. The SDK checks the request it is about to send, so it refuses a `raw_request` to those routes too. The SDK does not know a plugin endpoint that deletes on a `POST`, `PUT`, or `PATCH`, so `raw_request` sends that request.

The mode limits what the server does, not what the API key can do. [What limits the agent](security.md#what-limits-the-agent) explains how the mode and Redmine's permissions add up.

### Version handling

Redmine does not report its version over the API, so you declare it with `REDMINE_VERSION`. With a declared version, the server hides tools the version lacks. On `6.1`, the server hides `groups_remove_users`, which Redmine added in 7.0, so a 6.1 server lists 92 tools in `full` mode. A call to a hidden tool returns an error that names the version the tool needs.

Without `REDMINE_VERSION`, the server lists every tool. A tool newer than your Redmine then fails with a 404, and the error says that your Redmine may be older than the operation.

### Tools that need an admin key

In Redmine 6.1 and 7.0, the actions behind these tools run `require_admin` first, so Redmine answers 403 to every key but an admin's: `users_list`, `users_create`, `users_update`, `users_delete`, `groups_list`, `groups_create`, `groups_update`, `groups_delete`, `groups_add_user`, `groups_remove_user`, `groups_remove_users`, `custom_fields_list`, `projects_archive`, and `projects_unarchive`. Their descriptions say "Needs an admin key". A 403 error from one of them says that the tool needs an admin key or that the REST API is disabled. The error names both causes because Redmine answers 403 to every key, an admin's too, when the REST API is disabled. When another tool works without an admin key, the description and the error both name it:

- `users_list`: `people_find`, or `memberships_list` and then `users_get`.
- `users_update`: `my_account_update`, for the key's own account.
- `groups_list`: `memberships_list` for the groups in a project, and `groups_get` for one group.
- `custom_fields_list`: `reference_data` with `project_id`, for the project's issue custom fields.

When the key's user is not an admin, the server leaves these tools out of `tools/list`, and leaves the sentence about them out of its instructions. A hidden tool still answers a call, with Redmine's 403. The server learns whose key it holds in these ways:

- Over stdio, it asks Redmine with one `GET /users/current.json` when it starts.
- Over HTTP with the key header, it asks once for each `initialize`, `server/discover`, and `tools/list` request. A tool call adds no request.
- An API key sign-in through OAuth records the answer of the key check in the grant. A refresh keeps it, so a change of admin rights shows after the next sign-in.
- After a sign-in through a Redmine OAuth application, the server never lists them, because Redmine answers 403 to them even for an admin. The server never asks Redmine for the `admin` scope. Use an admin's key in the header for that work.

When Redmine does not answer or refuses the key, the server lists every tool. It also lists every tool for a token issued before version 0.6.

## Filter a list

List tools filter with `where`, keyed by Redmine's filter names, such as `status_id`, `assigned_to_id`, or `cf_12`. A value or an array of values means equals:

```json
{ "where": { "status_id": "open", "assigned_to_id": "me", "tracker_id": [1, 2] } }
```

An object with one operator picks another comparison: `{ "not": 3 }`, `{ "gte": "2026-10-01" }`, `{ "lte": 5 }`, `{ "between": [1, 10] }`, `{ "contains": "crash" }`, `{ "any": true }`, or `{ "none": true }`. Each filter accepts only the operators Redmine documents for it. `{ "raw": "<t-30" }` sends Redmine's own syntax unchanged, for relative dates and other rare cases. Before it sends any request, the tool refuses an unknown filter or an operator the filter does not take, and the error lists the forms the filter accepts. The tool also refuses filters that Redmine would drop without an error: `category_id` without one `project_id`, and another filter next to `query_id`. A status word such as `"closed"` stands alone, and `{ "not": "closed" }` means open.

In `tools/list`, `where` has one loose condition for every filter, and its description lists the filters in a table. Each line gives a filter, its value, and what it filters, under the operators it takes:

```text
Takes not, any, none:
assigned_to_id | id, `me` for current user | assignee
Takes gte, lte, between, any, none:
created_on | date | creation date
```

A schema for each filter made the input schema of `issues_list` 48K characters. With the table, it is under 5,000 bytes. The server still checks each call against the forms of each filter.

## Page through a list

A list tool returns one page:

```json
{ "items": [], "total_count": 312, "offset": 0, "limit": 25, "next_offset": 25 }
```

`limit` is 25 by default and at most 100. To read the next page, call the tool again with `offset` set to `next_offset`. `next_offset` is `null` on the last page. A list that Redmine returns whole, such as `issue_statuses_list`, comes in pages the same way.

A page also stops at the [result budget](#result-size). When the next item would take the page's JSON over the budget, the page ends before that item, and `next_offset` names it. So a page may hold fewer than `limit` items. A page holds at least one item, so `next_offset` always moves on. An item over the budget by itself comes alone on its page, which then goes over the budget.

An `issues_list` item is short. It carries only `id`, `project`, `tracker`, `status`, `assigned_to`, `subject`, and `updated_on`, plus the associations that `include` names. Those fields are enough to pick an issue from a search. On a test server, a page of 100 issues was about 27K characters instead of 69K. `fields` adds other item fields, such as `due_date` and `spent_hours`, and the tool's description names them all:

```json
{ "where": { "assigned_to_id": "me" }, "fields": ["due_date", "spent_hours"] }
```

The tool always keeps `id`. Redmine sends `attachments` and `relations` only when asked, so naming one in `fields` asks for it, as `include` does. Before it sends any request, the tool refuses a name in `fields` that is not an item field, and the error lists the item fields.

Items of the other list tools leave out the long fields `description`, `notes`, `text`, `comments`, `journals`, and `changesets`.

Pass `detailed: true` to get every field of each item, the long ones included, or call the `get` tool for one record.

## Results

A tool that returns a record, such as `issues_get` or `issues_create`, returns Redmine's record with the SDK's response fixes applied. One fix turns the `hours` string `"8/1"` into the number 8. Each `api_key` value in it reads `[hidden by @redmine-ts/mcp]`, as [API keys](security.md#api-keys) describes. A tool with nothing to return, such as `issues_delete`, returns `{ "ok": true }`.

`issues_update` and `issues_transition` with `notes` also return `journal`, the journal that holds the notes, such as `{ "id": 812, "note": 4 }`. To edit the notes, pass `id` to `journals_update`. `note` is N in `#note-N`, counted as `issue_context` counts it. To find the journal, the tool reads the issue's journals before and after the update. It takes the one journal that is newer than all it read before, comes from the key's user, and holds exactly the notes sent. An exact match works because Redmine stores notes as sent. The result has no `journal` when the notes are blank. It also has none when the tool cannot tell which journal is the right one, such as when the same user adds the same notes to the issue at the same time. If a read fails after the update, the result also leaves `journal` out. The result is still a success, because Redmine already added the notes and a retry would add them twice. With `notes`, the tool sends two more requests to Redmine, and reads `users/current.json` at most once every 5 minutes.

Redmine can send hours as long floats, such as `2.1600000262260437`, or `0.3333333333333333` for the time spent on an issue with a 20-minute entry. Every tool but `raw_request` rounds `estimated_hours`, `total_estimated_hours`, `spent_hours`, `total_spent_hours`, and a time entry's `hours` to two decimals, so the first value reads `2.16`. The issue resource rounds them too. `raw_request` and the SDK return the hours as Redmine sends them.

Every result carries the object twice, as `structuredContent` and as compact JSON in a text block. The tool's `outputSchema` describes it, and the server checks each result against that schema before it answers. `attachments_download` adds the image as an image block after the JSON.

### Result size

Clients cap the size of one tool result. Cursor takes at most 40,000 bytes, Codex about 48,000, and OpenCode 51,200. Claude Code saves a result over 50,000 characters to a file, which the agent then reads with a script. So list tools, `issue_context`, `issues_get`, and `raw_request` stop filling a result at a budget. The budget is 32,000 bytes of compact JSON by default. A list page then ends early, as [Page through a list](#page-through-a-list) describes. `issue_context` pages through the journals, as [Read an issue with `issue_context`](workflow-tools.md#read-an-issue-with-issue_context) describes.

The budget counts UTF-8 bytes, because those clients count bytes. A Cyrillic letter takes 2 bytes. Pages with long Russian text measured 1.6 to 1.75 bytes per character. The budget counts one copy of the JSON, because every client checked reads either the text block or `structuredContent`. The server measures the result as it sends it, with API keys hidden and with the `warning` field on user-written text. The warning's own text block adds about 140 characters on top.

`REDMINE_MCP_MAX_RESULT_BYTES`, or `maxResultBytes` when you [embed the server](embedding.md), raises the budget for a client that takes more, or lowers it. The value must be from 1,000 to 499,000 bytes. Above 49,000, those tools also carry `_meta["anthropic/maxResultSizeChars"]` in `tools/list`, set to the budget plus 1,000 characters for the warning. With it, Claude Code keeps their results inline instead of saving those over 50,000 characters to a file. Claude Code takes at most 500,000 there, so a larger budget would not keep a result inline.

`issues_get` with `include: ["journals"]` leaves out the oldest journals that do not fit. It adds `journals_omitted`, which counts them, and `journals_before`, as an `issue_context` page does. Pass that `journals_before` to `issue_context` to get the journals left out. Both fields come with every record that has journals. They are `0` and `null` when no journal is left out.

`raw_request` returns a response over the budget as `{status, truncated: true, bytes, response_text, message}`. `status` is Redmine's HTTP status, such as 201 for a create or 202 for a request Redmine accepted but has not finished. `response_text` holds as much of the start of the response's compact JSON as fits. `bytes` counts the whole JSON. `message` suggests `limit` and `offset`, or fewer `include` values, to narrow the request. When the full response holds user-written text, the result starts with the [`warning` field](security.md#safety-checklist), as a `{response}` result would. The budget counts the warning.

## Errors

A failed Redmine request comes back as a tool result with `isError: true`, never as a protocol error. Over OAuth, a sign-in that Redmine refuses gets HTTP 401 instead, and a call beyond the token's scope gets HTTP 403. Three cases keep the error result, as [What holds either way](authentication.md#what-holds-either-way) describes:

- A call that the server's own mode refuses.
- A request in which Redmine may have applied a write.
- A Redmine 401 on a path outside its REST formats, `.json` and `.xml`.

The first text block says what went wrong and what to do. The last text block is the SDK's error as JSON, with a `kind` such as `validation`, `not_found`, `conflict`, `invalid_input`, `access_denied`, or `unsupported_version`.

- A 422 carries Redmine's own messages, such as `Subject cannot be blank`, in the user's language.
- A 404 says to check the ids.
- A 403 from a [tool that needs an admin key](#tools-that-need-an-admin-key) says so, and names what works without one.
- Before it sends any request, the tool refuses input that does not match its schema, a filter form that the filter does not take, or a name in `fields` that is not an item field. The error has the kind `invalid_input`. For an unknown argument, the message names it and lists the arguments the tool takes. For a bad filter, the message lists the forms the filter accepts. For a bad field name, it lists the item fields.
