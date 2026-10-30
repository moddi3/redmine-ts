# @redmine-ts/mcp

[![npm](https://img.shields.io/npm/v/@redmine-ts/mcp)](https://www.npmjs.com/package/@redmine-ts/mcp)

Let ChatGPT, Claude, and your coding agents work in Redmine as you.

`@redmine-ts/mcp` is an MCP server with 93 tools for the Redmine REST API, over stdio or Streamable HTTP. Agents on your machine use your API key. claude.ai and ChatGPT sign you in through Redmine's own OAuth, so each call runs with your Redmine permissions and Redmine records each change under your name.

## Quick start

Copy your API key from Redmine, under **My account**, **API access key**. Then add the server to Claude Code:

```sh
claude mcp add redmine \
  --env REDMINE_URL=https://tracker.example.com \
  --env REDMINE_API_KEY=your-key \
  -- npx -y @redmine-ts/mcp --no-delete
```

Then ask Claude what is assigned to you in Redmine. `--no-delete` leaves every tool that deletes out of the list. Leave it out only when the agent needs to delete.

## Why use it

- **Tested with claude.ai and ChatGPT.** On 2026-10-26 both signed in to Redmine 7.0 through this server, ran tool calls, and refreshed their tokens. ChatGPT proves who it is with a signed JWT, which the server checks at the token endpoint.
- **A typed tool for every SDK operation.** 86 tools come from [`@redmine-ts/sdk`](https://www.npmjs.com/package/@redmine-ts/sdk), each with a JSON Schema for its input and its output, and hints that tell the client whether it reads, writes, or deletes.
- **Workflow tools for the common jobs.** `issue_context` returns an issue with the statuses it can move to, its relations, and its journals as readable changes, in one call. `issues_transition` changes a status by name and lists the allowed ones when the workflow refuses. `people_find` returns a colleague's login by name, for any key.
- **Access modes the SDK enforces.** `--read-only` lists 44 tools and sends only `GET`. `--no-delete` lists 77 and never sends `DELETE`. A hidden tool called anyway gets an error, and Redmine sees nothing.
- **One server for a team.** With `--http`, each request brings its own API key or OAuth token. The server needs no database, because it seals codes and tokens with one secret.
- **Node, Bun, and Cloudflare Workers.** `npx` runs the CLI on Node 22 or later. `createRedmineMcpHandler` is the same server as a web-standard request handler. CI runs it on Node and Bun, and it was checked on Workers in workerd.

## Add the server to a client

It needs Node 22 or later. `npx` runs it without an install, and a global install puts the command `redmine-mcp` on your `PATH`:

```sh
REDMINE_URL=https://tracker.example.com REDMINE_API_KEY=... npx -y @redmine-ts/mcp --help
npm install -g @redmine-ts/mcp && redmine-mcp --help
```

Each client starts `redmine-mcp` itself and talks to it over stdio. Put your API key in the client's config, not in a shared file. You find the key in Redmine under **My account**, **API access key**.

Claude Code:

```sh
claude mcp add redmine \
  --env REDMINE_URL=https://tracker.example.com \
  --env REDMINE_API_KEY=your-key \
  -- npx -y @redmine-ts/mcp
```

Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.redmine]
command = "npx"
args = ["-y", "@redmine-ts/mcp", "--no-delete"]
env = { REDMINE_URL = "https://tracker.example.com", REDMINE_API_KEY = "your-key" }
```

Cursor, in `.cursor/mcp.json` or `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["-y", "@redmine-ts/mcp", "--read-only"],
      "env": {
        "REDMINE_URL": "https://tracker.example.com",
        "REDMINE_API_KEY": "your-key"
      }
    }
  }
}
```

The server name, `redmine` above, is the prefix clients put in front of the tool names, so the tools themselves carry no `redmine_` prefix.

Tool schemas are JSON Schema draft 2020-12 with one `type` per schema. A value that may be `null` is an `anyOf` with a `{ "type": "null" }` branch, not `"type": ["string", "null"]`, so clients that map tool schemas onto a dialect with one type per schema, such as Gemini's function declarations, can read them. They use no `$ref`. Each input schema in `tools/list` is under 5,000 bytes of compact JSON, because Codex strips the descriptions from a larger one.

## Connect claude.ai and ChatGPT

claude.ai and ChatGPT reach MCP servers over the internet and sign in with OAuth, so they cannot send an API key. Run the server with OAuth at a public https URL, as [OAuth](#oauth) describes, and give each client that URL:

- In claude.ai, add a custom connector with the URL, and keep the sign-in options it detects.
- In ChatGPT, turn on developer mode and create a connector with the URL and OAuth.

Each person then allows the client on the server's consent page, signs in to Redmine, and approves Redmine's own consent page. From then on, every tool call acts as that person.

## Workflow tools

Seven hand-written tools cover what an agent does most, in fewer calls than the generated tools need. They are listed first, and they share the generated tools' validation, error results, and the warning on user-written text.

| Tool                   | Kind  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `issue_context`        | read  | One issue with everything needed to work on it: the full description, the statuses it can move to, relations read from this issue (`{relation: "blocked by", issue_id: 12}`), subtasks with their status, attachment metadata, watchers, and the newest journals as readable changes, as many as fit in the [result budget](#result-size), with a cursor to the older ones.                                                                      |
| `reference_data`       | read  | Statuses, trackers, priorities, time entry activities, the current user, and custom field definitions for an admin key. With `project_id`, also the project's trackers, categories, versions, members with roles, issue custom fields, and modules.                                                                                                                                                                                              |
| `people_find`          | read  | Finds people by name among a project's members, or on an issue and in its project, and returns each one's id, name, and login for an `@login` mention. Works with any key, unlike `users_list`.                                                                                                                                                                                                                                                  |
| `issues_transition`    | write | Changes the status by id or by name, checked against the workflow first. A refusal lists the allowed statuses by id and name.                                                                                                                                                                                                                                                                                                                    |
| `attachments_upload`   | write | Uploads a file from `content_text`, `content_base64`, or, with a files directory, `path`, and returns the reference to pass in `uploads` of `issues_create`, `issues_update`, `news_create`, `news_update`, or `wiki_update`. At most 5 MB, Redmine's default limit. Over HTTP, a `content_text` near 5 MB can exceed the request limit once JSON escapes its line breaks, quotes, and control characters. Send such a file as `content_base64`. |
| `attachments_download` | read  | Returns an image up to 1 MB as image content, a text file up to 100 KB as text, or a thumbnail. Any other file returns its metadata and a note.                                                                                                                                                                                                                                                                                                  |
| `raw_request`          | read  | Sends one request to any REST path, for plugin endpoints and fields the typed tools miss. Listed in every mode; the access mode decides which methods it sends, and its hints and description say so.                                                                                                                                                                                                                                            |

`issue_context` turns each journal detail into `{field, from, to}` with names, such as `{"field": "Status", "from": "New", "to": "In Progress"}`. It names statuses, trackers, and priorities from lists cached for 5 minutes, and assignees, categories, versions, and projects from the issue's project, fetched only when a journal needs them. A lookup the key may not read leaves the raw id.

A change to the description whose old or new text spans lines or is longer than 350 characters comes as `{field, diff}` instead, such as `{"field": "Description", "diff": "@@ line 13 @@\n  13. Step 13\n- 14. Step 14\n+ 14. Step fourteen\n  15. Step 15"}`. A change to a custom field comes as a diff only when a value spans lines. The diff lists the changed lines, `-` for old and `+` for new, with one unchanged line around each run of changes. In each run, the removed lines come before the added ones. `N` in `@@ line N @@` numbers the run's first line in the new text.

A line longer than 350 characters shows an excerpt of at most 350 characters, with `…` in place of each part it leaves out. Each changed line longer than 350 characters pairs with one line on the other side of its run, one to one, the pairs that share the most text at their start and end first, and ties to the earlier lines. A long line can get its second choice when a closer pair took its first. The excerpt shows 40 characters on each side of every place where the two lines differ, and it is cut at 350 characters only when those parts do not fit. When a `-` and a `+` excerpt in one run would still read the same, both also show where those two lines differ, and where no room is left for that, the diff stops before the `+` line. Any other long line shows its start. A diff stops at 1000 characters, so a rewrite whose removed lines fill them shows only removed lines. A diff that leaves anything out ends with one clip marker, which counts the characters of the full diff that it left out. A journal in `full` shows its diff uncut, with every line whole. CRLF and LF line breaks compare equal.

Descriptions and notes longer than 4000 characters are cut with a marker that names the call for the full text, and the result says how many journals it left out. For a description, that call is `issues_get`. For a journal, it is `issue_context` with the journal's id in `full`, which returns that journal unclipped even when it is older than the newest `journals`.

`issue_context` returns the newest `journals`, 20 by default, but only as many as fit in the [result budget](#result-size) with the rest of the result. When it leaves older journals out, for either reason, `journals_before` is the id of the oldest journal it returned. Call `issue_context` again with that `journals_before` for the next older page, and so on until `journals_before` is `null`. On each page, `journals_omitted` counts the older journals still left out, and `journals_total` counts them all. `journals_before` reads as the journals before that one in Redmine's order, or, for a journal the key cannot see, such as one deleted since, as the journals with lower ids. Journals in `full` come on top of the page and are never cut.

A page holds one journal at least, so paging moves on even when the issue alone is over the budget, such as an epic with hundreds of subtasks or an issue with a long text custom field. Each page then holds the issue and one journal, and goes over the budget by that much.

Each journal's `note` is its N in the issue page's `#note-N`, and the issue resource puts `#note-N` in each journal heading. Redmine numbers all journals of an issue before it hides some of them. It hides other users' private notes from a user who may not view them. It also hides a journal without notes when the user may not see any of its changes, such as a relation to an issue that the user cannot see or that was deleted later, or a custom field the user cannot see. After a hidden journal, `note` is lower than Redmine's number. The deleted issue lowers it for an admin key too.

### Find people

An `@login` mention needs the person's login. `users_list` would find it by name, but Redmine answers it to an admin key only. `people_find` searches the people that a project or an issue involves, which any key that sees them may read:

- With `project_id`, the project's members.
- With `issue_id`, the members of the issue's project, and the issue's author, assignee, watchers, and the users of its journals.

Each match comes as `{id, name, login, match, found_as}`. `name` is as Redmine shows it, in the users display format set under **Administration**, **Settings**, **Display**. `found_as` lists where the name was found: `member`, `author`, `assignee`, `watcher`, or `journal`. A person on the issue without `member` is not a member of its project now, such as an admin or someone who left.

Matching works on words. Case, accents, and other marks do not count, so `семен` finds Семён and `jose` finds José. Letters with no mark to drop are spelled in Latin, so `lukasz` finds Łukasz and `strauss` finds Strauß. Punctuation splits words, except an apostrophe, and `'`, `’`, and `ʼ` are the same. Each word of `name` pairs with a different word of the person's name, in any order, so `petrov ivan` finds Ivan Petrov. A word may be the start of one, so `Iv Pet` finds him too, but `van` does not. A Latin spelling does not find a name in Cyrillic, or the other way round. A name in a script without spaces matches only from its start.

`match` says how the person matched:

- `exact`: each word of `name` is a whole word of the person's name, as `Petrov` for Ivan Petrov.
- `prefix`: each word of `name` is a whole word or the start of one, as `Iv Pet` for Ivan Petrov.
- `partial`: the name as Redmine shows it holds less than `name`. Each of its words is a word of `name` or the initial of one, so `Ivan Petrov` finds someone shown as Ivan P., I. Petrov, or Ivan, and `Ivan Ivanovich Petrov` finds Ivan Petrov. When the shown name has as many words as `name`, a word of `name` may also start one of them, so `Iv Petrov` finds Ivan P.

A partial match may be someone else, so `people_find` returns partial matches only when nothing matched better. The best matches come first: the same words, then whole words of a longer name, then starts of words, then partial matches. People on the issue come before the other members, and ties go by name.

`people_find` matches the names that Redmine shows. Under the `username` display format, Redmine shows logins, so search by login. Under `lastnamefirstname`, Redmine runs the last and first name together, so search by the last name or its start.

Groups are left out, because a mention names a user. A user who is a member only through a group is matched, because Redmine gives each user of a member group a membership of their own. An issue may be assigned to a group, and a group may watch it without being a member. `users_get` answers 404 for a group, so for a watcher or assignee that `users_get` does not find, `people_find` calls `groups_get` and drops the group. A group the key may not see stays, with `login: null`.

`people_find` makes at most 26 calls: the issue, at most 5 pages of members, which is 500 members, and for each match it returns, `users_get`, then `groups_get` for a watcher or assignee that `users_get` does not find. With its default settings, the SDK retries each call up to twice on a 429, a 502, 503, or 504, a network error, or a timeout, so `people_find` sends at most 78 requests. It returns at most 10 matches, and `more` counts the matches after the first 10. A group among the first 10 is dropped after its lookup, so fewer than 10 can come back while `more` is above 0. In a project of more than 500 members, `unavailable` says that the rest were not searched, and `memberships_list` pages through all of them.

`users_get` returns the login to any key that may see the user. A key that is not an admin's sees only active users, and, depending on its roles, only users in the projects it can see. For a user the key may not see, `login` is `null`, and `unavailable` names the user's id. Redmine resolves a mention from that key to the same users, so the mention would not reach them either. With an admin key, a locked user comes with `locked: true`, because Redmine notifies no locked user of a mention.

Redmine shows the issues and journals of a deleted user as its Anonymous user's, which has no login. `people_find` returns the Anonymous user with `login: null`, and `unavailable` says why. A key that is not an admin's gets 404 from `users_get` for it, as for a user it may not see.

A key whose role may not view watchers gets no watchers, and `unavailable` says so. When the key may not read the members of the issue's project, `people_find` searches the issue's people alone and says so in `unavailable`. When a page of members after the first fails, it searches the members read before that page, and `unavailable` says how many. With `project_id`, a failed first page is an error.

### Files

To attach a file, call `attachments_upload`, then pass the reference in `uploads` of the create or update tool. The generated tools take references in `uploads`, never file content, so their schemas stay small and each file travels in its own request. Over `--http`, a request body may be up to about 6.7 MiB, enough for a 5 MiB file as `content_base64` (see [Security defaults](#security-defaults)). Redmine keeps an upload that no record takes until an admin prunes it, so upload only what you attach.

`REDMINE_MCP_FILES_DIR` names the one local directory the server may use. With it, `attachments_upload` accepts `path`, a file in that directory given relative to it or as an absolute path, and `attachments_save` is listed: it saves an attachment there under a name that never replaces an existing file, such as `build (1).log`, and returns the absolute path. The description of `path` names the directory with its symlinks resolved, as in the paths `attachments_save` returns, and so do the errors for a path that does not exist in it or resolves outside it.

A path must resolve inside the directory after symlinks are followed, so `../secret`, an absolute path outside the directory, and a symlink that points outside are refused before anything is read or sent. `attachments_save` only reads from Redmine, so `read-only` mode lists it too, but it writes the local file, so its `readOnlyHint` is `false`.

### The issue resource

The server offers the resource template `redmine://issues/{id}`. Reading `redmine://issues/123` returns issue 123 as Markdown, built from the same data as `issue_context`, with the warning about user-written text on the first line and user-written text quoted. It holds the newest 20 journals, without the [result budget](#result-size). An unknown URI or a missing issue is an MCP error.

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

### Filters

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

### Pages

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

### Results

A tool that returns a record, such as `issues_get` or `issues_create`, returns Redmine's record with the SDK's response fixes applied, such as turning the `hours` string `"8/1"` into the number 8. Each `api_key` value in it reads `[hidden by @redmine-ts/mcp]`, as [API keys](#api-keys) describes. A tool with nothing to return, such as `issues_update` or `issues_delete`, returns `{ "ok": true }`.

Redmine can send hours as long floats, such as `2.1600000262260437`, or `0.3333333333333333` for the time spent on an issue with a 20-minute entry. Every tool but `raw_request` rounds `estimated_hours`, `total_estimated_hours`, `spent_hours`, `total_spent_hours`, and a time entry's `hours` to two decimals, so that one reads `2.16`. So does the issue resource. `raw_request` and the SDK return the hours as Redmine sends them.

Every result carries the object twice: as `structuredContent`, and as compact JSON in a text block. The tool's `outputSchema` describes it, and the server checks each result against that schema before it answers. `attachments_download` adds the image as an image block after the JSON.

### Result size

Clients cap the size of one tool result. Cursor takes at most 40,000 bytes, Codex about 48,000 and OpenCode 51,200, and Claude Code saves a result over 50,000 characters to a file, which the agent then reads with a script. So list tools and `issue_context` stop filling a result at a budget, 32,000 bytes of its compact JSON by default. A list page then ends early, as [Pages](#pages) describes, and `issue_context` pages through the journals, as [Workflow tools](#workflow-tools) describes.

The budget counts UTF-8 bytes, because those clients count bytes, and Cyrillic letters take 2 bytes each. Pages with long Russian text measured 1.6 to 1.75 bytes per character. It counts one copy of the JSON, because every client checked reads either the text block or `structuredContent`. The server measures the result as it sends it, with API keys hidden. The warning on user-written text, about 140 characters, comes on top.

`REDMINE_MCP_MAX_RESULT_BYTES`, or `maxResultBytes` when you [embed the server](#embed-the-server), raises the budget for a client that takes more, or lowers it. It must be at least 1,000 bytes. Above 49,000, list tools and `issue_context` also carry `_meta["anthropic/maxResultSizeChars"]` in `tools/list`, set to the budget plus 1,000 characters for the warning, so that Claude Code keeps their results inline instead of saving those over 50,000 characters to a file. Claude Code takes at most 500,000 there, so the value stops at 500,000.

`issues_get` with `include: ["journals"]` and `raw_request` return all that Redmine sends, whatever its size. For a long history, `issue_context` pages through the journals.

### Errors

A failed Redmine request comes back as a tool result with `isError: true`, never as a protocol error. Over OAuth, a sign-in that Redmine refuses gets HTTP 401 instead, and a call beyond the token's scope gets HTTP 403. Three cases keep the error result, as [What holds either way](#what-holds-either-way) describes: a call that the server's own mode refuses, a request in which Redmine may have applied a write, and a Redmine 401 on a path outside its REST formats (`.json` and `.xml`). The first text block says what went wrong and what to do. The last text block is the SDK's error as JSON, with a `kind` such as `validation`, `not_found`, `conflict`, `access_denied`, or `unsupported_version`.

- A 422 carries Redmine's own messages, such as `Subject cannot be blank`, in the user's language.
- A 404 says to check the ids.
- A 403 from a [tool that needs an admin key](#tools-that-need-an-admin-key) says so, and names what works without one.
- Input that does not match the tool's schema, a filter form that the filter does not take, or a name in `fields` that is not an item field, is refused before any request. For a bad filter, the message lists the forms the filter accepts, and for a bad field name, the item fields.

### Tools that need an admin key

Redmine answers 403 to every key but an admin's on these tools, because their actions in Redmine 6.1 and 7.0 run `require_admin` first: `users_list`, `users_create`, `users_update`, `users_delete`, `groups_list`, `groups_create`, `groups_update`, `groups_delete`, `groups_add_user`, `groups_remove_user`, `groups_remove_users`, `custom_fields_list`, `projects_archive`, and `projects_unarchive`. Their descriptions say "Needs an admin key". Their 403 errors say that the tool needs an admin key or that the REST API is disabled, because with the REST API off Redmine answers 403 to every key, an admin's too. Where something works without an admin key, both name it:

- `users_list`: `people_find`, or `memberships_list` and then `users_get`.
- `users_update`: `my_account_update`, for the key's own account.
- `groups_list`: `memberships_list` for the groups in a project, and `groups_get` for one group.
- `custom_fields_list`: `reference_data` with `project_id`, for the project's issue custom fields.

The server lists these tools for every key, because it lists tools without asking Redmine whose key it holds. A sign-in through a Redmine OAuth application gets 403 from them even for an admin, because the server never asks Redmine for the `admin` scope. Use an admin's key in the header for that work.

## Access modes

The access mode decides which tools the server lists and which requests the SDK sends. When you give more than one setting, for example `REDMINE_MCP_ACCESS=no-delete` and `--read-only`, the strictest one wins.

| Mode        | Lists                                                    | Sends                          |
| ----------- | -------------------------------------------------------- | ------------------------------ |
| `full`      | All 93 tools.                                            | Every method.                  |
| `no-delete` | 77 tools. The `DELETE` tools are gone.                   | `GET`, `POST`, `PUT`, `PATCH`. |
| `read-only` | 44 tools: the reads, and `raw_request` limited to `GET`. | `GET` only.                    |

With `REDMINE_MCP_FILES_DIR` set, each mode lists one more tool, `attachments_save`.

A client can still call a tool the mode hides, for example from a tool list it cached earlier. The server then answers with an error that names the mode, and the SDK sends nothing to Redmine.

The mode limits what the server does. It does not limit the API key. A key that belongs to an admin can still do everything outside this server, so give the server a key of a user whose Redmine role allows only what the agent needs.

## Version handling

Redmine does not report its version over the API, so you declare it with `REDMINE_VERSION`. With a declared version, the server hides tools the version lacks. On `6.1` that is `groups_remove_users`, which Redmine added in 7.0, so a 6.1 server lists 92 tools in `full` mode. A call to a hidden tool returns an error that names the version the tool needs.

Without `REDMINE_VERSION`, the server lists every tool. A tool newer than your server then fails with a 404, and the error says that the server may be older than the operation.

## Serve over HTTP

With `--http`, one server serves Streamable HTTP at `/mcp` for many users. Each request carries its user's API key in the `X-Redmine-API-Key` header, and the server answers it with a fresh MCP server for that key. `REDMINE_URL` is fixed at startup, so a client cannot point the server at another host. The server does not read `REDMINE_API_KEY` in this mode; when it is set, the server says once on stderr that it ignores it.

```sh
REDMINE_URL=https://tracker.example.com npx -y @redmine-ts/mcp --http --no-delete
# redmine-mcp: serving MCP at http://127.0.0.1:3737/mcp
```

The server speaks the 2026-07-28 protocol, and serves clients on the 2025 revisions without sessions: each request stands alone, and `GET` and `DELETE` on `/mcp` answer 405. The access mode and `REDMINE_VERSION` apply to every request, as they do over stdio. `SIGINT` or `SIGTERM` lets requests in flight finish and then stops the server; a second signal stops it at once.

| Request                                                                                           | Answer                                                                                                   |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| No `X-Redmine-API-Key` header, or an empty one                                                    | 401, with a JSON-RPC error that names the header. With [OAuth](#oauth), a 401 with a `Bearer` challenge. |
| An `Origin` that `--allow-origin` does not list                                                   | 403.                                                                                                     |
| A `Host` that is not one of the server's names                                                    | 403, on a loopback address or with `--allow-host`. See [Security defaults](#security-defaults).          |
| A path other than `/mcp`                                                                          | 404. With `REDMINE_MCP_PUBLIC_URL`, the server serves that URL's path and the OAuth paths instead.       |
| A key Redmine rejects, with a body over 64 KiB or one still arriving after a second               | 401 with id `null`, after one `GET /users/current.json`. The server reads no more of the body.           |
| A key Redmine rejects, with a smaller body that arrives at once                                   | The tool call returns an error result with Redmine's 401.                                                |
| A key with a body over 64 KiB or one still arriving after a second, while Redmine does not answer | 503 with id `null`. See [Security defaults](#security-defaults).                                         |
| A body still arriving 300 seconds after the server began reading it                               | 408 with id `null`. `bodyTimeoutMs` changes the time. See [Security defaults](#security-defaults).       |
| A body that stopped growing, when another request needs the room it holds in the body budget      | 408 with id `null`.                                                                                      |
| A body past 64 KiB while bodies that are still growing hold the whole budget                      | 503 with id `null` and `Retry-After: 5`, even partway through the body.                                  |
| A body over about 6.7 MiB, or over the budget plus 64 KiB when `maxBodyBytesInFlight` is smaller  | 413 with id `null`.                                                                                      |
| An OAuth token Redmine no longer accepts                                                          | 401 `invalid_token` with the `Bearer` challenge, so the client refreshes or signs in again.              |
| A call the OAuth token's scope does not allow                                                     | 403 `insufficient_scope`, naming the scopes the call needs, if the server's own mode allows the call.    |

The 401 for a missing key and the 403s for `Origin` and `Host` are JSON-RPC errors. The error carries the request's `id` when the body is a single request, declares a `Content-Length` of at most 64 KiB, and arrives within a second. To refuse a request, the server does not read a larger or chunked body and does not wait longer for a slow one, so their errors have a `null` id. A notification, a batch, or a body that is not JSON has no single id, so its error has a `null` id too, as JSON-RPC 2.0 does for an id it cannot detect. The 401 for a key Redmine rejects, the 503 for an unanswered check, and the 408, 503 and 413 answers about the body always have a `null` id, because the server gives them without having read the whole body.

Claude Code:

```sh
claude mcp add --transport http redmine http://127.0.0.1:3737/mcp \
  --header "X-Redmine-API-Key: your-key"
```

Cursor, in `.cursor/mcp.json` or `~/.cursor/mcp.json`, with the key read from the environment:

```json
{
  "mcpServers": {
    "redmine": {
      "url": "http://127.0.0.1:3737/mcp",
      "headers": { "X-Redmine-API-Key": "${env:REDMINE_API_KEY}" }
    }
  }
}
```

### Security defaults

- The server listens on `127.0.0.1`. To listen anywhere else, pass the address with `--host`.
- On a loopback address, the `Host` header must name `localhost`, `127.0.0.1`, `[::1]`, the address itself, the host of `REDMINE_MCP_PUBLIC_URL`, or a hostname that `--allow-host` lists. A web page that rebinds its own domain to your machine sends its domain as `Host`, so the server refuses it. On any other address, such as `0.0.0.0` in a container, the server cannot know every name its clients use, so it checks `Host` only when `--allow-host` is given.
- A request with an `Origin` header gets 403 unless `--allow-origin` lists it. Browsers send `Origin`. Command-line and desktop clients do not, so they pass. See [Browser clients and CORS](#browser-clients-and-cors).
- Before Redmine accepts a key, the server reads at most 64 KiB of the body and waits at most a second for it. Past either, it checks the key with one `GET /users/current.json` and reads nothing more until Redmine answers. A key Redmine refuses gets 401. When Redmine does not answer the check within 8 seconds, or answers with an error other than 401, the request gets 503, even a `tools/list`. `initialize`, `tools/list` and most tool calls are smaller and arrive at once, so they cost no extra call.
- A key that Redmine accepts, or a valid OAuth token, may send a body of up to about 6.7 MiB, enough for a 5 MiB `attachments_upload` in base64.
- Bodies that are still arriving share a budget of 32 MiB, which the `maxBodyBytesInFlight` option of `createRedmineMcpHandler` changes. The default lets four bodies at the limit arrive at once. A body that needs room takes it from bodies that have not grown by 128 KiB in the last 5 seconds, and those get 408. When every other body is still growing, the request gets 503 with `Retry-After: 5`.
- Every body must arrive within 300 seconds of when the server begins reading it, or it gets 408. The `bodyTimeoutMs` option changes the time. A 6.7 MiB upload must arrive at about 23 KiB/s or faster.
- The budget does not tell users apart, and it does not cover the first 64 KiB of each body or the connections themselves. On a server with open registration or OAuth sign-ins, cap the connections of one client address in a proxy, such as with nginx's `limit_conn`.
- On Cloudflare Workers, one isolate has 128 MB. Keep large uploads to about three at a time per isolate.
- A client whose JSON encoder escapes `/`, as PHP's `json_encode` does by default, makes a 5 MB base64 upload about 109 KB longer, which goes over the limit and gets 413. Send such files a little smaller, or turn the escaping off.
- The server speaks plain HTTP. Without TLS, the API key crosses the network in clear text, so for remote use put a proxy that terminates TLS in front of the server and keep the server on loopback. Caddy passes the client's `Host` to the server unless told otherwise. Rewrite it as below, or keep it and start the server with `--allow-host mcp.example.com`:

```caddy
mcp.example.com {
	reverse_proxy 127.0.0.1:3737 {
		header_up Host {upstream_hostport}
	}
}
```

[HTTP server limits and the measurements behind them](https://github.com/moddi3/redmine-ts/blob/main/packages/mcp/docs/limits.md) explains why each limit exists and what it costs, with the memory under stalled uploads, the connection after a refusal, and the peaks measured on Workers.

### Browser clients and CORS

A page in a browser can call the server only when the server answers its CORS preflight. `--allow-origin` enables that: a request from a listed origin gets 204 for its `OPTIONS` preflight and CORS headers on every response, so a web inspector or a web app can call `/mcp` directly.

```sh
redmine-mcp --http --allow-origin https://app.example.com --allow-origin localhost
```

The flag takes a hostname or an origin. `localhost` admits `http://localhost:6274`, `https://localhost`, and any other scheme and port on that hostname, as the MCP SDK's check does. `https://app.example.com` admits exactly that scheme, host, and port, and refuses `http://app.example.com` and `https://app.example.com:8443`. Prefer the origin form: another service on the same host is a different origin. Write the origin as a browser does, in lowercase, with no path and no trailing slash. The server answers with the requesting origin, never `*`, and with `Vary: Origin`. It sends no `Access-Control-Allow-Credentials`, because the key travels in a header and there are no cookies. A request from another origin still gets 403 without CORS headers, and a request without `Origin` is served as before.

The preflight allows `POST`, the only method `/mcp` serves, and the headers the 2026-07-28 transport sends (`Content-Type`, `Accept`, `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`) plus `Authorization` and `X-Redmine-API-Key`. Responses expose `WWW-Authenticate`, so a page can follow an OAuth challenge. The server issues no session id. The `Host` check on loopback applies to preflights too. The OAuth metadata, token and registration endpoints answer any origin, as they carry no cookie and no key.

CORS means that a page on an allowed origin holds the user's Redmine API key and acts as that user. Allow only origins whose code you trust, and prefer an origin to a hostname. CORS does not open the port: the server still listens on `127.0.0.1` by default, and the `Host` check still refuses a rebound domain.

## OAuth

claude.ai and ChatGPT connect to remote MCP servers only through OAuth; neither can send an `X-Redmine-API-Key` header. With OAuth on, the server is its own OAuth authorization server for MCP clients, as the 2026-07-28 MCP spec describes, and people sign in at Redmine's own OAuth, which Redmine has offered since 6.1. The header keeps working next to OAuth, for clients that can send it.

```sh
REDMINE_URL=https://tracker.example.com \
REDMINE_MCP_PUBLIC_URL=https://mcp.example.com/mcp \
REDMINE_MCP_AUTH_SECRET=... \
REDMINE_OAUTH_CLIENT_ID=... REDMINE_OAUTH_CLIENT_SECRET=... \
  npx -y @redmine-ts/mcp --http --no-delete
# redmine-mcp: serving MCP at http://127.0.0.1:3737/mcp
# redmine-mcp: OAuth for https://mcp.example.com/mcp; the Redmine application's redirect URI is https://mcp.example.com/mcp/oauth/redmine/callback
```

Generate the secret once, with `openssl rand -base64 32`, and keep it: a new one signs every client out. It must be random. A passphrase can be guessed offline from any sealed value, such as the one on the consent page, and then every token opens. The server refuses a secret shorter than 32 characters or with fewer than 12 distinct ones, but it cannot tell a long passphrase from random text. A sign-in goes like this:

1. The MCP client finds the server's metadata from the 401 and identifies itself, with a Client ID Metadata Document or by registering.
2. The server shows its own consent page: the client's name and host, where it sends the person back, and the access it asks for. A malformed request gets an error page instead, never a redirect, so nobody can use the server's URL to send people to a site of their choosing.
3. On Allow, the browser goes to Redmine's `/oauth/authorize`. The person signs in to Redmine, with two-factor authentication if Redmine asks for it, and approves Redmine's own consent page.
4. Redmine sends the browser back to the server, which gives the client a code, and the client exchanges it for the server's own access and refresh tokens.
5. Each MCP request opens the client's token to the Redmine token sealed inside it, and calls Redmine with that one. The client's token never reaches Redmine.

Codes, tokens, states and client registrations are encrypted with keys derived from `REDMINE_MCP_AUTH_SECRET`, so the server needs no database. What must be used only once, and the sign-ins that a reused token ends, are marked in a [grant store](#grant-store). The CLI keeps it in memory; an embedded server with several processes or Worker isolates shares one, or runs with the weaker guarantees of each process's own memory.

### What a sign-in looks like

Here MCP Inspector signs in to a Redmine 7.0. The server runs as in the example above, with `REDMINE_MCP_PUBLIC_URL=http://localhost:3737/mcp`, `--no-delete`, and `--allow-origin http://127.0.0.1:6274` for the Inspector's page:

<!-- Recorded by scripts/oauth-walkthrough/record.sh. Run it again after a change to these pages. -->

![MCP Inspector adds the server by its URL; the person allows it on the server's consent page, signs in to Redmine and authorizes the application; a tool call then returns their user](https://raw.githubusercontent.com/moddi3/redmine-ts/main/packages/mcp/docs/oauth/sign-in.webp)

<details>
<summary>Step by step</summary>

1. The client gets the server's URL and nothing else.

   ![MCP Inspector's Add server dialog with the URL http://localhost:3737/mcp](https://raw.githubusercontent.com/moddi3/redmine-ts/main/packages/mcp/docs/oauth/1-add-server.webp)

2. The server's consent page names the client, where it sends the person back, and the access it asks for: read and write, since the server runs with `--no-delete`.

   ![The consent page: Allow MCP Inspector to use Redmine as you?](https://raw.githubusercontent.com/moddi3/redmine-ts/main/packages/mcp/docs/oauth/2-consent.webp)

3. Allow leads to Redmine's own login.

   ![Redmine's login page](https://raw.githubusercontent.com/moddi3/redmine-ts/main/packages/mcp/docs/oauth/3-redmine-login.webp)

4. Redmine asks the person to authorize the application the admin created, listing the permissions the server asked for. Redmine skips this page when the person has already authorized the application for the same permissions and has not revoked it; the server's consent page still comes first.

   ![Redmine's Authorization required page for the application MCP](https://raw.githubusercontent.com/moddi3/redmine-ts/main/packages/mcp/docs/oauth/4-redmine-authorize.webp)

5. Redmine sends the browser back through the server, and the client is connected.

   ![MCP Inspector connected to the server, with Authorization complete](https://raw.githubusercontent.com/moddi3/redmine-ts/main/packages/mcp/docs/oauth/5-connected.webp)

6. Tools act as the person who signed in: `users_current` returns jsmith.

   ![The users_current tool result in MCP Inspector](https://raw.githubusercontent.com/moddi3/redmine-ts/main/packages/mcp/docs/oauth/6-tool-call.webp)

</details>

### Set up Redmine

OAuth needs Redmine 6.1 or later with the REST API turned on (Administration, Settings, API). Create one application as an admin:

1. Administration, Applications, New application.
2. Name: what people see on Redmine's consent page, such as `MCP`.
3. Redirect URI: the public URL of the MCP endpoint followed by `/oauth/redmine/callback`, such as `https://mcp.example.com/mcp/oauth/redmine/callback`. The server prints it at startup. Redmine allows plain http only for `localhost` and `127.0.0.1`.
4. Confidential: keep it checked. Redmine creates only confidential applications.
5. Scopes: tick every permission. The server asks Redmine only for the permissions of the scopes a client was granted (see [Scopes](#scopes-and-access-modes)), and Redmine refuses a request for one the application lacks. Leave Administration unticked; the server never asks for it.
6. Save, and copy the UID into `REDMINE_OAUTH_CLIENT_ID` and the secret into `REDMINE_OAUTH_CLIENT_SECRET`. Redmine shows the secret once.

### Run the server

| Environment variable               | Meaning                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDMINE_MCP_PUBLIC_URL`           | The URL people give their client, such as `https://mcp.example.com/mcp` or `https://tracker.example.com/mcp`, in its canonical form: lowercase host, no default port, no trailing slash. The metadata names it as written, and clients compare it exactly. With OAuth it must be https, except on `localhost`. The server never guesses it from `Host` or `X-Forwarded-*`. |
| `REDMINE_MCP_AUTH_SECRET`          | Turns OAuth on. At least 32 random characters, such as the output of `openssl rand -base64 32`, never a passphrase. Keep it secret: it protects every token.                                                                                                                                                                                                               |
| `REDMINE_MCP_AUTH_PREVIOUS_SECRET` | Optional: the secret before the last change. See [Change the secret](#change-the-secret).                                                                                                                                                                                                                                                                                  |
| `REDMINE_OAUTH_CLIENT_ID`          | The Redmine application's UID.                                                                                                                                                                                                                                                                                                                                             |
| `REDMINE_OAUTH_CLIENT_SECRET`      | The Redmine application's secret.                                                                                                                                                                                                                                                                                                                                          |
| `REDMINE_PUBLIC_URL`               | Optional: Redmine's URL as browsers reach it, when `REDMINE_URL` is an internal address such as `http://localhost:3000`. Sign-in sends browsers there; token requests and the REST API keep using `REDMINE_URL`. Default: `REDMINE_URL`.                                                                                                                                   |

`--allow-client claude.ai --allow-client vscode.dev` admits only those clients: a client with a metadata document when the document's URL is on a listed host, a registered client when every one of its redirect URIs is. Without the flag, any client may ask; the consent page is what stops one the person does not trust. A listed host vouches for whatever it serves: `localhost` admits every program on the person's computer that registers itself, and a host where people upload files admits anyone who uploads a metadata document there. List only hosts that publish nothing but their own clients.

On a public deployment, pass `--allow-client`. Without it, anyone who reaches the sign-in page can make the server fetch an https URL of their choosing. A `client_id` whose fetch fails is fetched again on every sign-in that names it. The flag limits only the hosts of metadata documents. A document that declares `private_key_jwt` may name its key set at a `jwks_uri` on any public https host, and the server fetches that URL the same way as a document, at public addresses only. List the hosts of the clients your people use. For example, `claude.ai` serves Claude Code's metadata document and the redirect URI of claude.ai, Claude Desktop and mobile, as [Claude's documentation](https://claude.com/docs/connectors/building/authentication) says. `chatgpt.com` serves ChatGPT's metadata documents and redirect URIs, as [OpenAI's documentation](https://developers.openai.com/plugins/build/auth) says.

With or without the flag, the server bounds those fetches:

- A fetch goes only to a public address, follows no redirect, and stops after 5 seconds, or after 5 KB for a document and 16 KiB for a key set.
- A document that passes the checks is kept for 5 minutes. A fetch that fails, or a document that fails a check, is not kept, as the Client ID Metadata Document draft requires, so the next sign-in of that `client_id` fetches it again. Such a failure also drops the document kept from an earlier fetch.
- Sign-ins of the same client while its document is being fetched share that fetch.
- One process, or one Worker isolate, fetches at most 8 documents at once. Beyond that, a sign-in that needs a fetch gets a 503 page with `Retry-After: 5` that asks the person to reload in a moment. Nothing about the client is remembered from that refusal. A fetch that has not settled after 6 seconds, as when Workers cancel the request that started it, no longer counts, and the sign-ins waiting on it get the same 503 page.
- A registered client, or one whose document is kept, signs in without a fetch, so the cap never touches it. While all 8 fetches are taken, or once a fetch has not settled after 6 seconds, a document fetched within the last hour, and among the last 256 fetched, still serves its client instead of the 503 page.
- The server fetches a key set only at the token endpoint, for a code or refresh token it sealed for a client whose document declared `private_key_jwt`. A key set that passes the checks is kept for 5 minutes, and a fetch that fails is not kept. An assertion whose `kid` the kept set lacks fetches the set again, at most once a minute, so random `kid`s cannot make the server fetch more. One process fetches at most 4 key sets at once, apart from the 8 documents. Beyond that, the token request gets 503 `temporarily_unavailable` with `Retry-After: 5`.

A caller can still keep the 8 document fetches busy, and a client the server has not fetched within the hour then gets the 503 page until they stop. With `--allow-client`, the fetches go only to the hosts you listed. To limit how often one address can open the sign-in page, rate-limit `GET` on the authorize path, `/mcp/oauth/authorize` for `https://mcp.example.com/mcp`, at the proxy. [HTTP server limits](https://github.com/moddi3/redmine-ts/blob/main/packages/mcp/docs/limits.md#metadata-document-and-key-set-fetches) covers the rest, such as Workers that cancel a fetch when its client disconnects.

The server speaks plain HTTP, so put it behind a proxy that terminates TLS, as in [Same-origin deployment](#same-origin-deployment). On a loopback address it accepts the public URL's host in `Host` as well as `localhost`, so a proxy may pass the client's `Host` through.

### Clients

Give the client the public URL. Every client below finds the rest from the server's 401.

| Client                                      | How it identifies itself                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| claude.ai, Claude Desktop and mobile        | Its metadata document, `https://claude.ai/oauth/mcp-oauth-client-metadata`, with redirect URI `https://claude.ai/api/mcp/auth_callback`. It signs in as a public client with PKCE. On 2026-10-26 it signed in, ran tool calls, and refreshed its tokens through this server.                                                                                                                                                                           |
| ChatGPT                                     | Its metadata document, `https://chatgpt.com/oauth/client.json`, which declares `private_key_jwt` with the key set at `https://chatgpt.com/oauth/jwks.json`, so each token request carries a signed JWT. See [Clients with keys](#clients-with-keys). On 2026-10-26 it signed in, ran tool calls, and refreshed its tokens through this server. Its JWT uses RS256 and sets `aud` to the token endpoint. The server returns `iss`, which ChatGPT needs. |
| Claude Code, Codex                          | Their metadata documents, with a loopback redirect URI on a random port, which the server allows.                                                                                                                                                                                                                                                                                                                                                      |
| VS Code                                     | Its metadata document at `vscode.dev`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Cursor and other clients without a document | Dynamic Client Registration. The client ID the server returns is the registration, sealed.                                                                                                                                                                                                                                                                                                                                                             |

Clients that can send headers, such as Claude Code, Codex, Cursor, and VS Code, may keep using `X-Redmine-API-Key` instead. A request with both uses the key. A token goes in `Authorization: Bearer <token>`, alone.

Every client proves itself with PKCE. A registration that asks for `client_secret_basic` or `client_secret_post`, or names no method, is answered `token_endpoint_auth_method: "none"`, which the client then uses. A registration that asks for a key-based method, such as `private_key_jwt` or `tls_client_auth`, is refused, and the refusal tells a client with keys to use a metadata document. A metadata document is the client's own declaration, so the server takes its method as written. It admits `none`, no method, and `private_key_jwt`, and refuses every other method. A registration takes at most 5 redirect URIs of 256 characters each; an empty name, or one over 100 characters, is dropped. The server refuses a metadata document URL with a port, which the draft allows; no known client uses one.

### Clients with keys

A metadata document that declares `token_endpoint_auth_method: "private_key_jwt"` must give its public keys in exactly one of `jwks` and `jwks_uri`, an https URL. If it names `token_endpoint_auth_signing_alg`, that must be `RS256`, `PS256` or `ES256`. The server checks this at the consent page and refuses any other document.

The server seals the method into the code and into every refresh token of the sign-in. Each token request for them must then authenticate the client with a JWT, as RFC 7523 describes: `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` and the JWT in `client_assertion`. The server checks the JWT against the client's current document, which it keeps for 5 minutes, and these rules:

- The signature uses `RS256`, `PS256` or `ES256`, or the document's `token_endpoint_auth_signing_alg`, with the key that the JWT's `kid` names. RSA keys need at least 2048 bits.
- `iss` and `sub` are the `client_id`. The form's `client_id` may be left out; when sent, it must equal `sub`.
- `aud` names the issuer, which is the public URL, or the token endpoint.
- `exp` is at most an hour away, with 60 seconds of clock skew. `nbf` and `iat`, when present, are not in the future.
- `jti` is present, and works once. With a [grant store](#grant-store), it works once across every instance.

A failed check gets 401 `invalid_client` with the check in `error_description`, before the server spends the code or asks Redmine. A request without an assertion for such a sign-in gets 401, and so does a request with an assertion for a public client's sign-in. If the client's document no longer declares `private_key_jwt`, its token requests get 401. If the document or the key set cannot be fetched, they get 502 `server_error`. A public client's token requests never fetch anything.

### Scopes and access modes

The server offers three scopes, each including the ones before it, and each grants one [access mode](#access-modes):

| Scope            | Access mode | Permissions the server asks Redmine for                                                             |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `redmine:read`   | `read-only` | The `view_*` permissions, `search_project`, `browse_repository` and `export_wiki_pages`.            |
| `redmine:write`  | `no-delete` | Those, and every permission that adds or changes something, such as `add_issues` and `edit_issues`. |
| `redmine:delete` | `full`      | Those, and the `delete_*` permissions.                                                              |

The server's own mode caps what it grants: a `--no-delete` server offers `redmine:read` and `redmine:write` only, and its 401 asks for those. A request uses the stricter of the token's mode and the server's. A client that asks for no scope gets all the server offers; the consent page lists them. Names that are not the server's, next to its own, are ignored; a scope that names none of them is refused. A refresh may narrow the scope, and is refused when it names one the sign-in lacks. OAuth sessions never act as a Redmine admin, even for admins, because the server never asks for the `admin` scope; use the header for admin work.

Redmine checks a token's permissions on most requests, but not on issue edits, notes and deletes: those check only the user's role ([Redmine #44271](https://www.redmine.org/issues/44271)). So the access mode, which the SDK applies before any request, is the guard that holds. The Redmine permissions narrow everything else.

### Sign out and revoke

- An access token lasts at most an hour, and never longer than the Redmine token inside it. A refresh token lasts 30 days, and each refresh brings a new one. Without a grant store, an API-key sign-in ends 30 days after consent, refreshed or not.
- People revoke the application in Redmine, under Authorized applications (`/oauth/authorized_applications`). Redmine then refuses its tokens at once. The next typed tool call, or any call to a `.json` or `.xml` path through `raw_request`, gets HTTP 401 `invalid_token`, the client's refresh fails, and the client asks them to sign in again.
- An admin who deletes the Redmine application ends every session the same way.
- With a grant store, a refresh token or a code that comes back more than 30 seconds after its first use ends every token of that sign-in.
- Changing `REDMINE_MCP_AUTH_SECRET` without keeping the old one signs every client out.
- Turning `--api-key-login` off refuses the key-based codes and refresh tokens at once; their access tokens keep working until they expire, within the hour. To end them sooner, change the secret.

The server has no revocation endpoint and cannot revoke one client on its own: it keeps no list of what it issued.

### Change the secret

Set the new secret in `REDMINE_MCP_AUTH_SECRET` and the old one in `REDMINE_MCP_AUTH_PREVIOUS_SECRET`. The server seals with the new one and opens with both, and every refresh moves a client to the new one. After 30 days, when every refresh token the old secret sealed has expired, remove the previous secret. Clients that registered dynamically, such as Cursor, then register again.

Change the secret, without keeping the old one, when you point the same public URL at another Redmine. Tokens are bound to the public URL, not to the Redmine behind it, so the old tokens would carry their Redmine tokens, or with [API key sign-in](#api-key-sign-in) their API keys, to the new Redmine.

### Grant store

Codes, Redmine states and consent pages must each be used once, and a refresh token should be. A grant store marks them: two operations on namespaced keys, `consume(key, ttlSeconds)`, which marks a key used and resolves false when it already was, and `has(key)`. Every instance that serves the public URL must share one, and `consume` must be atomic across them. Every instance that shares the secret must share the store, or none may have one: an instance without it neither rotates refresh tokens nor ends API-key sign-ins after 30 days, so a refresh token sealed by an instance with the store would renew there without either.

With a store:

- Codes of both sign-in methods, Redmine states, consent pages and [client assertions](#clients-with-keys) work once across every instance.
- Refresh tokens rotate: each works once. A refresh token or a code that comes back a second time means one leaked, so the server ends every token of that sign-in, and refuses its access tokens from then on.
- Except within 30 seconds of the first use: then the second use is the same client racing itself, such as two processes refreshing at once, or retrying after a timeout. It is refused, and the sign-in stays. The window is the price of not signing people out for that; someone who steals a refresh token and uses it within those 30 seconds is refused too, but does not end the sign-in.
- A code or refresh token is checked before the server asks Redmine and marked after Redmine answers, so a Redmine outage spends nothing and the client can retry.
- A store that fails, by throwing or rejecting, fails closed: the token endpoint answers 503 `temporarily_unavailable`, the consent page and Redmine's return show an error page to retry from, the MCP endpoint answers 503, and `onError` gets the cause.

The CLI is one process, so it keeps the store in its memory. An embedded server passes `oauth.store`: `memoryGrantStore()` for a single process, or an adapter for something shared. The memory store grows with use: each refresh leaves a marker that lives 30 days, as long as the token it marks, so a client that refreshes every hour adds about 720 entries a month, and an ended sign-in adds one more. That suits the CLI; for a busy server, use a store that keeps its keys elsewhere. On Workers that is a Durable Object, one per key, which runs its storage calls one at a time; Workers KV is eventually consistent, so two isolates could both consume one key.

```ts
import { DurableObject } from "cloudflare:workers";
import type { GrantStore } from "@redmine-ts/mcp";

/** One object per key: its storage calls do not interleave, so get-then-put is atomic. */
export class GrantKey extends DurableObject {
  async consume(ttlSeconds: number): Promise<boolean> {
    const until = await this.ctx.storage.get<number>("until");
    if (until !== undefined && until > Date.now()) return false;
    await this.ctx.storage.put("until", Date.now() + ttlSeconds * 1000);
    await this.ctx.storage.setAlarm(Date.now() + ttlSeconds * 1000);
    return true;
  }
  async has(): Promise<boolean> {
    const until = await this.ctx.storage.get<number>("until");
    return until !== undefined && until > Date.now();
  }
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

export function grantStore(keys: DurableObjectNamespace<GrantKey>): GrantStore {
  return {
    consume: (key, ttlSeconds) => keys.get(keys.idFromName(key)).consume(ttlSeconds),
    has: (key) => keys.get(keys.idFromName(key)).has(),
  };
}
```

The adapter costs one Durable Object call on every MCP request that carries a token, to check whether its sign-in was ended, besides the calls that sign-ins and refreshes make, and one object per key.

Without a store, the server keeps the weaker guarantees of each process's or isolate's own memory:

- A code, a state or a consent page works once per process. Another process or Worker isolate that has not seen it accepts it once more within its lifetime: 60 seconds for a code, and only with the client's PKCE verifier.
- A client assertion works once per process. Another process may accept it once more until its `exp` passes, at most an hour, and only with a code or refresh token of its client.
- Refresh tokens do not rotate. With Redmine sign-in, Redmine replaces its own refresh token on use, but accepts the old one until the new access token is first used, so a stolen refresh token works in that window. With API key sign-in nothing replaces it: a stolen refresh token works until the sign-in ends, 30 days after consent.
- A code that comes back cannot end the tokens its first use issued, as OAuth 2.1 asks where possible.

### What holds either way

- **No per-client revocation** on the server's side; revocation happens in Redmine, or by changing the secret for everyone.
- **The secret protects everything.** With the secret and a captured token, someone can read the Redmine token inside until it expires, or the API key with [API key sign-in](#api-key-sign-in). Keep the secret out of logs and repositories, and change it if it leaks.
- **Some failures inside a request stay error results.** Over OAuth, a tool call gets HTTP 401 `invalid_token` once Redmine refuses the sign-in, and HTTP 403 `insufficient_scope` when it needs a scope that the token lacks and the server grants. A call that the server's own mode refuses, and a Redmine 403, still return an error result with HTTP 200, because a new sign-in cannot fix them. So does a request in which Redmine may have applied a write, so that the client's retry cannot repeat the write. The client's next request gets the 401. A Redmine 401 stays an error result too when its path ends in neither `.json` nor `.xml`, such as `my/page.js` through `raw_request`. Redmine answers 401 there even for a sign-in it accepts, because the path is outside its API. Tools beyond the token's scope stay out of `tools/list`, so the 403 comes from `raw_request` or from a call to an unlisted tool.
- **OAuth responses arrive whole.** To set the status, the server holds each OAuth response until the call ends. A long call sends no keep-alive events, and a client on a 2025 revision gets the result in one piece. A response to a 2025-revision request is an event stream, which the server reads into memory once more, so a large one, such as a batch of big reads, needs about twice its size at its peak.
- **Plain http to Redmine.** `REDMINE_URL` and `REDMINE_PUBLIC_URL` may be http. The server's own https rule covers only the public URL, so secure the browser's way to Redmine's login and the server's way to Redmine's API yourself.

### API key sign-in

For a Redmine without OAuth applications, `--api-key-login` replaces `REDMINE_OAUTH_CLIENT_ID` and `REDMINE_OAUTH_CLIENT_SECRET`: the consent page asks for the person's API key, checks it with `GET /users/current.json`, and seals it into the code and the tokens. Resetting the key in Redmine, under My account, ends the session. Tool calls then get HTTP 401 `invalid_token`, and the refresh fails because it checks the key again. Checking keys has limits, so the page is a slow oracle for a list of leaked keys:

- One sign-in may try 5 keys. Each try needs the page that came back from the last one, so going back does not reset the count. A key Redmine did not answer for counts too, and the page says Redmine did not answer.
- With a grant store, one browser may fail 10 keys an hour; after that it gets an error page.
- One process checks at most 4 keys at Redmine at once; above that the page asks the person to try again in a moment, with a 503.

None of this limits a source address: a browser that drops its cookie starts again. Behind a proxy, rate-limit `POST` to the consent page, `/mcp/oauth/authorize` for `https://mcp.example.com/mcp`, by client address there.

Prefer Redmine sign-in where you can. A page that asks people to paste a master key is what phishing looks like, and it teaches them to do it. The page says which address bar it belongs to and where the key goes, but people rarely check. The key is also stronger than a token: it never expires, and Redmine permissions do not narrow it, so only the access mode limits it.

Without a [grant store](#grant-store) shared by every instance, a code is single-use only per process or Worker isolate, refresh tokens do not rotate, and the sign-in ends 30 days after consent; see the list there.

### Endpoints

All paths derive from `REDMINE_MCP_PUBLIC_URL`. For `https://mcp.example.com/mcp`:

| Path                                                                             | What                                                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/mcp`                                                                           | The MCP endpoint.                                                                                                                         |
| `/mcp/.well-known/oauth-protected-resource`                                      | Protected resource metadata, which the 401 names.                                                                                         |
| `/.well-known/oauth-protected-resource/mcp`                                      | The same document where RFC 9728 places it.                                                                                               |
| `/.well-known/oauth-authorization-server/mcp`                                    | Authorization server metadata (RFC 8414). The issuer is the public URL.                                                                   |
| `/.well-known/openid-configuration/mcp`, `/mcp/.well-known/openid-configuration` | The same document, at the other URLs the MCP spec has clients try.                                                                        |
| `/mcp/oauth/authorize`                                                           | The consent page, and the form it posts.                                                                                                  |
| `/mcp/oauth/redmine/callback`                                                    | Where Redmine sends the browser back.                                                                                                     |
| `/mcp/oauth/token`                                                               | Tokens: `authorization_code` with PKCE S256, and `refresh_token`. A [client with keys](#clients-with-keys) also sends a client assertion. |
| `/mcp/oauth/register`                                                            | Dynamic Client Registration.                                                                                                              |

The server is not an OpenID provider and issues no ID tokens, so the document at the OpenID Connect URLs lacks `jwks_uri` and the other OpenID fields. Clients try the RFC 8414 URL first; forward it.

For development on `http://localhost`, Chrome and Firefox keep the server's `Secure` cookie; Safari does not, so a sign-in there ends with "did not start in this browser".

### Same-origin deployment

The server can share an origin with Redmine, such as `https://tracker.example.com/mcp` next to Redmine at `https://tracker.example.com`, or `https://example.com/redmine/mcp` next to Redmine at `https://example.com/redmine`. Run it on loopback, set `REDMINE_MCP_PUBLIC_URL` to that URL, `REDMINE_URL` to Redmine's internal address and `REDMINE_PUBLIC_URL` to Redmine's public one, and forward these paths unchanged, here for `/mcp`:

- `/mcp` and everything under `/mcp/`
- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server/mcp`
- `/.well-known/openid-configuration/mcp`

Nothing else at the origin's root belongs to the server. Forward the request body unbuffered and the response as it streams, since tool results arrive as server-sent events.

The browser sends the server Redmine's cookies too, since they share the origin. The server reads only its own cookie, `__Host-redmine-mcp-oauth`, and never passes cookies on, but the proxy can keep Redmine's session cookie from reaching it at all. nginx:

```nginx
# Only the MCP server's own cookie; an empty value drops the header.
map $http_cookie $redmine_mcp_cookie {
    default "";
    "~(?:^|;\s*)(?<mcp>__Host-redmine-mcp-oauth=[^;]+)" $mcp;
}

server {
    server_name tracker.example.com;
    # ... Redmine as before ...

    location ~ ^/(mcp|\.well-known/(oauth-protected-resource|oauth-authorization-server|openid-configuration)/mcp)(/|$) {
        proxy_pass http://127.0.0.1:3737;
        proxy_http_version 1.1;
        proxy_set_header Cookie $redmine_mcp_cookie;
        proxy_request_buffering off;
        proxy_buffering off;
        client_max_body_size 7m;
        client_body_timeout 60s;
    }
}
```

nginx refuses a body over 1 MB with 413 unless `client_max_body_size` raises it, and the server takes up to about 6.7 MiB, enough for a 5 MB upload in base64. `client_body_timeout` ends a request whose body stops arriving for that long, 60 seconds by default, with 408. It applies to every client, including one whose key Redmine accepts. The server itself ends any body still arriving 300 seconds after it began reading it, and a stalled body sooner when another request needs the room it holds in the body budget (see [Security defaults](#security-defaults)).

Caddy:

```caddy
tracker.example.com {
	@mcp path /mcp /mcp/* /.well-known/oauth-protected-resource/mcp /.well-known/oauth-authorization-server/mcp /.well-known/openid-configuration/mcp
	handle @mcp {
		reverse_proxy 127.0.0.1:3737 {
			header_up Cookie "__Host-redmine-mcp-oauth={cookie.__Host-redmine-mcp-oauth}"
		}
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
```

For a subpath, replace `/mcp` with the whole path, such as `/redmine/mcp` and `/.well-known/oauth-protected-resource/redmine/mcp`. The OAuth paths never collide with Redmine's own `/oauth/...` routes, because they all live under the MCP endpoint's path.

Pages on the public origin, the consent page and, on a shared origin, Redmine's own, may call `/mcp` without `--allow-origin`; they still need a key or a token. The consent form is refused when a browser says it was posted from any other origin.

## Settings

The server reads its settings once at startup. A missing or invalid value stops it with exit code 2 and a message that names the setting. The message never prints the URL or the API key, so a key pasted into the wrong variable does not end up in a log.

| Environment variable           | Required | Meaning                                                                                                                                                                    |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDMINE_URL`                  | Yes      | The base URL, subpath included, such as `https://example.com/redmine`. http or https only.                                                                                 |
| `REDMINE_API_KEY`              | stdio    | The API key of the Redmine user that every tool acts as. Not read with `--http`.                                                                                           |
| `REDMINE_VERSION`              | No       | `6.1` or `7.0`. A patch version such as `7.0.1` is read as `7.0`.                                                                                                          |
| `REDMINE_MCP_ACCESS`           | No       | `full` (the default), `no-delete`, or `read-only`.                                                                                                                         |
| `REDMINE_MCP_FILES_DIR`        | No       | A directory the server may read uploads from and save attachments to. It must exist. Without it, no tool touches local files. Not read with `--http`. See [Files](#files). |
| `REDMINE_MCP_MAX_RESULT_BYTES` | No       | Bytes of JSON at which list tools and `issue_context` stop filling a result, 32,000 by default and at least 1,000. See [Result size](#result-size).                        |

[OAuth](#oauth) adds `REDMINE_MCP_PUBLIC_URL`, `REDMINE_MCP_AUTH_SECRET`, `REDMINE_MCP_AUTH_PREVIOUS_SECRET`, `REDMINE_OAUTH_CLIENT_ID`, `REDMINE_OAUTH_CLIENT_SECRET` and `REDMINE_PUBLIC_URL`, for `--http` only. `REDMINE_MCP_PUBLIC_URL` alone serves the endpoint at its path, without OAuth. The others need `REDMINE_MCP_AUTH_SECRET`, and the server refuses to start when they do not fit together. Their values are never printed.

| Flag                                | Meaning                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--read-only`                       | Same as `REDMINE_MCP_ACCESS=read-only`.                                                                                                            |
| `--no-delete`                       | Same as `REDMINE_MCP_ACCESS=no-delete`.                                                                                                            |
| `--dangerously-reveal-api-keys`     | Returns API keys as Redmine sends them. Over stdio only. See [API keys](#api-keys).                                                                |
| `--http`                            | Serves Streamable HTTP at `/mcp` instead of stdio.                                                                                                 |
| `--port <n>`                        | The HTTP port, 3737 by default. `0` picks a free port.                                                                                             |
| `--host <addr>`                     | The address to listen on, `127.0.0.1` by default.                                                                                                  |
| `--allow-origin <hostname\|origin>` | Admits browser requests from a hostname or an exact origin and sends them CORS headers. Repeat it for more. See [CORS](#browser-clients-and-cors). |
| `--allow-host <hostname>`           | Accepts this hostname in `Host`, for a proxy that keeps the client's `Host`. Repeat it for more. Off loopback, it turns the `Host` check on.       |
| `--api-key-login`                   | OAuth without a Redmine application: the consent page asks for the API key. See [API key sign-in](#api-key-sign-in).                               |
| `--allow-client <hostname>`         | Admits only OAuth clients on this host. Repeat it for more. See [Run the server](#run-the-server).                                                 |
| `--help`                            | Prints the settings and exits.                                                                                                                     |

`--port`, `--host`, `--allow-origin`, `--allow-host`, `--api-key-login` and `--allow-client` need `--http`. `--allow-origin`, `--allow-host` and `--allow-client` match each name exactly, so a value with `*` stops the server at startup. Their options in [`createRedmineMcpHandler`](#embed-the-server), `allowedOrigins`, `allowedHosts` and `oauth.allowedClientHosts`, throw a `TypeError` for an entry with `*` when the handler is created.

## API keys

Redmine sends a working API key as `api_key` in `users/current.json`, `users/:id.json` and `my/account.json`, and in the user that `users_create` makes. A user gets their own key, and an admin gets the key of any user. The server replaces each `api_key` value, at any depth, with `[hidden by @redmine-ts/mcp]`. The field stays, so a record without `api_key` still means that Redmine sent none.

The rule covers tool results, `raw_request` included, error results and the `redmine://issues/{id}` resource. The SDK cuts an error body at 2 KiB, so a body that does not parse as JSON is matched as text. The server also replaces the credential it sends to Redmine, the API key or the OAuth access token, wherever a response repeats it, such as a proxy that echoes `X-Redmine-API-Key` in an error. A credential shorter than 20 characters stays, so that it cannot replace ordinary words. A record read this way and sent back, such as a plugin's settings through `raw_request`, carries the placeholder instead of the key, and Redmine would store the placeholder.

`--dangerously-reveal-api-keys` turns all of this off, and the tools return keys as Redmine sends them. The keys then sit in the agent's context and transcript. The flag works only over stdio, where the person who starts the server owns the key. With `--http`, the server refuses to start. Over HTTP, one flag would decide for every user, and a client signed in through [API key sign-in](#api-key-sign-in) would read the key that its person gave only to the consent page. Over OAuth through a Redmine application, Redmine sends no key, so the flag would change nothing there. Redmine sends a key over OAuth only to an admin whose token has the `admin` scope, and this server never asks for that scope.

## Safety

- Text that Redmine users write reaches the agent unchanged. When a result contains `subject`, `description`, `notes`, `text`, or `comments`, its first text block says that the text is data and not instructions. Treat an agent that reads issues from strangers as exposed to prompt injection anyway, and run it in `read-only` mode when it does not need to write.
- `full` mode lets the agent delete issues, projects, and users. Redmine has no undo. Use `no-delete` unless the agent needs to delete.
- `raw_request` reaches every REST path, plugins included, with the same key. The access mode applies to it like to every tool, and the SDK refuses a path outside `REDMINE_URL`.
- Without `REDMINE_MCP_FILES_DIR`, no tool reads or writes local files. With it, tools read and write only inside that directory. Only trusted users should be able to write in it, because a hard link there to a file outside is read like any file in it, and on systems other than Linux and macOS a directory there swapped for a symlink while a file is read can lead the server to a file outside it.
- The server hides API keys in what it returns, unless you pass `--dangerously-reveal-api-keys`. See [API keys](#api-keys).
- The server never logs the API key and sends it only in the `X-Redmine-API-Key` header. Over [OAuth](#oauth), it sends Redmine only Redmine's own token or the key sealed in the client's token, never the client's token.

## Embed the server

`createRedmineMcpServer` takes the same config as `createRedmine` from `@redmine-ts/sdk`, and optionally `{ files, maxResultBytes }`, and returns an MCP `Server`. Connect it to any transport:

```ts
import { createRedmineMcpServer } from "@redmine-ts/mcp";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

serveStdio(() =>
  createRedmineMcpServer({
    baseUrl: "https://tracker.example.com",
    auth: { apiKey: process.env.REDMINE_API_KEY! },
    version: "7.0",
    access: "no-delete",
  }),
);
```

`access` and `version` choose the tools exactly as the settings above do. The other options, such as `fetch`, `timeoutMs`, and `onEvent`, go to the SDK client, except `normalize`. The server keeps it on, whatever the config says, because the tools rely on the SDK's response fixes, such as journals oldest first. To enable `path` uploads and `attachments_save`, pass a files directory from the Node-only `@redmine-ts/mcp/node` entry: `createRedmineMcpServer(config, { files: localFiles("/srv/redmine-files") })`. `localFiles` resolves the directory's symlinks once and throws if the directory does not exist. The main entry never imports file system code, so a server without `files` cannot touch local files. `observe` gets each request the server sends to Redmine, with its `method`, its `url`, and a `status` that is set once Redmine answers, and each call that the access mode refuses. `createRedmineMcpHandler` uses it to pick the status of an OAuth request. `dangerouslyRevealApiKeys: true` does what `--dangerously-reveal-api-keys` does. The server replaces the credential only when `auth` holds it as a string, as `apiKey` or `bearer`. `maxResultBytes` sets the [result budget](#result-size), as `REDMINE_MCP_MAX_RESULT_BYTES` does, and a value under 1,000 or not a whole number throws a `TypeError`.

`createRedmineMcpHandler` takes the same config without `auth` and returns a web-standard `(request: Request) => Promise<Response>`, which is the HTTP server of `--http` without the port. With `publicUrl`, it routes the endpoint and the [OAuth paths](#endpoints) itself, so give it every request; `oauth` takes `secret`, `previousSecret`, `redmineApp: { clientId, clientSecret }` or `apiKeyLogin: true`, `redminePublicUrl`, `allowedClientHosts`, `store` (see [Grant store](#grant-store)), and the required `fetchClientMetadata`. To accept tokens from another authorization server instead, pass `verifier: { issuer, verify(token) }`, where `verify` returns the Redmine credential, scopes, resource and expiry of a token, or undefined. It reads the key from each request's `X-Redmine-API-Key` header, uses no Node APIs, and runs unchanged on Node, Bun, and Cloudflare Workers, without the `nodejs_compat` flag. The key check of [Security defaults](#security-defaults) goes through the same `fetch` and `onEvent`, gives up after the shorter of `timeoutMs` and 8 seconds, and reports an unanswered check to `onError`. It serves every path it receives, so route `/mcp` to it. `allowedOrigins` takes hostnames and origins, as `--allow-origin` does, and `allowedHosts` takes hostnames. A bad origin entry, or an entry with `*` in either of them or in `oauth.allowedClientHosts`, throws when the handler is created. `maxBodyBytesInFlight` and `bodyTimeoutMs` set the body budget and the body deadline of [Security defaults](#security-defaults), and `maxResultBytes` sets the [result budget](#result-size) of every request's server. Set `allowedHosts` when you listen on loopback, or when you know every name clients reach the handler by, as `--allow-host` does; without it the handler does not check `Host`.

Bun:

```ts
import { createRedmineMcpHandler } from "@redmine-ts/mcp";

const handler = createRedmineMcpHandler({
  baseUrl: "https://tracker.example.com",
  version: "7.0",
  access: "no-delete",
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
});

Bun.serve({ hostname: "127.0.0.1", port: 3737, routes: { "/mcp": handler } });
```

Cloudflare Workers, where TLS and the hostname come from Cloudflare:

```ts
import { createRedmineMcpHandler } from "@redmine-ts/mcp";

const handler = createRedmineMcpHandler({
  baseUrl: "https://tracker.example.com",
  access: "read-only",
});

export default {
  fetch: (request: Request) =>
    new URL(request.url).pathname === "/mcp"
      ? handler(request)
      : new Response("Not Found", { status: 404 }),
};
```

`oauth.fetchClientMetadata` is required: it fetches the metadata documents clients name by URL, and the key sets those documents name, so it must not reach the server's own network. On Node, pass `publicFetch` from `@redmine-ts/mcp/node`, which refuses private and special-use addresses; the CLI does. Workers cannot reach private addresses, so pass the global fetch there, and turn on the `global_fetch_strictly_public` compatibility flag: without it, a metadata URL on the Worker's own zone is fetched straight from the zone's origin, past Cloudflare's security settings such as Access; with it, the request goes through Cloudflare's front door like any other. Create the handler on the first request, where the secrets are bound.

Every isolate builds its own handler, so give it the shared [grant store](#grant-store), here the `GrantKey` Durable Object and `grantStore` from that section, bound as `GRANTS`:

```ts
import { createRedmineMcpHandler } from "@redmine-ts/mcp";
import { grantStore } from "./grant-store.ts";
import type { GrantKey } from "./grant-store.ts";

export { GrantKey } from "./grant-store.ts";

interface Env {
  AUTH_SECRET: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  GRANTS: DurableObjectNamespace<GrantKey>;
}

let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: Env) {
    handler ??= createRedmineMcpHandler({
      baseUrl: "https://tracker.example.com",
      publicUrl: "https://mcp.example.com/mcp",
      access: "no-delete",
      oauth: {
        secret: env.AUTH_SECRET,
        redmineApp: { clientId: env.CLIENT_ID, clientSecret: env.CLIENT_SECRET },
        fetchClientMetadata: (input, init) => fetch(input, init),
        store: grantStore(env.GRANTS),
      },
    });
    return handler(request);
  },
};
```

## License

MIT
