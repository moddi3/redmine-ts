# MCP server settings

The server reads its settings once at startup. A missing or invalid value stops it with exit code 2 and a message that names the setting. The message never prints the URL or the API key, so a key pasted into the wrong variable does not end up in a log. `redmine-mcp --help` prints the same settings.

## Environment variables

| Environment variable           | Required | Meaning                                                                                                                                                                                                                     |
| ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDMINE_URL`                  | Yes      | The base URL, subpath included, such as `https://example.com/redmine`. http or https only.                                                                                                                                  |
| `REDMINE_API_KEY`              | stdio    | The API key of the Redmine user that every tool acts as. Not read with `--http`.                                                                                                                                            |
| `REDMINE_VERSION`              | No       | `6.1` or `7.0`. A patch version such as `7.0.1` is read as `7.0`.                                                                                                                                                           |
| `REDMINE_MCP_ACCESS`           | No       | `full` (the default), `no-delete`, or `read-only`.                                                                                                                                                                          |
| `REDMINE_MCP_FILES_DIR`        | No       | A directory the server may read uploads from and save attachments to. It must exist. Without it, no tool touches local files. Not read with `--http`. See [Attach and save files](workflow-tools.md#attach-and-save-files). |
| `REDMINE_MCP_MAX_RESULT_BYTES` | No       | Bytes of JSON at which list tools, `issue_context`, `issues_get` and `raw_request` stop filling a result, 32,000 by default, from 1,000 to 499,000. See [Result size](tools.md#result-size).                                |

## Flags

When a flag and `REDMINE_MCP_ACCESS` both set the access mode, the strictest one wins.

| Flag                                | Meaning                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--read-only`                       | Same as `REDMINE_MCP_ACCESS=read-only`.                                                                                                                          |
| `--no-delete`                       | Same as `REDMINE_MCP_ACCESS=no-delete`.                                                                                                                          |
| `--dangerously-reveal-api-keys`     | Returns API keys as Redmine sends them. Over stdio only. See [API keys](security.md#api-keys).                                                                   |
| `--http`                            | Serves Streamable HTTP at `/mcp` instead of stdio.                                                                                                               |
| `--port <n>`                        | The HTTP port, 3737 by default. `0` picks a free port.                                                                                                           |
| `--host <addr>`                     | The address to listen on, `127.0.0.1` by default.                                                                                                                |
| `--allow-origin <hostname\|origin>` | Admits browser requests from a hostname or an exact origin and sends them CORS headers. Repeat it for more. See [CORS](http-server.md#browser-clients-and-cors). |
| `--allow-host <hostname>`           | Accepts this hostname in `Host`, for a proxy that keeps the client's `Host`. Repeat it for more. Off loopback, it turns the `Host` check on.                     |
| `--api-key-login`                   | OAuth without a Redmine application: the consent page asks for the API key. See [API key sign-in](authentication.md#api-key-sign-in).                            |
| `--allow-client <hostname>`         | Admits only OAuth clients on this host. Repeat it for more. See [Limit sign-ins](authentication.md#limit-sign-ins-with---allow-client).                          |
| `--help`                            | Prints the settings and exits.                                                                                                                                   |

`--port`, `--host`, `--allow-origin`, `--allow-host`, `--api-key-login` and `--allow-client` need `--http`. `--allow-origin`, `--allow-host` and `--allow-client` match each name exactly, so a value with `*` stops the server at startup. Their options in [`createRedmineMcpHandler`](embedding.md), `allowedOrigins`, `allowedHosts` and `oauth.allowedClientHosts`, throw a `TypeError` for an entry with `*` when the handler is created.

## OAuth settings

[OAuth](authentication.md) adds `REDMINE_MCP_PUBLIC_URL`, `REDMINE_MCP_AUTH_SECRET`, `REDMINE_MCP_AUTH_PREVIOUS_SECRET`, `REDMINE_OAUTH_CLIENT_ID`, `REDMINE_OAUTH_CLIENT_SECRET` and `REDMINE_PUBLIC_URL`, for `--http` only. `REDMINE_MCP_PUBLIC_URL` alone serves the endpoint at its path, without OAuth. The others need `REDMINE_MCP_AUTH_SECRET`, and the server refuses to start when they do not fit together. Their values are never printed.

| Environment variable               | Meaning                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDMINE_MCP_PUBLIC_URL`           | The URL people give their client, such as `https://mcp.example.com/mcp` or `https://tracker.example.com/mcp`, in its canonical form: lowercase host, no default port, no trailing slash. The metadata names it as written, and clients compare it exactly. With OAuth it must be https, except on `localhost`. The server never guesses it from `Host` or `X-Forwarded-*`. |
| `REDMINE_MCP_AUTH_SECRET`          | Turns OAuth on. At least 32 random characters, such as the output of `openssl rand -base64 32`, never a passphrase. Keep it secret: it protects every token.                                                                                                                                                                                                               |
| `REDMINE_MCP_AUTH_PREVIOUS_SECRET` | Optional: the secret before the last change. See [Change the secret](authentication.md#change-the-secret).                                                                                                                                                                                                                                                                 |
| `REDMINE_OAUTH_CLIENT_ID`          | The Redmine application's UID.                                                                                                                                                                                                                                                                                                                                             |
| `REDMINE_OAUTH_CLIENT_SECRET`      | The Redmine application's secret.                                                                                                                                                                                                                                                                                                                                          |
| `REDMINE_PUBLIC_URL`               | Optional: Redmine's URL as browsers reach it, when `REDMINE_URL` is an internal address such as `http://localhost:3000`. Sign-in sends browsers there; token requests and the REST API keep using `REDMINE_URL`. Default: `REDMINE_URL`.                                                                                                                                   |
