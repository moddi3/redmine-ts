# MCP tools

The server lists two kinds of tools: seven hand-written workflow tools for the common jobs, and one generated tool for each SDK method. This page covers which tools a server lists, how to filter and page a list, and what a tool returns. [Workflow tools in detail](workflow-tools.md) covers how `issue_context`, `people_find`, and the file tools work.

## Workflow tools

Seven hand-written tools cover what an agent does most, in fewer calls than the generated tools need. They are listed first, and they share the generated tools' validation, error results, and the warning on user-written text.

| Tool                                                                  | Kind  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`issue_context`](workflow-tools.md#read-an-issue-with-issue_context) | read  | One issue with everything needed to work on it: the full description, the statuses it can move to, relations read from this issue (`{relation: "blocked by", issue_id: 12}`), subtasks with their status, attachment metadata, watchers, and the newest journals as readable changes, as many as fit in the [result budget](#result-size), with a cursor to the older ones.                                                                      |
| `reference_data`                                                      | read  | Statuses, trackers, priorities, time entry activities, the current user, and custom field definitions for an admin key. With `project_id`, also the project's trackers, categories, versions, members with roles, issue custom fields, and modules.                                                                                                                                                                                              |
| [`people_find`](workflow-tools.md#find-people)                        | read  | Finds people by name among a project's members, or on an issue and in its project, and returns each one's id, name, and login for an `@login` mention. Works with any key, unlike `users_list`.                                                                                                                                                                                                                                                  |
| `issues_transition`                                                   | write | Changes the status by id or by name, checked against the workflow first. A refusal lists the allowed statuses by id and name. With `notes`, it returns the journal they were added in, as `issues_update` does.                                                                                                                                                                                                                                  |
| [`attachments_upload`](workflow-tools.md#attach-and-save-files)       | write | Uploads a file from `content_text`, `content_base64`, or, with a files directory, `path`, and returns the reference to pass in `uploads` of `issues_create`, `issues_update`, `news_create`, `news_update`, or `wiki_update`. At most 5 MB, Redmine's default limit. Over HTTP, a `content_text` near 5 MB can exceed the request limit once JSON escapes its line breaks, quotes, and control characters. Send such a file as `content_base64`. |
| `attachments_download`                                                | read  | Returns an image up to 1 MB as image content, a text file up to 100 KB as text, or a thumbnail. Any other file returns its metadata and a note.                                                                                                                                                                                                                                                                                                  |
| `raw_request`                                                         | read  | Sends one request to any REST path, for plugin endpoints and fields the typed tools miss. Listed in every mode; the access mode decides which methods it sends, and its hints and description say so.                                                                                                                                                                                                                                            |

## Generated tools

Each tool is named `<resource>_<verb>` in snake case, after the SDK method it calls. `rm.issues.list` becomes `issues_list`, `rm.timeEntries.create` becomes `time_entries_create`, and `rm.issues.addWatcher` becomes `issues_add_watcher`. The list is in the SDK's catalog order, so it is the same on every start.

Every tool has a `title` and all four hints, set from its HTTP method:

| Method           | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| ---------------- | -------------- | ----------------- | ---------------- | --------------- |
| `GET`            | `true`         | `false`           | `true`           | `false`         |
| `POST`           | `false`        | `false`           | `false`          | `false`         |
| `PUT` or `PATCH` | `false`        | `true`            | `true`           | `false`         |
| `DELETE`         | `false`        | `true`            | `true`           | `false`         |

An update counts as destructive because it overwrites data that exists. `openWorldHint` is `false` because the tools reach only your Redmine instance.

Inputs take ids, not names. `reference_data` maps the common names to ids in one call. A tool's description also names where to find each id it takes. For `user_id` that is `people_find`, which finds only a project's members and an issue's people. Where it cannot find the user, the description names `users_list`: on the tools that need an admin key, and on `memberships_create`, which adds someone who is not a member yet.

## Which tools the server lists

Three settings decide which tools `tools/list` returns: the access mode, the declared Redmine version, and whether the key belongs to an admin. A files directory adds `attachments_save`.

### Access modes

The access mode decides which tools the server lists and which requests the SDK sends. When you give more than one setting, for example `REDMINE_MCP_ACCESS=no-delete` and `--read-only`, the strictest one wins.

| Mode        | Lists                                                    | Sends                          |
| ----------- | -------------------------------------------------------- | ------------------------------ |
| `full`      | All 93 tools.                                            | Every method.                  |
| `no-delete` | 77 tools. The `DELETE` tools are gone.                   | `GET`, `POST`, `PUT`, `PATCH`. |
| `read-only` | 44 tools: the reads, and `raw_request` limited to `GET`. | `GET` only.                    |

With `REDMINE_MCP_FILES_DIR` set, each mode lists one more tool, [`attachments_save`](workflow-tools.md#attach-and-save-files).

A client can still call a tool the mode hides, for example from a tool list it cached earlier. The server then answers with an error that names the mode, and the SDK sends nothing to Redmine.

`no-delete` also refuses an update that would make Redmine delete records: blank `notes` on `journals_update`, `deleted_attachment_ids` on `issues_update` or `wiki_update`, and `memberships_update` with `role_ids` that name none of the membership's current roles. To check `role_ids`, the server reads the membership first. The error says what Redmine would delete, and for a membership it says how to swap roles in two updates. The SDK reads the request as it would be sent, so `raw_request` to those routes is refused too. A plugin endpoint that deletes on a `POST`, `PUT` or `PATCH` is unknown to the SDK, and `raw_request` sends it.

The mode limits what the server does, not what the API key can do. [What limits the agent](security.md#what-limits-the-agent) explains how the mode and Redmine's permissions add up.

### Version handling

Redmine does not report its version over the API, so you declare it with `REDMINE_VERSION`. With a declared version, the server hides tools the version lacks. On `6.1` that is `groups_remove_users`, which Redmine added in 7.0, so a 6.1 server lists 92 tools in `full` mode. A call to a hidden tool returns an error that names the version the tool needs.

Without `REDMINE_VERSION`, the server lists every tool. A tool newer than your server then fails with a 404, and the error says that the server may be older than the operation.

### Tools that need an admin key

Redmine answers 403 to every key but an admin's on these tools, because their actions in Redmine 6.1 and 7.0 run `require_admin` first: `users_list`, `users_create`, `users_update`, `users_delete`, `groups_list`, `groups_create`, `groups_update`, `groups_delete`, `groups_add_user`, `groups_remove_user`, `groups_remove_users`, `custom_fields_list`, `projects_archive`, and `projects_unarchive`. Their descriptions say "Needs an admin key". Their 403 errors say that the tool needs an admin key or that the REST API is disabled, because with the REST API off Redmine answers 403 to every key, an admin's too. Where something works without an admin key, both name it:

- `users_list`: `people_find`, or `memberships_list` and then `users_get`.
- `users_update`: `my_account_update`, for the key's own account.
- `groups_list`: `memberships_list` for the groups in a project, and `groups_get` for one group.
- `custom_fields_list`: `reference_data` with `project_id`, for the project's issue custom fields.

When the key's user is not an admin, the server leaves these tools out of `tools/list`, and the sentence about them out of its instructions. A hidden tool still answers a call, with Redmine's 403. The server learns whose key it holds in these ways:

- Over stdio, it asks Redmine with one `GET /users/current.json` when it starts.
- Over HTTP with the key header, it asks once for each `initialize`, `server/discover` and `tools/list` request. A tool call adds no request.
- An API key sign-in through OAuth records the answer of the key check in the grant. A refresh keeps it, so a change of admin rights shows after the next sign-in.
- A sign-in through a Redmine OAuth application never lists them, because Redmine answers 403 to them even for an admin. The server never asks Redmine for the `admin` scope. Use an admin's key in the header for that work.

When Redmine does not answer, or refuses the key, every tool is listed, and so it is for a token issued before version 0.6.

## Filter a list

List tools filter with `where`, keyed by Redmine's filter names, such as `status_id`, `assigned_to_id`, or `cf_12`. A value or an array of values means equals:

```json
{ "where": { "status_id": "open", "assigned_to_id": "me", "tracker_id": [1, 2] } }
```

An object with one operator picks another comparison: `{ "not": 3 }`, `{ "gte": "2026-10-01" }`, `{ "lte": 5 }`, `{ "between": [1, 10] }`, `{ "contains": "crash" }`, `{ "any": true }`, or `{ "none": true }`. Each filter accepts only the operators Redmine documents for it. `{ "raw": "<t-30" }` sends Redmine's own syntax unchanged, for relative dates and other rare cases. An unknown filter or an operator the filter does not take is refused before any request, with the forms the filter accepts. So are filters Redmine would drop without an error: `category_id` without one `project_id`, and another filter next to `query_id`. A status word such as `"closed"` stands alone, and `{ "not": "closed" }` means open.

In `tools/list`, `where` has one loose condition for every filter, and its description lists the filters in a table. Each line gives a filter, its value, and what it filters, under the operators it takes:

```text
Takes not, any, none:
assigned_to_id | id, `me` for current user | assignee
Takes gte, lte, between, any, none:
created_on | date | creation date
```

A schema for each filter made the input schema of `issues_list` 48K characters. With the table it is under 5,000 bytes. The server still checks each call against the forms of each filter.

## Page through a list

A list tool returns one page:

```json
{ "items": [], "total_count": 312, "offset": 0, "limit": 25, "next_offset": 25 }
```

`limit` is 25 by default and at most 100. To read the next page, call the tool again with `offset` set to `next_offset`. `next_offset` is `null` on the last page. Lists that Redmine returns whole, such as `issue_statuses_list`, are paged the same way.

A page also stops at the [result budget](#result-size). When the next item would take the page's JSON over the budget, the page ends before it and `next_offset` names that item, so a page may hold fewer than `limit` items. A page holds one item at least, so `next_offset` always moves on. An item over the budget by itself comes alone on its page, which then goes over the budget.

An `issues_list` item is short. It carries only `id`, `project`, `tracker`, `status`, `assigned_to`, `subject`, and `updated_on`, which is enough to pick an issue from a search, and the associations that `include` names. On a test server, a page of 100 issues was about 27K characters instead of 69K. `fields` adds other item fields, such as `due_date` and `spent_hours`, and the tool's description names them all:

```json
{ "where": { "assigned_to_id": "me" }, "fields": ["due_date", "spent_hours"] }
```

`id` is always kept. Redmine sends `attachments` and `relations` only when asked, so naming one in `fields` asks for it, as `include` does. A name in `fields` that is not an item field is refused before any request, and the error lists the item fields.

Items of the other list tools leave out the long fields `description`, `notes`, `text`, `comments`, `journals`, and `changesets`.

Pass `detailed: true` to get every field of each item, the long ones included, or call the `get` tool for one record.

## Results

A tool that returns a record, such as `issues_get` or `issues_create`, returns Redmine's record with the SDK's response fixes applied, such as turning the `hours` string `"8/1"` into the number 8. Each `api_key` value in it reads `[hidden by @redmine-ts/mcp]`, as [API keys](security.md#api-keys) describes. A tool with nothing to return, such as `issues_delete`, returns `{ "ok": true }`.

`issues_update` and `issues_transition` with `notes` also return `journal`, the journal that the notes were added in, such as `{ "id": 812, "note": 4 }`. Pass `id` to `journals_update` to edit the notes. `note` is N in `#note-N`, counted as `issue_context` counts it. To find the journal, the tool reads the issue's journals before and after the update. It takes the one journal that is newer than all it read before, by the key's user, with exactly the notes sent, because Redmine stores notes as sent. The result has no `journal` when the notes are blank, or when the tool cannot tell which journal is the right one, such as when the same user adds the same notes to the issue at the same time. A read that fails after the update also leaves `journal` out, and the result is still a success, because the notes are added and a retry would add them twice. With `notes`, the tool sends two more requests to Redmine, and reads `users/current.json` at most once every 5 minutes.

Redmine can send hours as long floats, such as `2.1600000262260437`, or `0.3333333333333333` for the time spent on an issue with a 20-minute entry. Every tool but `raw_request` rounds `estimated_hours`, `total_estimated_hours`, `spent_hours`, `total_spent_hours`, and a time entry's `hours` to two decimals, so that one reads `2.16`. So does the issue resource. `raw_request` and the SDK return the hours as Redmine sends them.

Every result carries the object twice: as `structuredContent`, and as compact JSON in a text block. The tool's `outputSchema` describes it, and the server checks each result against that schema before it answers. `attachments_download` adds the image as an image block after the JSON.

### Result size

Clients cap the size of one tool result. Cursor takes at most 40,000 bytes, Codex about 48,000 and OpenCode 51,200, and Claude Code saves a result over 50,000 characters to a file, which the agent then reads with a script. So list tools, `issue_context`, `issues_get` and `raw_request` stop filling a result at a budget, 32,000 bytes of its compact JSON by default. A list page then ends early, as [Page through a list](#page-through-a-list) describes, and `issue_context` pages through the journals, as [Read an issue with `issue_context`](workflow-tools.md#read-an-issue-with-issue_context) describes.

The budget counts UTF-8 bytes, because those clients count bytes, and Cyrillic letters take 2 bytes each. Pages with long Russian text measured 1.6 to 1.75 bytes per character. It counts one copy of the JSON, because every client checked reads either the text block or `structuredContent`. The server measures the result as it sends it, with API keys hidden and with the `warning` field on user-written text. The warning's own text block, about 140 characters, comes on top.

`REDMINE_MCP_MAX_RESULT_BYTES`, or `maxResultBytes` when you [embed the server](embedding.md), raises the budget for a client that takes more, or lowers it. It must be from 1,000 to 499,000 bytes. Above 49,000, those tools also carry `_meta["anthropic/maxResultSizeChars"]` in `tools/list`, set to the budget plus 1,000 characters for the warning, so that Claude Code keeps their results inline instead of saving those over 50,000 characters to a file. Claude Code takes at most 500,000 there, so a larger budget would not keep a result inline.

`issues_get` with `include: ["journals"]` leaves out the oldest journals that do not fit, and adds `journals_omitted`, which counts them, and `journals_before`, which `issue_context` takes to return them, as its own pages do. Both come with every record that has journals, `0` and `null` when none is left out.

`raw_request` returns a response over the budget as `{status, truncated: true, bytes, response_text, message}`. `status` is Redmine's HTTP status, such as 201 for a create or 202 for a request Redmine accepted but has not finished. `response_text` holds the start of the response's compact JSON, as much as fits, `bytes` counts the whole of it, and `message` suggests `limit` and `offset` or fewer `include` values to narrow the request. When the whole response holds user-written text, the result starts with the [`warning` field](security.md#safety-checklist), as a `{response}` result would, and the budget counts it.

## Errors

A failed Redmine request comes back as a tool result with `isError: true`, never as a protocol error. Over OAuth, a sign-in that Redmine refuses gets HTTP 401 instead, and a call beyond the token's scope gets HTTP 403. Three cases keep the error result, as [What holds either way](authentication.md#what-holds-either-way) describes: a call that the server's own mode refuses, a request in which Redmine may have applied a write, and a Redmine 401 on a path outside its REST formats (`.json` and `.xml`). The first text block says what went wrong and what to do. The last text block is the SDK's error as JSON, with a `kind` such as `validation`, `not_found`, `conflict`, `invalid_input`, `access_denied`, or `unsupported_version`.

- A 422 carries Redmine's own messages, such as `Subject cannot be blank`, in the user's language.
- A 404 says to check the ids.
- A 403 from a [tool that needs an admin key](#tools-that-need-an-admin-key) says so, and names what works without one.
- Input that does not match the tool's schema, a filter form that the filter does not take, or a name in `fields` that is not an item field, is refused before any request, with the kind `invalid_input`. For an unknown argument, the message names it and lists the arguments the tool takes. For a bad filter, it lists the forms the filter accepts, and for a bad field name, the item fields.
