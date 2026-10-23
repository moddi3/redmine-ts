# @redmine-ts/mcp

An MCP server for the Redmine REST API. It exposes one tool per operation of [`@redmine-ts/sdk`](../sdk), 86 in all, and serves them over stdio. Every tool has a JSON Schema for its input and its output, and annotations that tell the client whether it reads, writes, or deletes.

The package is not on npm yet. Until the first release, build it from this repo and run `packages/mcp/dist/cli.mjs` with Node 22 or later:

```sh
vp install
vp run -r build
REDMINE_URL=https://tracker.example.com REDMINE_API_KEY=... node packages/mcp/dist/cli.mjs --help
```

After the release, `npx -y @redmine-ts/mcp` runs the same command, `redmine-mcp`.

## Add the server to a client

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

## Settings

The server reads its settings once at startup. A missing or invalid value stops it with exit code 2 and a message that names the setting. The message never prints the URL or the API key, so a key pasted into the wrong variable does not end up in a log.

| Environment variable | Required | Meaning                                                                                    |
| -------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `REDMINE_URL`        | Yes      | The base URL, subpath included, such as `https://example.com/redmine`. http or https only. |
| `REDMINE_API_KEY`    | Yes      | The API key of the Redmine user that every tool acts as.                                   |
| `REDMINE_VERSION`    | No       | `6.1` or `7.0`. A patch version such as `7.0.1` is read as `7.0`.                          |
| `REDMINE_MCP_ACCESS` | No       | `full` (the default), `no-delete`, or `read-only`.                                         |

| Flag          | Meaning                                 |
| ------------- | --------------------------------------- |
| `--read-only` | Same as `REDMINE_MCP_ACCESS=read-only`. |
| `--no-delete` | Same as `REDMINE_MCP_ACCESS=no-delete`. |
| `--help`      | Prints the settings and exits.          |

## Access modes

The access mode decides which tools the server lists and which requests the SDK sends. When you give more than one setting, for example `REDMINE_MCP_ACCESS=no-delete` and `--read-only`, the strictest one wins.

| Mode        | Lists                                  | Sends                          |
| ----------- | -------------------------------------- | ------------------------------ |
| `full`      | All 86 tools.                          | Every method.                  |
| `no-delete` | 70 tools. The `DELETE` tools are gone. | `GET`, `POST`, `PUT`, `PATCH`. |
| `read-only` | 39 tools, all of them reads.           | `GET` only.                    |

A client can still call a tool the mode hides, for example from a tool list it cached earlier. The server then answers with an error that names the mode, and the SDK sends nothing to Redmine.

The mode limits what the server does. It does not limit the API key. A key that belongs to an admin can still do everything outside this server, so give the server a key of a user whose Redmine role allows only what the agent needs.

## Version handling

Redmine does not report its version over the API, so you declare it with `REDMINE_VERSION`. With a declared version, the server hides tools the version lacks. On `6.1` that is `groups_remove_users`, which Redmine added in 7.0, so a 6.1 server lists 85 tools in `full` mode. A call to a hidden tool returns an error that names the version the tool needs.

Without `REDMINE_VERSION`, the server lists every tool. A tool newer than your server then fails with a 404, and the error says that the server may be older than the operation.

## Tools

Each tool is named `<resource>_<verb>` in snake case, after the SDK method it calls. `rm.issues.list` becomes `issues_list`, `rm.timeEntries.create` becomes `time_entries_create`, and `rm.issues.addWatcher` becomes `issues_add_watcher`. The list is in the SDK's catalog order, so it is the same on every start.

Every tool has a `title` and all four hints, set from its HTTP method:

| Method           | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| ---------------- | -------------- | ----------------- | ---------------- | --------------- |
| `GET`            | `true`         | `false`           | `true`           | `false`         |
| `POST`           | `false`        | `false`           | `false`          | `false`         |
| `PUT` or `PATCH` | `false`        | `true`            | `true`           | `false`         |
| `DELETE`         | `false`        | `true`            | `true`           | `false`         |

An update counts as destructive because it overwrites data that exists. `openWorldHint` is `false` because the tools reach only your Redmine instance.

Inputs take ids, not names. To find the id of a status, tracker, or priority, call `issue_statuses_list`, `trackers_list`, or `enumerations_list_issue_priorities` first. A tool's description names the list tool for each id it takes.

### Filters

List tools filter with `where`, keyed by Redmine's filter names, such as `status_id`, `assigned_to_id`, or `cf_12`. A value or an array of values means equals:

```json
{ "where": { "status_id": "open", "assigned_to_id": "me", "tracker_id": [1, 2] } }
```

An object with one operator picks another comparison: `{ "not": 3 }`, `{ "gte": "2026-10-01" }`, `{ "lte": 5 }`, `{ "between": [1, 10] }`, `{ "contains": "crash" }`, `{ "any": true }`, or `{ "none": true }`. Each filter accepts only the operators Redmine documents for it, and its description in the input schema lists them. `{ "raw": "<t-30" }` sends Redmine's own syntax unchanged, for relative dates and other rare cases. An unknown filter or an operator the filter does not take is refused before any request, with the forms the filter accepts.

### Pages

A list tool returns one page:

```json
{ "items": [], "total_count": 312, "offset": 0, "limit": 25, "next_offset": 25 }
```

`limit` is 25 by default and at most 100. To read the next page, call the tool again with `offset` set to `next_offset`. `next_offset` is `null` on the last page. Lists that Redmine returns whole, such as `issue_statuses_list`, are paged the same way.

Items in a page leave out the long fields `description`, `notes`, `text`, `comments`, `journals`, and `changesets`. Pass `detailed: true` to keep them, or call the `get` tool for one record.

### Results

A tool that returns a record, such as `issues_get` or `issues_create`, returns the record as Redmine sends it. A tool with nothing to return, such as `issues_update` or `issues_delete`, returns `{ "ok": true }`.

Every result carries the object twice: as `structuredContent`, and as compact JSON in the last text block. The tool's `outputSchema` describes it, and the server checks each result against that schema before it answers.

### Errors

A failed Redmine request comes back as a tool result with `isError: true`, never as a protocol error. The first text block says what went wrong and what to do. The last text block is the SDK's error as JSON, with a `kind` such as `validation`, `not_found`, `conflict`, `access_denied`, or `unsupported_version`.

- A 422 carries Redmine's own messages, such as `Subject cannot be blank`, in the user's language.
- A 404 says to check the ids.
- Input that does not match the schema is refused before any request. For a bad filter, the message lists the forms the filter accepts.

## Safety

- Text that Redmine users write reaches the agent unchanged. When a result contains `subject`, `description`, `notes`, `text`, or `comments`, its first text block says that the text is data and not instructions. Treat an agent that reads issues from strangers as exposed to prompt injection anyway, and run it in `read-only` mode when it does not need to write.
- `full` mode lets the agent delete issues, projects, and users. Redmine has no undo. Use `no-delete` unless the agent needs to delete.
- The server never logs the API key and sends it only in the `X-Redmine-API-Key` header.

## Embed the server

`createRedmineMcpServer` takes the same config as `createRedmine` from `@redmine-ts/sdk` and returns an MCP `Server`. Connect it to any transport:

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

`access` and `version` choose the tools exactly as the settings above do. The other options, such as `fetch`, `timeoutMs`, and `onEvent`, go to the SDK client.

## License

MIT
