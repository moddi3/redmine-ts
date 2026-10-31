# @redmine-ts/sdk

[![npm](https://img.shields.io/npm/v/@redmine-ts/sdk)](https://www.npmjs.com/package/@redmine-ts/sdk)

A typed TypeScript client for the [Redmine](https://www.redmine.org) REST API, for Redmine 6.1 and 7.0, with no runtime dependencies. Use it to script a Redmine instance, sync it with another system, or build tools and agents on top of it.

## Install

```sh
npm install @redmine-ts/sdk
```

You need:

- Node 22 or later, or Bun. Browsers work through a proxy, untested.
- `import`, not `require`. The package is ESM only.
- Redmine 6.1 or 7.0 with the REST API turned on, and credentials such as your API key from **My account**.

[Compatibility](https://github.com/moddi3/redmine-ts/blob/main/docs/compatibility.md) lists the Redmine versions and runtimes that CI checks.

## Quickstart

```ts
import { createRedmine } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

const issue = await rm.issues.get({ issue_id: 42, include: ["journals"] });
console.log(issue.subject, `${issue.journals.length} journal entries`);

for await (const open of rm.issues.list({
  where: {
    project_id: "web",
    status_id: "open",
    assigned_to_id: "me",
    updated_on: { gte: "2026-10-01" },
  },
  sort: "updated_on:desc",
})) {
  console.log(`#${open.id} ${open.subject}`);
}
```

`createRedmine` validates the config and sends nothing. The client sends the API key only in the `X-Redmine-API-Key` header, never in the URL. [Configure the client](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/configuration.md) covers the other ways to sign in, the server version, and retries.

## What it handles

Redmine ignores a filter it does not know, so a typo in a filter name returns the unfiltered list. Redmine also ignores the switch-user header on a key that is not an admin's, and saves the write under the key's own user. This client refuses an unknown filter before any request, and checks that a key is an admin's before it acts as another user.

- **Mistakes fail to compile.** A filter operator the field does not take is a type error. So are a method newer than the server version you declare and a write on a client you declare read-only. See [Filter lists with `where`](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/queries.md#filter-lists-with-where), [Declare the server version](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/configuration.md#declare-the-server-version), and [Restrict the client to reads](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/configuration.md#restrict-the-client-to-reads).
- **A retry never adds anything twice.** The client retries `GET` and `DELETE` after a timeout, a network error, or a 502, 503, or 504. It retries `POST`, `PUT`, and `PATCH` only after a 429, so a `PUT` with `notes` that timed out cannot add its journal entry twice.
- **Keyset paging for issues.** `paging: "keyset"` walks issues by id, so issues created or deleted during the walk do not shift the pages. Any walk that gets the same page twice stops with an error instead of a loop.
- **Uploads you can retry.** One call uploads the files in `uploads` and attaches them. When it fails after its checks, `error.uploads` holds the references Redmine already acknowledged, so a retry skips those files.
- **A catalog for tool layers.** `@redmine-ts/sdk/catalog` describes every method as JSON Schema. [`@redmine-ts/mcp`](https://www.npmjs.com/package/@redmine-ts/mcp) builds its tools from it.

The client also handles base URLs under a subpath, empty `PUT` and `DELETE` responses, localized `422` errors, offsets that drift while paging, and two-step uploads. Its types and operations are generated from the community [Redmine OpenAPI spec](https://github.com/d-yoshi/redmine-openapi), and CI runs contract tests against real Redmine 6.1 and 7.0 servers. The client talks to Redmine through the platform `fetch`.

## Documentation

| Task                                                     | Page                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Get records, filter lists, and walk pages                | [Read data](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/queries.md)                  |
| Create and update records, and attach files              | [Create and update records](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/writes.md)   |
| Set credentials, the server version, access, and retries | [Configure the client](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/configuration.md) |
| Tell failures apart and recover from them                | [Handle errors](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/errors.md)               |
| Look up namespaces, types, raw requests, and the catalog | [SDK reference](https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/reference.md)            |
| Check the supported Redmine versions and runtimes        | [Compatibility](https://github.com/moddi3/redmine-ts/blob/main/docs/compatibility.md)            |

## Acknowledgements

The types and operations in this package are generated from [redmine-openapi](https://github.com/d-yoshi/redmine-openapi) by [d-yoshi](https://github.com/d-yoshi), an unofficial OpenAPI 3.0.3 description of the Redmine REST API released under the MIT license. This release uses its tags `6.1.3-r1` and `7.0.2-r1`.

If a field or operation looks wrong, the cause is most likely in the spec. Please report it at [d-yoshi/redmine-openapi/issues](https://github.com/d-yoshi/redmine-openapi/issues), and open an issue at [moddi3/redmine-ts/issues](https://github.com/moddi3/redmine-ts/issues) so the SDK picks up the fix.

## License

MIT
