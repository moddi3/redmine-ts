# Configure the client

`createRedmine` takes one config object. This page covers its parts: credentials, the server version, the access mode, acting as another user, retries and timeouts, and `fetch`. `createRedmine` validates the config and sends nothing.

## Authenticate

`auth` takes one of three forms:

| `auth`                           | What the client sends                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ apiKey }`                     | The `X-Redmine-API-Key` header. The key never goes in the URL.                                                                                                               |
| `{ basic: { login, password } }` | `Authorization: Basic`. A login that is empty or contains `:` throws `invalid_input`.                                                                                        |
| `{ bearer }`                     | `Authorization: Bearer` with an OAuth access token, which Redmine 6.1 and later accept. `bearer` is a token string, or an object with `token()` and an optional `refresh()`. |

The client keeps the `/redmine` subpath of `baseUrl` in every request URL. The next client signs in with a login and password:

```ts
const withPassword = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { basic: { login: "jsmith", password: process.env.REDMINE_PASSWORD! } },
});
console.log((await withPassword.users.current()).login);
```

With OAuth, `token()` returns the current access token and `refresh()` gets a new one. Here `renewAccessToken` stands for your own code that gets a new token:

```ts
declare function renewAccessToken(): Promise<string>;
let accessToken = process.env.REDMINE_ACCESS_TOKEN!;

const withOAuth = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: {
    bearer: {
      token: () => accessToken,
      refresh: async () => {
        accessToken = await renewAccessToken();
        return accessToken;
      },
    },
  },
});
console.log((await withOAuth.users.current()).login);
```

After a 401, the client calls `refresh()`, when `bearer` has one, and sends the request once more with the new token. Requests that fail at the same time share one `refresh()` call. A `ReadableStream` body can be read only once, so after a 401 on such a request the client neither calls `refresh()` nor sends the request again. If `refresh()` throws, the call fails with `unauthorized`, and the error's `cause` is what `refresh()` threw.

## Declare the server version

Redmine does not report its version over the API. Declaring it with `version` is optional:

- Without `version`, the client offers every operation it knows and sends every call. If an operation is newer than the server, Redmine answers 404, and the error's `hint` names the likely cause.
- With a literal such as `version: "6.1"`, calling an operation added after 6.1 does not compile. At runtime, the client refuses such a call with `unsupported_version` before any request.
- With a version read from config, `parseRedmineVersion` turns `"7.0.1"` into `"7.0"` and throws `invalid_input` for an unsupported version. The client type then offers every operation, and the runtime refusal still applies.

```ts
import { createRedmine, parseRedmineVersion, RedmineError } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: process.env.REDMINE_URL!,
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  version: parseRedmineVersion(process.env.REDMINE_VERSION ?? "7.0"),
});

try {
  await rm.groups.removeUsers({ group_id: 3, user_ids: [7, 9] });
} catch (error) {
  if (!RedmineError.is(error, "unsupported_version")) throw error;
  for (const user_id of [7, 9]) await rm.groups.removeUser({ group_id: 3, user_id });
}

const legacy = createRedmine({
  baseUrl: "https://legacy-tracker.example.com",
  auth: { apiKey: process.env.LEGACY_API_KEY! },
  version: "6.1",
});

// @ts-expect-error removeUsers exists since Redmine 7.0; this client declared 6.1
await legacy.groups.removeUsers({ group_id: 3, user_ids: [7, 9] });
```

### Why one entrypoint serves every version

There is one entrypoint for all supported versions, not `@redmine-ts/sdk/6.1` and `@redmine-ts/sdk/7.0`. From 6.1 to 7.0, the spec added one operation and four properties. Per-version modules would duplicate every type to express that difference, and every server upgrade would change your imports. A property that only newer servers return is optional and tagged `@since` in its JSDoc. [Architecture](../architecture.md#version-strategy-one-superset-optional-declared-version) has the measurements behind this choice.

## Restrict the client to reads

`access` limits the HTTP methods the client sends. Use it for scripts, dashboards, and agents that hold a key with write access but must never change data:

| `access`           | Sends                          |
| ------------------ | ------------------------------ |
| `"full"` (default) | Every method.                  |
| `"no-delete"`      | `GET`, `POST`, `PUT`, `PATCH`. |
| `"read-only"`      | `GET` only.                    |

```ts
import { createRedmine, RedmineError, type Access } from "@redmine-ts/sdk";

const reader = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  access: "read-only",
});

console.log(`${await reader.issues.list({ where: { status_id: "open" } }).count()} open issues`);

// @ts-expect-error a read-only client has no update
await reader.issues.update({ issue_id: 42, notes: "Never sent." });

const agent = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  access: (process.env.REDMINE_ACCESS ?? "read-only") as Access,
});

try {
  await agent.issues.update({ issue_id: 42, notes: "Sent unless the access refuses it." });
} catch (error) {
  if (!RedmineError.is(error, "access_denied")) throw error;
  console.error(`${error.data.method} refused, the client is ${error.data.access}`);
}
```

### What `no-delete` refuses

- `"no-delete"` also refuses an update that would make Redmine delete records. Such an update sends blank journal `notes`, `deleted_attachment_ids` on an issue or a wiki page, or membership `role_ids` that name none of the membership's current roles. The client checks the request as it would go to Redmine, so it refuses `rm.request` calls to those routes too.
- For a membership update with roles in `role_ids`, the client first reads the membership with one `GET`. Redmine silently drops the roles that the key cannot manage, and the API does not list those roles. So only a role that the membership has now is sure to stay. A failed read fails the call with the read's error. To swap roles, send the new roles with one current role, then send the new roles alone.

### How the client type follows the mode

- With a literal such as `access: "read-only"`, the client type has only the methods that send what the mode allows, so a write on a read-only client does not compile. `rm.request` takes only the allowed `method` values.
- With an `access` value read from config and typed `Access`, the client type has every method, and the runtime refusal below still applies.

### What the client refuses at runtime

At runtime, whatever the client's type says, the client refuses any other request with `access_denied` before it sends anything. `createRedmine` throws `invalid_input` for an unknown mode. The rule covers every namespace method, listings, the hand-written methods, and `rm.request`. For `rm.request`, the client checks the `method` you pass. `issues.transition` reads the issue and then updates it, so a read-only client refuses the call before the read. A read-only client's type also has no `transition`. `attachments.upload` is a `POST`. A create or update with files in `uploads` also sends a `POST` for each file. The client refuses the whole call before the first upload when the mode does not allow one of the two methods, or when the update would delete. A client derived with `with` keeps its parent's `access`, and its type keeps it too.

## Act as another user

With an admin API key, Redmine runs a request as another user when the request carries `X-Redmine-Switch-User`. Pass `as` for one call, or derive a client with `with`:

```ts
await rm.timeEntries.create(
  { issue_id: 42, hours: 1.5, activity_id: 9, comments: "Triage" },
  { as: "jsmith" },
);

const asJsmith = rm.with({ as: "jsmith" });
try {
  await asJsmith.issues.update({ issue_id: 42, notes: "Picked up by jsmith." });
} catch (error) {
  if (!RedmineError.is(error, "switch_user_rejected")) throw error;
  console.error(
    error.data.reason === "not_admin"
      ? "This API key does not belong to an admin, so it cannot act as another user"
      : `Cannot act as ${error.data.login}: no such active user`,
  );
}
```

A derived client shares the parent's `maxConcurrent` limit. `with` accepts any call option, so `rm.with({ timeoutMs: 5000 })` works too.

### How the client checks the key

Only an admin key can switch users. Redmine ignores the header on a non-admin key and runs the request as the key's own user, with no error. Redmine would then save a write under the wrong author, so the client checks the key first. Before the first request that carries `as`, the client sends `GET users/current.json` without `as` and reads `admin` from the answer. If the key is not an admin's, the call fails with `switch_user_rejected` and `data.reason` `"not_admin"`, and the client sends nothing as the other user.

That check is one extra request per client. Clients derived through `with` share it, and calls that start at the same time wait for the same check. The client keeps the answer for its lifetime, so a key that changes role later needs a new client. A check that fails, for example on a 401 or a network error, throws that error, and the client repeats the check on the next call. `onEvent` reports the check as a `getCurrentUser` request. A login that Redmine does not know fails with `"rejected_by_server"`.

## Set retries, timeouts, and concurrency

| Option           | Default | Meaning                                                               |
| ---------------- | ------- | --------------------------------------------------------------------- |
| `timeoutMs`      | 30000   | Time limit for each attempt.                                          |
| `maxConcurrent`  | 4       | Requests in flight per client, shared with clients derived by `with`. |
| `retry.attempts` | 2       | Extra attempts after the first.                                       |
| `retry.baseMs`   | 250     | Base of the exponential backoff with full jitter.                     |
| `retry.maxMs`    | 5000    | Cap for one backoff delay and for `Retry-After`.                      |

```ts
const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  timeoutMs: 10_000,
  maxConcurrent: 8,
  retry: { attempts: 4, maxMs: 10_000 },
  onEvent: (event) => {
    if (event.type === "retry") console.warn(`${event.op}: retry in ${event.delay_ms} ms`);
  },
});

const users = await rm.users
  .list({ where: { status: 1 } }, { signal: AbortSignal.timeout(60_000), retry: false })
  .all();
```

### Which failures the client retries

The client retries a 429 for every method. It retries 502, 503, 504, network errors, and timeouts only for `GET` and `DELETE`. After those failures, a `POST`, `PUT`, or `PATCH` may already have reached Redmine. Redmine has no idempotency key, so a replayed `PUT` with `notes` would add the journal entry twice. The client never retries a request whose body is a `ReadableStream`, because a stream can be read only once. `retry: false` turns retries off.

### Options for one call

Every method takes call options as its second argument: `signal`, `timeoutMs`, `retry`, `as`, and `onResponse`. `onResponse` gets the status of each response the call receives, retries included, so the last one is the response the call resolved with. `onEvent` receives `request`, `response`, `retry`, and `error` events.

## Bring your own fetch

The `fetch` option replaces `globalThis.fetch` for every request the client sends. Use it to add gateway headers, route through a proxy, or test your code without a server:

```ts
const throughGateway: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("X-Gateway-Token", process.env.GATEWAY_TOKEN!);
  return fetch(input, { ...init, headers });
};
```

```ts
const sent: { method: string; url: string }[] = [];
const fakeRedmine: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  sent.push({ method: request.method, url: request.url });
  return Response.json({ issue: { id: 42, subject: "Stubbed issue" } });
};

const test = createRedmine({ baseUrl: "https://redmine.test", fetch: fakeRedmine });
const issue = await test.issues.get({ issue_id: 42 });
// sent: [{ method: "GET", url: "https://redmine.test/issues/42.json" }]
```

To use an HTTP proxy in Node, pass the `fetch` from [undici](https://github.com/nodejs/undici) with a `ProxyAgent` dispatcher.

## Call Redmine from a browser

Browsers are not tested. Redmine sends no CORS headers, and anyone who opens the developer tools can read an API key in a browser. Pass a `fetch` that sends each request to a proxy on your origin, and let the proxy add the key on the server.

[Compatibility](../compatibility.md#runtimes) lists the runtimes that CI checks.
