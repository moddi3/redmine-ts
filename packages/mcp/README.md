# @redmine-ts/mcp

An MCP server for the Redmine REST API. It exposes one tool per operation of [`@redmine-ts/sdk`](../sdk), 86 in all, and serves them over stdio or Streamable HTTP. Every tool has a JSON Schema for its input and its output, and annotations that tell the client whether it reads, writes, or deletes.

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

## Serve over HTTP

With `--http`, one server serves Streamable HTTP at `/mcp` for many users. Each request carries its user's API key in the `X-Redmine-API-Key` header, and the server answers it with a fresh MCP server for that key. `REDMINE_URL` is fixed at startup, so a client cannot point the server at another host. The server does not read `REDMINE_API_KEY` in this mode; when it is set, the server says once on stderr that it ignores it.

```sh
REDMINE_URL=https://tracker.example.com node packages/mcp/dist/cli.mjs --http --no-delete
# redmine-mcp: serving MCP at http://127.0.0.1:3737/mcp
```

The server speaks the 2026-07-28 protocol, and serves clients on the 2025 revisions without sessions: each request stands alone, and `GET` and `DELETE` on `/mcp` answer 405. The access mode and `REDMINE_VERSION` apply to every request, as they do over stdio. `SIGINT` or `SIGTERM` lets requests in flight finish and then stops the server; a second signal stops it at once.

| Request                                                   | Answer                                                    |
| --------------------------------------------------------- | --------------------------------------------------------- |
| No `X-Redmine-API-Key` header, or an empty one            | 401, with a JSON-RPC error that names the header.         |
| An `Origin` whose hostname `--allow-origin` does not list | 403.                                                      |
| A `Host` other than localhost, on a loopback address      | 403.                                                      |
| A path other than `/mcp`                                  | 404.                                                      |
| A key Redmine rejects                                     | The tool call returns an error result with Redmine's 401. |

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
- On a loopback address, the `Host` header must name `localhost`, `127.0.0.1`, `[::1]`, or the address itself. A web page that rebinds its own domain to your machine sends its domain as `Host`, so the server refuses it.
- A request with an `Origin` header gets 403 unless `--allow-origin` lists its hostname. Browsers send `Origin`; command-line and desktop clients do not, so they pass. The check compares hostnames only, as the MCP SDK does, so `--allow-origin app.example.com` also admits `http://app.example.com:8080`. The server sends no CORS headers, so a web page on another origin cannot call it even when its hostname is listed.
- The server speaks plain HTTP. Without TLS, the API key crosses the network in clear text, so for remote use put a proxy that terminates TLS in front of the server and keep the server on loopback. Caddy passes the client's `Host` to the server unless told otherwise:

```caddy
mcp.example.com {
	reverse_proxy 127.0.0.1:3737 {
		header_up Host {upstream_hostport}
	}
}
```

## Settings

The server reads its settings once at startup. A missing or invalid value stops it with exit code 2 and a message that names the setting. The message never prints the URL or the API key, so a key pasted into the wrong variable does not end up in a log.

| Environment variable | Required | Meaning                                                                                    |
| -------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `REDMINE_URL`        | Yes      | The base URL, subpath included, such as `https://example.com/redmine`. http or https only. |
| `REDMINE_API_KEY`    | stdio    | The API key of the Redmine user that every tool acts as. Not read with `--http`.           |
| `REDMINE_VERSION`    | No       | `6.1` or `7.0`. A patch version such as `7.0.1` is read as `7.0`.                          |
| `REDMINE_MCP_ACCESS` | No       | `full` (the default), `no-delete`, or `read-only`.                                         |

| Flag                        | Meaning                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `--read-only`               | Same as `REDMINE_MCP_ACCESS=read-only`.                                       |
| `--no-delete`               | Same as `REDMINE_MCP_ACCESS=no-delete`.                                       |
| `--http`                    | Serves Streamable HTTP at `/mcp` instead of stdio.                            |
| `--port <n>`                | The HTTP port, 3737 by default. `0` picks a free port.                        |
| `--host <addr>`             | The address to listen on, `127.0.0.1` by default.                             |
| `--allow-origin <hostname>` | Admits browser requests whose `Origin` has this hostname. Repeat it for more. |
| `--help`                    | Prints the settings and exits.                                                |

`--port`, `--host`, and `--allow-origin` need `--http`.

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

`createRedmineMcpHandler` takes the same config without `auth` and returns a web-standard `(request: Request) => Promise<Response>`, which is the HTTP server of `--http` without the port. It reads the key from each request's `X-Redmine-API-Key` header, uses no Node APIs, and runs unchanged on Node, Bun, and Cloudflare Workers, without the `nodejs_compat` flag. It serves every path it receives, so route `/mcp` to it. `allowedOrigins` and `allowedHosts` take hostnames, as `--allow-origin` does. Set `allowedHosts` when you listen on loopback; without it the handler does not check `Host`.

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

## License

MIT
