# Connect a client

A local client, such as Claude Code, Codex, or Cursor, starts the server on your machine and talks to it over stdio. A client that reaches the server over the network, such as claude.ai or ChatGPT, needs the [shared HTTP server](http-and-oauth.md).

## Before you start

- Node 22 or later on the machine that runs the client.
- The REST API turned on in Redmine, under **Administration**, **Settings**, **API**.
- Your API key, from Redmine under **My account**, **API access key**.

`npx` runs the server without an install. A global install puts the command `redmine-mcp` on your `PATH`. Either way, `--help` prints every setting:

```sh
REDMINE_URL=https://tracker.example.com REDMINE_API_KEY=... npx -y @redmine-ts/mcp --help
npm install -g @redmine-ts/mcp && redmine-mcp --help
```

Put your API key in the client's own config, not in a file you share. Each example below picks an [access mode](tools.md#access-modes) with a flag. Remove the flag only when the agent must delete.

## Add the server to Claude Code

```sh
claude mcp add redmine \
  --env REDMINE_URL=https://tracker.example.com \
  --env REDMINE_API_KEY=your-key \
  -- npx -y @redmine-ts/mcp --no-delete
```

## Add the server to Codex

In `~/.codex/config.toml`:

```toml
[mcp_servers.redmine]
command = "npx"
args = ["-y", "@redmine-ts/mcp", "--no-delete"]
env = { REDMINE_URL = "https://tracker.example.com", REDMINE_API_KEY = "your-key" }
```

## Add the server to Cursor

In `.cursor/mcp.json` or `~/.cursor/mcp.json`:

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

## Check that it works

Ask the agent to call the `users_current` tool. Its result holds your Redmine login. If the server cannot start, it exits with code 2 and names the setting that is missing or wrong. [MCP server settings](configuration.md) lists every setting.

The server name, `redmine` above, is the prefix that clients put in front of the tool names, so the tools themselves carry no `redmine_` prefix.

## Connect to a shared server with your key

A [shared HTTP server](http-and-oauth.md#start-the-server) serves many people, and each request carries its own API key. Clients that can send a header connect with the server's URL and your key.

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

## Connect claude.ai and ChatGPT

claude.ai and ChatGPT reach MCP servers over the internet and sign in with OAuth, so they cannot send an API key. Run the server with OAuth at a public https URL, as [Run a shared server for claude.ai and ChatGPT](http-and-oauth.md) describes, and give each client that URL:

- In claude.ai, add a custom connector with the URL, and keep the sign-in options it detects.
- In ChatGPT, turn on developer mode and create a connector with the URL and OAuth.

Each person then allows the client on the server's consent page, signs in to Redmine, and approves Redmine's own consent page. From then on, every tool call acts as that person.

## Clients that read strict schemas

Tool schemas are JSON Schema draft 2020-12 with one `type` per schema. A value that may be `null` is an `anyOf` with a `{ "type": "null" }` branch, not `"type": ["string", "null"]`. So a client that maps tool schemas onto a dialect with one type per schema, such as Gemini's function declarations, can read them. The schemas use no `$ref`. Each input schema in `tools/list` is under 5,000 bytes of compact JSON, because Codex strips the descriptions from a larger one.
