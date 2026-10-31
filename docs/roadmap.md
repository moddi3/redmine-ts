# Roadmap

This page lists what is planned, what is limited today, and what is done, so that no idea is lost. Each item says why it matters and where the idea comes from. [Architecture](architecture.md) describes the current design.

- **Next** items come first. **Later** items wait for a need or for an upstream release.
- **Limitation** items describe what the packages do not do today. Each links to the page that explains it in full. A limitation is not a plan until an item under Next or Later covers it.
- **Done** items record finished work and link to the decisions behind it.

The MCP items share the background in [MCP server package](#mcp-server-package).

## Overview

| Status                                  | Item                                                                                                | Area         | Tracking                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| Next                                    | [Read the method list of a metadata document](#read-the-method-list-of-a-metadata-document)         | MCP          |                                |
| Next                                    | [A stricter `aud`](#a-stricter-aud)                                                                 | MCP          |                                |
| Next                                    | [Big single results](#big-single-results)                                                           | MCP          | #78                            |
| Next                                    | [Smaller tool schemas](#smaller-tool-schemas)                                                       | MCP          |                                |
| Next                                    | [Issue fields upstream](#issue-fields-upstream)                                                     | SDK          | #65, d-yoshi/redmine-openapi#9 |
| Next, partly done in MCP                | [Curated triage toolset](#curated-triage-toolset)                                                   | Toolkit      |                                |
| Next                                    | [`gen` CLI for an instance config](#gen-cli-for-an-instance-config)                                 | SDK          |                                |
| Next                                    | [Follow-ups found while building](#follow-ups-found-while-building)                                 | MCP, SDK     |                                |
| Limitation                              | [Revocation in a real client](#revocation-in-a-real-client)                                         | MCP          |                                |
| Limitation                              | [Bodies that keep growing](#bodies-that-keep-growing)                                               | MCP          |                                |
| Limitation                              | [Per-client revocation](#per-client-revocation)                                                     | MCP          |                                |
| Limitation                              | [A list of connected clients](#a-list-of-connected-clients)                                         | MCP          |                                |
| Limitation                              | [The CLI forgets used tokens on restart](#the-cli-forgets-used-tokens-on-restart)                   | MCP          |                                |
| Limitation                              | [No deployment image](#no-deployment-image)                                                         | MCP          |                                |
| Limitation                              | [Workers outside CI](#workers-outside-ci)                                                           | MCP          |                                |
| Limitation                              | [No measure of agent success](#no-measure-of-agent-success)                                         | MCP          |                                |
| Later                                   | [After OAuth](#after-oauth)                                                                         | MCP          |                                |
| Later                                   | [A stale key set while the fetch slots are full](#a-stale-key-set-while-the-fetch-slots-are-full)   | MCP          |                                |
| Later                                   | [Evals](#evals)                                                                                     | MCP          |                                |
| Later                                   | [Write allowlists and MCP Registry listing](#write-allowlists-and-mcp-registry-listing)             | MCP          |                                |
| Later                                   | [Redmine plugin: MCP at the tracker's own address](#redmine-plugin-mcp-at-the-trackers-own-address) | Plugin       |                                |
| Later                                   | [Webhook verification for Redmine 7.0](#webhook-verification-for-redmine-70)                        | SDK          |                                |
| Later                                   | [Redmine 7.1](#redmine-71)                                                                          | SDK          |                                |
| Later, only on demand                   | [Redmine 6.0](#redmine-60)                                                                          | SDK          |                                |
| Later                                   | [Optional response validation](#optional-response-validation)                                       | SDK          |                                |
| Later                                   | [`/testing` entrypoint](#testing-entrypoint)                                                        | SDK          |                                |
| Later                                   | [Effect entrypoint](#effect-entrypoint)                                                             | Effect       |                                |
| Later                                   | [Text formatting as config](#text-formatting-as-config)                                             | SDK, toolkit |                                |
| Later                                   | [Spec-diff bot](#spec-diff-bot)                                                                     | Tooling      |                                |
| Done, include and exclude patterns open | [Read-only mode and tool hints](#read-only-mode-and-tool-hints)                                     | SDK, MCP     |                                |
| Done                                    | [Phase 2: generated tools](#phase-2-generated-tools)                                                | MCP          |                                |
| Done                                    | [Phase 3: workflow tools](#phase-3-workflow-tools)                                                  | MCP          |                                |
| Done                                    | [Phase 4: Streamable HTTP](#phase-4-streamable-http)                                                | MCP          |                                |
| Done                                    | [Phase 5: public package](#phase-5-public-package)                                                  | MCP          |                                |
| Done                                    | [CORS](#cors)                                                                                       | MCP          |                                |
| Done                                    | [Portable schemas](#portable-schemas)                                                               | MCP          |                                |
| Done                                    | [OAuth](#oauth)                                                                                     | MCP          |                                |
| Done                                    | [OAuth walkthrough](#oauth-walkthrough)                                                             | MCP          |                                |
| Done                                    | [Real clients](#real-clients)                                                                       | MCP          |                                |
| Done                                    | [private_key_jwt](#private_key_jwt)                                                                 | MCP          | #46                            |
| Done                                    | [Metadata fetches (Fable I8)](#metadata-fetches-fable-i8)                                           | MCP          |                                |
| Done                                    | [401 and 403 inside a request (Codex M8)](#401-and-403-inside-a-request-codex-m8)                   | MCP          |                                |
| Done                                    | [Loose `where`](#loose-where)                                                                       | MCP          | #56                            |
| Done                                    | [People by name](#people-by-name)                                                                   | MCP          | #58                            |
| Done                                    | [Admin tools by key](#admin-tools-by-key)                                                           | MCP          | #93                            |
| Done                                    | [Short issue items](#short-issue-items)                                                             | MCP          | #57                            |
| Done                                    | [Result budget](#result-budget)                                                                     | MCP          | #52                            |
| Done                                    | [After phase 4](#after-phase-4)                                                                     | MCP          |                                |
| Done                                    | [Unauthenticated body reads](#unauthenticated-body-reads)                                           | MCP          |                                |
| Done                                    | [Authenticated stalls](#authenticated-stalls)                                                       | MCP          |                                |
| Done in MCP                             | [Journal details as a readable diff](#journal-details-as-a-readable-diff)                           | MCP          |                                |
| Done                                    | [Inline uploads in create and update](#inline-uploads-in-create-and-update)                         | SDK          |                                |

## Next

### Read the method list of a metadata document

OpenAI calls the single `token_endpoint_auth_method` field transitional, after MCP SEP-3149. A document without it is read as public today, so ChatGPT's assertion would then get 401. When the single field is missing, the server should read the document's list of methods.

### A stricter `aud`

ChatGPT sends the token endpoint, so the check keeps accepting it, as RFC 7523 allows. An array that also names another audience passes today. draft-ietf-oauth-rfc7523bis asks for one value, so refuse an array that names anything besides the issuer or the token endpoint.

### Big single results

`issues_get` with journals and `raw_request` still return all that Redmine sends, up to 900K characters.

### Smaller tool schemas

Output schemas are 80K of the 200K characters of a full-access listing, and descriptions 27K. Clients without tool search pay that in every session. A tool profile, such as the workflow tools and the REST tools agents use most, would help clients that load every tool. The evals below then check that tool choice does not get worse.

### Issue fields upstream

`@redmine-ts/sdk` 0.6.0 marks an issue's `project`, `tracker`, `status`, `priority` and `author`, and `parent.id`, as always set, through `overlay.corrections`, because the vendored spec leaves them optional. Generation fails once a correction stops changing the merged spec, so an upstream fix forces its removal. Filed upstream as d-yoshi/redmine-openapi#9, with the change in d-yoshi/redmine-openapi#10; the corrections go once a release with it is vendored.

### Curated triage toolset

About a hundred generated tools are too much context for an agent. A small set covers triage: `issue_context`, `search_issues`, `find_similar`, `propose_update` (a dry run that shows the diff and checks the status transition), `apply_update`, `add_note`, `link_issues`, and `log_time`. Inputs and outputs use names instead of ids, because models handle "In Progress" reliably and `status_id: 7` poorly. Name-to-id resolution lives in the toolkit over cached lookups, not in the SDK. The toolkit returns plain tool descriptors (name, description, input schema, annotations, and handler), so an MCP server, the Vercel AI SDK, or a custom agent can register them. The adapter for each framework is a thin entrypoint with an optional peer dependency. The toolkit's write policy has project, tracker, and field allowlists, a cap on writes per run, an approval hook that asks a person before a write, and an audit hook. Source: the owner's original research, and "Tradeoffs accepted" in `docs/architecture.md`.

Done in `@redmine-ts/mcp`: `issue_context`, name-to-id lookups in `reference_data` (cached for 5 minutes), `people_find` for logins by name, and status changes by name in `issues_transition`, which uses the SDK's `rm.issues.transition`: it reads the issue's allowed statuses and refuses a transition they do not include before it sends the update. Open: `search_issues`, `find_similar`, `propose_update`, a name-based `apply_update`, and `add_note`, `link_issues` and `log_time` as tools of their own; today those go through the generated, id-based `issues_update`, `relations_create` and `time_entries_create`.

### `gen` CLI for an instance config

A command that reads an instance with an admin key and writes a config with literal types: custom field names mapped to `cf_<id>` with their formats and possible values, and the instance's statuses, trackers, and priorities. With that config, filters can read `cf.severity` instead of `cf_12`. Custom field definitions are visible only to admins, so the CLI also accepts a hand-written config of the same shape. Source: the owner's original research.

### Follow-ups found while building

Expose filter value words (such as `open`) in the SDK catalog so the server does not infer them; resolve the SDK for tests with tsdown's dev exports instead of tsconfig paths; shorten the longest tool descriptions. The two SDK bugs phase 3 found, `assigned_to_id: null` not unassigning and id lists matching only their first id, are fixed in `@redmine-ts/sdk` (`overlay.clearAsEmpty` and `overlay.commaLists`).

## Known limitations

### Per-client revocation

The OAuth server keeps no list of the tokens it issued, so it has no revocation endpoint and cannot end one client's sign-in. Revoking the application in Redmine ends every MCP client of that person, resetting an API key ends every use of that key, and changing the secret signs everyone out. [Sign out and revoke](../packages/mcp/README.md#sign-out-and-revoke) has the details. A revocation endpoint and per-client revocation are listed under [After OAuth](#after-oauth).

### A list of connected clients

Nobody can see which MCP clients hold tokens: neither the person who signed in nor an admin. Such a list needs a durable record of every sign-in, which the sealed, stateless design avoids. A shared grant store does not provide it, because a store keeps only markers of used tokens and ended sign-ins. Not planned.

### The CLI forgets used tokens on restart

The CLI keeps its grant store in memory, so a restart forgets which codes and refresh tokens were used and which sign-ins ended. [Grant store](../packages/mcp/README.md#grant-store) explains the effect. An embedded server can pass a shared store. The CLI has no option for one. Not planned.

### No deployment image

`docker/compose.yaml` runs Redmine servers for the contract tests, with known passwords and keys. The repository has no container image or Compose file that deploys the MCP server. [Redmine plugin: MCP at the tracker's own address](#redmine-plugin-mcp-at-the-trackers-own-address) lists the deployment recipes that are still open.

### Workers outside CI

`createRedmineMcpHandler` was checked by hand in workerd. CI runs it on Node and Bun only. A Workers run in CI is listed under [After OAuth](#after-oauth).

### No measure of agent success

The MCP server lists a tool for every operation, and the tests check each tool against real Redmine servers. Nothing measures yet whether a model picks the right tools and finishes a task. [Evals](#evals) are planned.

### Revocation in a real client

Both clients refreshed after a forced 401, but nobody has revoked a sign-in in Redmine while connected. That check shows whether claude.ai and ChatGPT start a new sign-in when the refresh fails, and how ChatGPT handles a plain 403.

### Bodies that keep growing

The budget does not tell users apart. About 10 bodies growing at 26 KiB/s each, just over the 25.6 KiB/s below which a body counts as stalled, hold the budget from one key at 2.1 Mbit/s, and other users' bodies over 64 KiB get 503 meanwhile: 8 and 11 of 15 uploads of 6.7 MiB in two five-minute tests. A proxy's per-client connection cap, such as nginx's `limit_conn`, bounds it today. A per-credential share of the budget would bound it in the server.

## Later

### After OAuth

Per-tool scope step-up, instead of hiding the tools a token's scope does not allow; a revocation endpoint and per-client revocation; Client ID Metadata Document URLs with a port, which the draft allows and the server refuses (Fable I1); a Workers run in CI; and Redmine plugin permissions in the requested scopes.

### A stale key set while the fetch slots are full

A signed-in user can name 4 slow key set URLs and hold every key set fetch. Another key-bound client whose kept set has expired then gets 503. `--allow-client` closes this today. A set fetched within the last hour could serve its client while the slots are full, as documents do.

### Evals

A private `packages/evals` TypeScript runner without a framework: about 24 tasks graded on Redmine's final state and on forbidden calls, tool choice reported but not gating, several trials per task. The owner deferred it, and wants it runnable locally through a Claude Code subscription (`claude -p` with the MCP server configured), which also measures a real client with its own tool search. The first experiment compares filtering with the table in `where` against the schema for each filter (see [loose `where`](#loose-where)). Plan: `.audit/research/evals-plan.md`.

### Write allowlists and MCP Registry listing

Prompts, project, tracker and field allowlists for writes, and a listing in the official MCP Registry (it needs `mcpName` in `package.json` and a `server.json`).

### Redmine plugin: MCP at the tracker's own address

An organization may want MCP at `https://redmine.company.com/mcp` instead of on a second host. A reverse-proxy rule in front of the standalone server already gives them that address, so the first step is a deployment recipe (nginx, Caddy, Apache, a Docker Compose sidecar, and Redmine under a subpath), not a plugin. For the recipe, the OAuth work mounts every endpoint under the MCP endpoint's path, takes a public URL apart from `REDMINE_URL`, serves its metadata at each discovery path a client may try, and never reads Redmine's `_redmine_session` cookie. The standalone server stays the supported product, because hosted Redmine services install third-party plugins only on top plans or on request. The MCP README already has the Caddy and nginx recipes and the subpath case; Apache and a Compose sidecar are open.

A plugin would have to beat that recipe, and the obvious designs do not yet. Five dedicated Ruby plugins and an AI suite already serve MCP from inside Redmine, and the closest, `joaoperfig/redmine_mcp_plugin`, has OAuth, dynamic registration and 16 hand-written tools, so a native Ruby tool layer would copy our tools into a crowded niche. A plugin that makes Redmine the authorization server would rebuild in Ruby, on the Doorkeeper 5.8 that Redmine 6.1 and 7.0 pin, the metadata, `resource` audiences, `iss` and Client ID Metadata Documents that Doorkeeper 6 adds. It would not fix Redmine's #44271 either: issue edits ignore token scopes inside Redmine's `Issue` model, so the access modes stay the write guard.

Revisit when Redmine adopts Doorkeeper 6, when Redmine core builds its own MCP server (feature #42689 is open), or when a real deployment can install a plugin but cannot add a proxy rule. The plugin would then be a thin Rack proxy with in-process authentication in front of the standalone server, with Redmine as the authorization server, not a second tool layer. Source: the owner's request, and `.audit/research/plugin-brief.md`.

### Webhook verification for Redmine 7.0

Redmine 7.0 sends outgoing webhooks for issues, wiki pages, time entries, news, and versions. Each request carries `X-Redmine-Signature-256`, which is `sha256=` followed by the HMAC-SHA256 of the body. A `/webhooks` entrypoint verifies it with WebCrypto and a constant-time compare, with no dependencies, and reuses the REST types for payloads. Redmine 6.x has no webhooks, so the same event interface runs over polling by `updated_on`. Check the final event list against the 7.0 release before building it. Source: the owner's original research.

### Redmine 7.1

Add 7.1 when d-yoshi/redmine-openapi tags a 7.1 spec. The weekly `spec-watch` job opens an issue when that happens. 7.1 adds a Documents API. From 7.1 the server also ignores the `content_type` a client sends with an upload, so the `content_type` input of `attachments.upload` needs a note or a version guard. The steps are in [Add a Redmine version](../CONTRIBUTING.md#add-a-redmine-version). Source: the owner's original research.

### Redmine 6.0

Add 6.0 only if real instances need it. 6.0 is legacy stable, and the spec has no 6.0 tag (its tags cover 5.0.x, 6.1 and 7.0), so a 6.0 spec would have to be derived and verified by hand. Source: the owner's original research, and "Open questions" in `docs/architecture.md`.

### Optional response validation

The SDK does not validate responses today. An opt-in hook that accepts any [Standard Schema](https://standardschema.dev) validator would let users plug in Zod 4 or similar without a dependency in the package. A dev mode could also log responses that differ from the spec's JSON Schema. Source: the owner's original research, and "Open questions" in `docs/architecture.md`.

### `/testing` entrypoint

A fake transport and fixtures recorded from the Docker Redmine servers, so users can test code built on the SDK without a server. Today users write their own fake `fetch`, as the SDK README shows. Source: the owner's original research.

### Effect entrypoint

A separate package, `@redmine-ts/effect`, for applications built on [Effect](https://effect.website). It keeps `effect` out of the SDK's dependencies and builds on the same registry and engine, so both clients cover the same operations. The plan:

- **Service.** The client is a service provided by a `Layer` built from the usual config.
- **Return types.** Every method returns an `Effect` whose error channel is a tagged union with one tag per `RedmineError` kind, so `Effect.catchTag("validation", ...)` works.
- **Listings.** They become a `Stream`.
- **Cancellation.** Effect interruption maps to the engine's `AbortSignal`, so cancelling stops the request.
- **Retries.** Effect `Schedule` takes over from the SDK's built-in policy.
- **Response decoding.** It can use Effect Schema. That also covers the Standard Schema hook above, since Effect Schema implements Standard Schema.

Source: the owner's request.

### Text formatting as config

The API does not say whether an instance uses Textile or CommonMark, so an agent cannot know which syntax to write in notes. A config option would declare it, and the toolkit would use it when it writes text. Source: the owner's original research.

### Spec-diff bot

When a new spec tag appears, a bot runs oasdiff between the vendored spec and the new tag, regenerates `src/generated/`, and opens a pull request with the drift report. The weekly `spec-watch` job, which opens a tracking issue, is the first step. Source: the owner's original research.

## Done

### Read-only mode and tool hints

Agents and scripts that should only read need a guarantee, not a convention. Two halves share the operation registry, which already classifies each operation as `read`, `idempotent`, or `write`:

- **SDK, runtime: done.** `createRedmine({ access: "read-only" })` refuses every method but `GET`, and `"no-delete"` refuses `DELETE`, for generated methods, extras, listings and `rm.request`, before anything is sent, with the error kind `access_denied`.
- **SDK, types: done.** A literal `access` narrows the client type. A read-only client has only the methods that send `GET`: reads, listings, `attachments.download` and `attachments.thumbnail`, and `rm.request` takes only `GET`. A no-delete client has no `DELETE` method. A write on a read-only client fails to compile, which guards scripts and dashboards that hold a powerful key at compile time too. An access read from config keeps the full type and the runtime refusal.
- **MCP: done in `@redmine-ts/mcp`.** Every tool carries explicit annotations from its HTTP method: reads are `readOnlyHint`, updates and deletes are `destructiveHint`, `PUT` and `DELETE` are `idempotentHint`, and `openWorldHint` is false. Clients act on them: ChatGPT developer mode treats a tool without `readOnlyHint` as a write tool, and Codex CLI runs read-only tools concurrently. `--read-only` lists only read tools and `--no-delete` hides deletes; include and exclude patterns are still open.

Sources: the owner's request, which named a client called devrelay as the model (its link is still to be added here), and onozaty/redmine-mcp-server, which marks tools with `readOnlyHint` and filters them with regex patterns. The owner's original research proposed read-only as the default policy, but the owner then chose full access by default with opt-in narrowing.

### Phase 2: generated tools

One generated tool per SDK operation (86), named `<namespace>_<verb>`, with the catalog's input and output schemas, explicit annotations (updates count as destructive, as the spec defines it), agent-oriented descriptions, rewritten filter descriptions, paged list results with a concise default, actionable error results, version and access filtering, and stdio. The server checks every structured result against its tool's output schema before returning it, so a mismatch names the tool instead of failing in the client.

### Phase 3: workflow tools

Hand-written workflow tools on the same tool path as the generated ones: `issue_context` (the issue, allowed statuses, relations read from the issue, subtasks with status, attachments, watchers, and journals as readable changes with names), `reference_data` (names to ids, globals cached for 5 minutes per server), `issues_transition` (status by id or name, refusals list the allowed statuses by id and name), `attachments_upload` (text, base64, or a path in `REDMINE_MCP_FILES_DIR`, capped at 5 MB), `attachments_download` (small images as image content, small text as text, thumbnails), `attachments_save` (only with a files directory), `raw_request` (listed in every mode, hints and description by mode), and the `redmine://issues/{id}` resource as Markdown.

### Phase 4: Streamable HTTP

Streamable HTTP. `redmine-mcp --http` serves `/mcp` on `127.0.0.1:3737` by default, and `createRedmineMcpHandler` is the same server as a web-standard handler for Bun and Workers. Each request brings its user's key in `X-Redmine-API-Key` against the one `REDMINE_URL`, the access modes apply as over stdio, 2025-era clients are served statelessly next to 2026-07-28 ones, and Origin and, on loopback, Host are checked with the MCP SDK's helpers.

### Phase 5: public package

The package is public, with the `redmine-mcp` command and the Node-only `@redmine-ts/mcp/node` entry, and 0.1.0 is its first release. npm/cli#9969 blocked trusted publishing for the SDK through 0.3.0, so those were published from the owner's machine; `@redmine-ts/mcp@0.2.0` and `@redmine-ts/sdk@0.3.1` published through CI with provenance (`docs/releasing.md`).

### CORS

`--allow-origin` and `allowedOrigins` take a hostname or an exact origin, and an allowed origin gets a 204 preflight and CORS headers on every response, so browser-based MCP clients can call the handler directly.

### Portable schemas

Tool schemas have one `type` per schema, with `anyOf` and a `null` branch for nullable values, so single-type dialects such as Gemini's function declarations read them. The MCP Inspector's `--strict` went from 587 warnings across 57 tools to none, and CI fails on any finding.

### OAuth

With `REDMINE_MCP_AUTH_SECRET` (or `oauth`), the server is its own OAuth authorization server for MCP clients and signs people in through Redmine's OAuth (Redmine 6.1+, one confidential application), so claude.ai and ChatGPT can connect. Codes, tokens, states and registrations are sealed with AES-GCM under HKDF keys bound to their purpose, so it needs no database; an optional grant store (`memoryGrantStore()` in the CLI, a Durable Object on Workers) makes codes, states and consent pages single-use across instances, rotates refresh tokens, and ends a sign-in whose code or refresh token comes back. Without one, those hold per process, and an API-key sign-in ends 30 days after consent. It offers Client ID Metadata Documents, stateless Dynamic Client Registration, PKCE S256, RFC 8707 audiences and RFC 9207 `iss`, its own consent page, and the scopes `redmine:read`, `redmine:write` and `redmine:delete`, which map to the access modes. `--allow-client <hostname>` admits only clients whose metadata document or redirect URIs are on listed hosts. `--api-key-login` is the opt-in fallback for Redmine without OAuth applications. Every path derives from `REDMINE_MCP_PUBLIC_URL`, so a same-origin proxy forwards the endpoint's path and three well-known paths. A `verifier` option accepts tokens from another authorization server. Runs on Node and, checked locally in workerd, on Workers.

### OAuth walkthrough

"What a sign-in looks like" in the MCP README shows MCP Inspector signing in to the Docker Redmine 7.0, as an animation and six screenshots in `packages/mcp/docs/oauth/`. `scripts/oauth-walkthrough/record.sh` records them again. It keeps the Inspector's state in a temporary directory, and it tells the browser to bypass CSP over CDP, because the consent page's CSP blocks the recorder's pointer overlay.

### Real clients

On 2026-10-26, through a cloudflared tunnel in front of the Docker Redmine 7.0, claude.ai and ChatGPT each signed in, ran tool calls, and refreshed their tokens after a 401 `invalid_token` that a test proxy forced. claude.ai names its metadata document, `https://claude.ai/oauth/mcp-oauth-client-metadata`, and stays a public client. ChatGPT names `https://chatgpt.com/oauth/client.json` and authenticates with `private_key_jwt`. Its JWT uses RS256 with a `kid`, sets `aud` to the token endpoint, lives 60 seconds, and carries a new `jti` on the refresh. Before `private_key_jwt` landed, ChatGPT never registered while the server advertised metadata documents. With `client_id_metadata_document_supported` hidden by a proxy, it registered through Dynamic Client Registration and worked.

### private_key_jwt

The built-in authorization server admits a Client ID Metadata Document that declares `private_key_jwt`, with its keys in exactly one of `jwks` and `jwks_uri`. Authorize seals the method into the code and every refresh token of the sign-in. The token endpoint then requires an RFC 7523 client assertion, which `jose` verifies against the client's current document. The assertion must use RS256, PS256 or ES256, name the `client_id` in `iss` and `sub`, name the issuer or the token endpoint in `aud`, expire within an hour, and carry a `jti` that the grant store spends once. Key sets are fetched like documents, kept 5 minutes, fetched again for an unknown `kid` at most once a minute, and at most 4 at once. Public clients keep their token path, and registration stays public-only (`.audit/decisions.tsv`, phase `mcp-private-key-jwt`).

### Metadata fetches (Fable I8)

One process or Worker isolate fetches at most 8 Client ID Metadata Documents at once, and a sign-in beyond that gets a 503 page with `Retry-After: 5`. Concurrent sign-ins of one client share a fetch. A fetch that has not settled after 6 seconds, as when Workers cancel the request that started it, frees its slot, and those sign-ins get the copy fetched within the last hour or the 503 page. Failed fetches and invalid documents are not cached, as the draft requires. API-key check slots are 9-second leases, so a cancelled check cannot hold one. `createRedmineMcpHandler` refuses a `*` in `allowedOrigins`, `allowedHosts` and `oauth.allowedClientHosts`, as the CLI flags do (`.audit/decisions.tsv`, phase `mcp-client-metadata`).

### 401 and 403 inside a request (Codex M8)

On OAuth requests, a credential Redmine refuses on an API path (`.json` or `.xml`) during the request gets HTTP 401 `invalid_token` with the Bearer challenge, and a call beyond the token's scope that the server's own mode allows gets 403 `insufficient_scope` naming the scopes it needs, on 2025-era and 2026-07-28 requests. The server holds OAuth responses until the call ends to decide the status, keeps a 200 when Redmine may have applied a write in the request so a retry cannot repeat it, and passes a 2026-07-28 `subscriptions/listen` stream on unheld. A Redmine 401 on a non-API path stays an error result that tells the agent to use a `.json` path, because Redmine answers 401 there even to a live credential. Designed through an arena of three candidates with a cross-judge (`.audit/decisions.tsv`, phase `mcp-bearer-status`).

### Loose `where`

`tools/list` shows one loose condition for every filter, and a table of the filters in the description of `where`: each filter's value and what it filters, under the operators it takes. Calls are still checked against the schema of each filter, so a bad filter gets the same error. A full-access listing went from 276K to 200K characters, and input schemas from 147K to 71K. `issues_list`'s input schema went from 48,004 to 4,466 bytes, and every input schema is now under 5,000 bytes, so Codex no longer strips their descriptions. A unit test keeps them under that bound.

### People by name

`people_find` returns the id and login of people by name in a project or an issue, for any key, because `users_list` needs an admin key. The 14 tools whose Redmine actions run `require_admin` say "Needs an admin key" in their description, and their 403 says so and names what works without one.

### Admin tools by key

A key whose user is not an admin no longer gets those 14 tools in `tools/list`, nor the sentence about them in the instructions. They are 14% of a full-access listing. stdio reads `users/current.json` once at start. HTTP asks once per `initialize`, `server/discover` and `tools/list` with the key header, sharing the key gate's call. OAuth seals the answer into the grant at sign-in, and a sign-in through Redmine is never an admin's, because the server never requests the `admin` scope. Without an answer, every tool is listed.

### Short issue items

`issues_list` items carry only `id`, `project`, `tracker`, `status`, `assigned_to`, `subject` and `updated_on`, plus what `include` names. `fields` adds other fields, and `detailed: true` returns every field. On a test server a page of 100 went from about 69K to 27K characters. Hour fields are rounded to two decimals in every result but `raw_request`'s.

### Result budget

List pages and `issue_context` stop at a budget of 32,000 UTF-8 bytes of one copy of the result's JSON, which `REDMINE_MCP_MAX_RESULT_BYTES` changes. Cursor takes 40,000 bytes, Codex about 48,000 and OpenCode 51,200, and Russian text takes 1.6 to 1.75 bytes per character, so the budget is counted in bytes. A page ends before the item that would pass it, with `next_offset` there, and `issue_context` pages older journals with `journals_before` (`.audit/decisions.tsv`, phase `product-calls`).

### After phase 4

`--allow-host <hostname>` adds names to the Host check for a proxy that keeps the client's Host; off loopback it turns the check on. The server's own JSON-RPC errors (the 401 for a missing key, the 403s for a refused Origin or Host) carry the request's id, read only from a body that declares at most 64 KiB and arrives within a second, so a refusal waits at most a second for a slow client. `--allow-origin`, `--allow-host` and `--allow-client` refuse a `*` at startup.

### Unauthenticated body reads

A request with an `X-Redmine-API-Key` passes at most 64 KiB, or one second of body arrival, to the MCP SDK before one `GET users/current.json` accepts the key. A refused key gets 401 and an unanswered check 503, a started check holds the rest of the body, and small, fast requests cost no extra call. Measured: 60 stalled 4 MB uploads with a bogus key are all answered within about 0.1 s on Node and Bun, where they used to hold 600 MB with none answered. With the key check in place, the HTTP body limit follows `attachments_upload`'s 5 MB cap (about 6.7 MiB of JSON), so a 5 MiB file uploads over HTTP; in one Workers isolate three concurrent 5 MiB uploads peak at 70 to 100 MB of its 128 MB, four come close, and five exceed it. Designed through an arena of two candidates judged by Sonnet and Sol (`.audit/decisions.tsv`, phase `mcp-body-reads`).

### Authenticated stalls

Bodies still arriving share a per-handler budget, `maxBodyBytesInFlight` (32 MiB), charged for the buffer each body is read into past its first 64 KiB. A body that needs room takes it from bodies that have not grown by 128 KiB in 5 seconds, which get 408, or else gets 503 with `Retry-After: 5`. Every body must arrive within `bodyTimeoutMs` (300 s), which is Node's own request timeout and gives Bun and Workers a bound. On `main`, Bun under the CLI held stalled bodies past 150 s; this roadmap had said 10 s. The handler reads each body once, as bytes, and passes the parsed message to the MCP SDK. After a refusal partway, it reads and drops the rest for 5 seconds, so a client still sending reads the answer. Measured with 60 uploads stopped at 95% of the limit: live heap went from 794 MB on Node and 778 MB on Bun to at most 29 MB above idle, and another user's 1 MiB upload succeeded beside them. Designed through an arena of two candidates with two Claude judges (`.audit/decisions.tsv`, phase `mcp-body-budget`).

### Journal details as a readable diff

Redmine returns journal details with ids as strings, such as `status_id` from `"1"` to `"2"`. A normalizer turns them into names through the same cached lookups, which is the main input a triage agent needs. `issue_context` depends on it. Source: the owner's original research.

Done for MCP: the normalizer lives in `packages/mcp/src/workflow/journals.ts` for now, with the name lookups it needs. It can move to the curated toolkit when that package exists, so scripts get the same diff.

### Inline uploads in create and update

`issues.create`, `issues.update`, `news.create`, `news.update` and `wiki.update` take `{ file, filename }` entries in `uploads` next to references, upload them in order inside the call, and send the record; a failed call carries `error.uploads` so a retry reuses what Redmine acknowledged. The generator finds these operations from the spec's `uploads` component, the catalog marks them with `inlineUploads`, and `attachments.upload` stays for a reference you keep and for `files.create`. The MCP server keeps the two-step path: an inline form would add about 4K characters to its most-used tool schemas, and over HTTP all files would share one request body. Revisit that if agent evals show agents failing the two-step attach. Designed through an arena of two candidates judged by Sonnet and Sol (`.audit/decisions.tsv`, phase `sdk-inline-uploads`).

## MCP server package

`@redmine-ts/mcp` in `packages/mcp` is a new server built on the 2026-07-28 MCP spec and the official TypeScript SDK v2. It is not a clone of the owner's earlier generic Redmine MCP. Agents increasingly use code mode, so the server optimizes for precise, typed tools rather than a small tool count. The owner's decisions: access is full by default, deletes included; `--read-only` and `--no-delete` (or `REDMINE_MCP_ACCESS`) narrow it, and the strictest wins; `raw_request` stays available but obeys the access mode; OAuth came after v1, as its own authorization server federated to Redmine's OAuth, with an API-key consent page as the opt-in fallback.

The SDK stays free of `@modelcontextprotocol/sdk`. Sources: the owner's original research, `docs/architecture.md`, and the MCP design proposal in this repository's decision log (`.audit/decisions.tsv`, phase `mcp-design`).
