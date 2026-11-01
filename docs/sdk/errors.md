# Handle errors

Every failure is a `RedmineError`. This page shows how to tell failures apart, how to recover from a stale edit, and what an error holds. The examples use a client `rm` made as in the [quickstart](../../packages/sdk/README.md#quickstart), and this import:

```ts
import { createRedmine, RedmineError } from "@redmine-ts/sdk";
```

## Tell failures apart

`error.data` is a union keyed by `kind`, and `RedmineError.is(error, kind)` narrows it:

```ts
try {
  await rm.issues.update({ issue_id: 42, subject: "" });
} catch (error) {
  if (RedmineError.is(error, "validation")) {
    console.error(error.data.messages.join("\n"));
  } else if (RedmineError.is(error, "not_found")) {
    console.error(`Issue 42 is gone or hidden from this user (request ${error.request_id})`);
  } else {
    throw error;
  }
}
```

## Resolve a stale edit

A stale edit is a `conflict`. Pass the `version` you read when you update a wiki page. If someone saved in between, the update fails and the page keeps the other edit:

```ts
try {
  await rm.wiki.update({
    project_id: "web",
    wiki_page_title: "Runbook",
    text: "Restart the worker first.",
    version: 7,
  });
} catch (error) {
  if (!RedmineError.is(error, "conflict")) throw error;
  const latest = await rm.wiki.get({ project_id: "web", wiki_page_title: "Runbook" });
  console.error(`Someone saved version ${latest.version} first, merge your change into it`);
}
```

An issue carries a `lock_version` that Redmine checks, but the API never returns it, so most callers never send one. If you pass it through `rm.request`, a stale value is a `conflict` with `data.status` 422. Any other 422 with no messages stays `validation`.

## Error kinds

| `kind`                   | Cause                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validation`             | 422. `data.messages` are in the API user's language. Show them, and do not match on them.                                                        |
| `conflict`               | A stale edit. 409 for a wiki `version`, or a 422 with no messages when the request carried `lock_version`. Re-read and merge.                    |
| `unauthorized`           | 401.                                                                                                                                             |
| `forbidden`              | 403. A disabled REST API also answers 403.                                                                                                       |
| `not_found`              | 404. `data.hint` explains a likely cause when the client knows one.                                                                              |
| `switch_user_rejected`   | `data.reason` is `"not_admin"`: the key is not an admin's, so nothing was sent. See [Act as another user](configuration.md#act-as-another-user). |
| `switch_user_rejected`   | `data.reason` is `"rejected_by_server"`: Redmine answered 412 because the login is unknown or inactive.                                          |
| `not_acceptable`         | 406.                                                                                                                                             |
| `http`                   | Any other status. `data.body` holds up to 2 KiB of the response.                                                                                 |
| `protocol`               | The response does not match the operation, such as a body that is not JSON or a page that repeats. `data.hint` names the cause.                  |
| `network`                | `fetch` threw.                                                                                                                                   |
| `timeout`                | An attempt ran longer than `timeoutMs`.                                                                                                          |
| `aborted`                | Your `signal` aborted the call.                                                                                                                  |
| `unsupported_version`    | The declared `version` lacks the operation. Nothing was sent.                                                                                    |
| `access_denied`          | `data.access` refuses the HTTP method in `data.method`, or an update that deletes what `data.deletes` says. Nothing was changed.                 |
| `invalid_input`          | Bad config, an unknown filter, or conflicting paging options. Nothing was sent.                                                                  |
| `transition_not_allowed` | `issues.transition` asked for a status the workflow does not allow.                                                                              |

## What an error holds

Errors and `onEvent` events never contain credentials. `JSON.stringify(error)` gives `name`, `message`, `op`, `request_id`, and the `data` fields, and leaves out `cause`.
