# Roadmap

This page lists the planned work, the limits of the packages today, and the finished work, so that the project keeps every idea. Each item says why it matters and where the idea comes from. [Architecture](architecture.md) describes the current design.

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
| Done                                    | [Issue fields upstream](#issue-fields-upstream)                                                     | SDK          | #65, d-yoshi/redmine-openapi#9 |

## Next

### Read the method list of a metadata document

OpenAI calls the single `token_endpoint_auth_method` field transitional, after MCP SEP-3149. Today the server treats a document without that field as a public client. So if ChatGPT's document drops the field, ChatGPT's assertion would get a 401. The fix is to read the document's list of methods when the single field is missing.

### A stricter `aud`

ChatGPT sends the token endpoint as `aud`, so the check keeps accepting it, as RFC 7523 allows. Today an array that also names another audience passes. draft-ietf-oauth-rfc7523bis asks for one value. The plan is to refuse an array that names anything besides the issuer or the token endpoint.

### Big single results

The [result budget](#result-budget) trims list pages, `issues_get` journals, and `raw_request` responses. The other get tools still return the whole record. A long wiki page from `wiki_get` can pass the size a client accepts, and so can an issue whose description alone passes the budget.

### Smaller tool schemas

In a full-access listing of 200K characters, output schemas take 80K and descriptions take 27K. Clients without tool search pay that cost in every session. A tool profile would help clients that load every tool. One profile could hold the workflow tools and the REST tools that agents use most. The evals below would then check that tool choice does not get worse.

### Curated triage toolset

About a hundred generated tools are too much context for an agent. A small set covers triage: `issue_context`, `search_issues`, `find_similar`, `propose_update` (a dry run that shows the diff and checks the status transition), `apply_update`, `add_note`, `link_issues`, and `log_time`. Inputs and outputs would use names instead of ids, because models handle "In Progress" reliably and `status_id: 7` poorly. Name-to-id resolution would live in the toolkit over cached lookups, not in the SDK. The toolkit would return plain tool descriptors (name, description, input schema, annotations, and handler), so an MCP server, the Vercel AI SDK, or a custom agent can register them. The adapter for each framework would be a thin entrypoint with an optional peer dependency. The toolkit's write policy would have project, tracker, and field allowlists, a cap on writes per run, an approval hook that asks a person before a write, and an audit hook. Source: the owner's original research, and "Tradeoffs accepted" in `docs/architecture.md`.

Done in `@redmine-ts/mcp`: `issue_context`, name-to-id lookups in `reference_data` (cached for 5 minutes), `people_find` for logins by name, and status changes by name in `issues_transition`. `issues_transition` uses the SDK's `rm.issues.transition`, which reads the issue's allowed statuses and refuses a transition outside them before it sends the update. Open: `search_issues`, `find_similar`, `propose_update`, a name-based `apply_update`, and separate `add_note`, `link_issues`, and `log_time` tools. Today those jobs go through the generated, id-based `issues_update`, `relations_create`, and `time_entries_create`.

### `gen` CLI for an instance config

The planned command reads an instance with an admin key and writes a config with literal types. The config maps custom field names to `cf_<id>`, with their formats and possible values. It also lists the instance's statuses, trackers, and priorities. With that config, filters can read `cf.severity` instead of `cf_12`. Only admins can see custom field definitions, so the CLI also accepts a hand-written config of the same shape. Source: the owner's original research.

### Follow-ups found while building

Expose filter value words, such as `open`, in the SDK catalog, so that the server does not infer them. Resolve the SDK for tests with tsdown's dev exports instead of tsconfig paths. Shorten the longest tool descriptions. Phase 3 found two SDK bugs. `assigned_to_id: null` did not unassign, and an id list matched only its first id. `@redmine-ts/sdk` fixes both, with `overlay.clearAsEmpty` and `overlay.commaLists`.

## Known limitations

### Per-client revocation

The OAuth server keeps no list of the tokens it issued. So it has no revocation endpoint, and it cannot end one client's sign-in. Revoking the application in Redmine ends every MCP client of that person. Resetting an API key ends every use of that key, and changing the secret signs everyone out. [Sign out and revoke](mcp/authentication.md#sign-out-and-revoke) has the details. [After OAuth](#after-oauth) lists a revocation endpoint and per-client revocation.

### A list of connected clients

Neither the person who signed in nor an admin can see which MCP clients hold tokens. Such a list needs a durable record of every sign-in, and the sealed, stateless design avoids that record. A shared grant store does not provide the list, because a store keeps only markers of used tokens and ended sign-ins. Such a list is not planned.

### The CLI forgets used tokens on restart

The CLI keeps its grant store in memory. So after a restart, the CLI no longer knows which codes and refresh tokens were used and which sign-ins ended. [Grant store](mcp/authentication.md#grant-store) explains the effect. An embedded server can pass a shared store. The CLI has no option for one, and none is planned.

### No deployment image

`docker/compose.yaml` runs Redmine servers for the contract tests, with known passwords and keys. The repository has no container image or Compose file that deploys the MCP server. [Redmine plugin: MCP at the tracker's own address](#redmine-plugin-mcp-at-the-trackers-own-address) lists the deployment recipes that are still open.

### Workers outside CI

`createRedmineMcpHandler` was checked by hand in workerd. CI runs it only on Node and Bun. [After OAuth](#after-oauth) lists a Workers run in CI.

### No measure of agent success

The MCP server lists a tool for every operation, and the tests check each tool against real Redmine servers. Nothing yet measures whether a model picks the right tools and finishes a task. [Evals](#evals) are planned.

### Revocation in a real client

Both clients refreshed their tokens after a forced 401. Nobody has yet revoked a sign-in in Redmine while a client was connected. That check would show whether claude.ai and ChatGPT start a new sign-in when the refresh fails, and how ChatGPT handles a plain 403.

### Bodies that keep growing

The body budget does not tell users apart. A body counts as stalled below 25.6 KiB/s. About 10 bodies that grow at 26 KiB/s each, a little above that rate, hold the budget from one key at 2.1 Mbit/s. Meanwhile, other users' bodies over 64 KiB get 503. In two five-minute tests, 8 and 11 of 15 uploads of 6.7 MiB got 503. A proxy's per-client connection cap, such as nginx's `limit_conn`, bounds that effect today. A per-credential share of the budget would bound it inside the server.

## Later

### After OAuth

This item collects the work that waits until after OAuth:

- Per-tool scope step-up, instead of hiding the tools that a token's scope does not allow.
- A revocation endpoint and per-client revocation.
- Client ID Metadata Document URLs with a port, which the draft allows and the server refuses (Fable I1).
- A Workers run in CI.
- Redmine plugin permissions in the requested scopes.

### A stale key set while the fetch slots are full

A signed-in user can name 4 slow key set URLs and take every key set fetch slot. While the slots are full, a key set fetched within the last hour still serves a token request whose assertion names a `kid` in that set. Another client with keys gets 503 when the server has not fetched its set within the hour, or when its new key is not in that set. `--allow-client` closes this gap, because only documents on the listed hosts choose the key set URLs.

### Evals

A private TypeScript runner in `packages/evals`, without a framework, would grade about 24 tasks on Redmine's final state and on forbidden calls. It would run several trials per task, and it would report tool choice without gating on it. The owner deferred the runner. The owner wants it to run locally through a Claude Code subscription, with `claude -p` and the MCP server configured. That setup also measures a real client with its own tool search. The first experiment compares filtering with the table in `where` against filtering with the schema for each filter (see [loose `where`](#loose-where)). The plan is in `.audit/research/evals-plan.md`.

### Write allowlists and MCP Registry listing

This item covers prompts and project, tracker, and field allowlists for writes, and a listing in the official MCP Registry. The listing needs `mcpName` in `package.json` and a `server.json`.

### Redmine plugin: MCP at the tracker's own address

An organization may want MCP at `https://redmine.company.com/mcp` instead of on a second host. A reverse-proxy rule in front of the standalone server already gives the organization that address. So the first step is a deployment recipe, not a plugin. The recipe covers nginx, Caddy, Apache, a Docker Compose sidecar, and Redmine under a subpath. To support the recipe, the OAuth work mounts every endpoint under the MCP endpoint's path and takes a public URL separate from `REDMINE_URL`. It also serves its metadata at each discovery path that a client may try, and it never reads Redmine's `_redmine_session` cookie. The standalone server stays the supported product, because hosted Redmine services install third-party plugins only on top plans or on request. [Serve on Redmine's origin](mcp/http-and-oauth.md#serve-on-redmines-origin) already has the Caddy and nginx recipes and the subpath case. The Apache and Compose sidecar recipes are still open.

A plugin would have to do better than that recipe, and the obvious designs do not yet. Five dedicated Ruby plugins and an AI suite already serve MCP from inside Redmine. The closest, `joaoperfig/redmine_mcp_plugin`, has OAuth, dynamic registration, and 16 hand-written tools. So a native Ruby tool layer would copy our tools into a crowded niche. Redmine 6.1 and 7.0 pin Doorkeeper 5.8. On that version, a plugin that makes Redmine the authorization server would have to rebuild in Ruby what Doorkeeper 6 adds: the metadata, `resource` audiences, `iss`, and Client ID Metadata Documents. Such a plugin would not fix Redmine's #44271 either. Inside Redmine's `Issue` model, issue edits ignore token scopes, so the access modes stay the write guard.

Revisit when Redmine adopts Doorkeeper 6, when Redmine core builds its own MCP server (feature #42689 is open), or when a real deployment can install a plugin but cannot add a proxy rule. The plugin would then be a thin Rack proxy in front of the standalone server, not a second tool layer. It would authenticate in process, with Redmine as the authorization server. Source: the owner's request, and `.audit/research/plugin-brief.md`.

### Webhook verification for Redmine 7.0

Redmine 7.0 sends outgoing webhooks for issues, wiki pages, time entries, news, and versions. Each request carries `X-Redmine-Signature-256`, which is `sha256=` followed by the HMAC-SHA256 of the body. A `/webhooks` entrypoint would verify the signature with WebCrypto and a constant-time compare, with no dependencies. It would reuse the REST types for payloads. Redmine 6.x has no webhooks, so the same event interface would run over polling by `updated_on`. Check the final event list against the 7.0 release before you build the entrypoint. Source: the owner's original research.

### Redmine 7.1

Add 7.1 when d-yoshi/redmine-openapi tags a 7.1 spec. The weekly `spec-watch` job opens an issue when that happens. 7.1 adds a Documents API. From 7.1 on, Redmine also ignores the `content_type` that a client sends with an upload. So the `content_type` input of `attachments.upload` needs a note or a version guard. [Add a Redmine version](../CONTRIBUTING.md#add-a-redmine-version) lists the steps. Source: the owner's original research.

### Redmine 6.0

Add 6.0 only if real instances need it. 6.0 is legacy stable. The spec's tags cover 5.0.x, 6.1, and 7.0, with no 6.0 tag. So someone would have to derive a 6.0 spec and verify it by hand. Source: the owner's original research, and "Open questions" in `docs/architecture.md`.

### Optional response validation

The SDK does not validate responses today. An opt-in hook that accepts any [Standard Schema](https://standardschema.dev) validator would let users plug in Zod 4 or a similar library without a dependency in the package. A dev mode could also log responses that differ from the spec's JSON Schema. Source: the owner's original research, and "Open questions" in `docs/architecture.md`.

### `/testing` entrypoint

The entrypoint would offer a fake transport and fixtures recorded from the Docker Redmine servers, so users can test code built on the SDK without a server. Today users write their own fake `fetch`, as [Bring your own fetch](sdk/configuration.md#bring-your-own-fetch) shows. Source: the owner's original research.

### Effect entrypoint

`@redmine-ts/effect` would be a separate package for applications built on [Effect](https://effect.website). It would keep `effect` out of the SDK's dependencies and build on the same registry and engine, so both clients cover the same operations. The plan:

- **Service.** A `Layer` built from the usual config provides the client as a service.
- **Return types.** Every method returns an `Effect` whose error channel is a tagged union with one tag per `RedmineError` kind, so `Effect.catchTag("validation", ...)` works.
- **Listings.** A listing becomes a `Stream`.
- **Cancellation.** Effect interruption maps to the engine's `AbortSignal`, so cancelling stops the request.
- **Retries.** Effect `Schedule` replaces the SDK's built-in retry policy.
- **Response decoding.** Decoding can use Effect Schema. Effect Schema implements Standard Schema, so it also covers the Standard Schema hook above.

Source: the owner's request.

### Text formatting as config

The API does not say whether an instance uses Textile or CommonMark, so an agent cannot know which syntax to write in notes. A config option would declare the format, and the toolkit would use that option when it writes text. Source: the owner's original research.

### Spec-diff bot

When a new spec tag appears, a bot would run oasdiff between the vendored spec and the new tag. It would regenerate `src/generated/` and open a pull request with the drift report. The weekly `spec-watch` job, which opens a tracking issue, is the first step. Source: the owner's original research.

## Done

### Read-only mode and tool hints

An agent or a script that must not write needs a guarantee, not a convention. The work has two halves, the SDK and the MCP server. Both use the operation registry, which already classifies each operation as `read`, `idempotent`, or `write`:

- **The SDK runtime is done.** `createRedmine({ access: "read-only" })` refuses every method but `GET`, and `"no-delete"` refuses `DELETE`. The client refuses before it sends anything, with the error kind `access_denied`. The refusal covers generated methods, extras, listings, and `rm.request`.
- **The SDK types are done.** A literal `access` narrows the client type. A read-only client has only the methods that send `GET`: reads, listings, `attachments.download`, and `attachments.thumbnail`. Its `rm.request` takes only `GET`. A no-delete client has no `DELETE` method. So a write on a read-only client fails to compile. That compile-time check also guards scripts and dashboards that hold a key with write access. An `access` value read from config keeps the full client type, and the runtime refusal still applies.
- **The MCP part is done in `@redmine-ts/mcp`.** Every tool carries explicit annotations derived from its HTTP method. Reads are `readOnlyHint`, updates and deletes are `destructiveHint`, `PUT` and `DELETE` are `idempotentHint`, and `openWorldHint` is false. Clients act on these hints. ChatGPT developer mode treats a tool without `readOnlyHint` as a write tool, and Codex CLI runs read-only tools concurrently. `--read-only` lists only read tools, and `--no-delete` hides deletes. Include and exclude patterns are still open.

Sources: the owner's request and onozaty/redmine-mcp-server. The request named a client called devrelay as the model, and this page does not link it yet. The onozaty/redmine-mcp-server project marks tools with `readOnlyHint` and filters them with regex patterns. The owner's original research proposed read-only as the default policy, but the owner then chose full access by default with opt-in narrowing.

### Phase 2: generated tools

Phase 2 added one generated tool per SDK operation, 86 in all, named `<namespace>_<verb>`. Each tool has the catalog's input and output schemas and explicit annotations. Updates count as destructive, as the spec defines the term. The phase also added agent-oriented descriptions, rewritten filter descriptions, paged list results with a concise default, actionable error results, version and access filtering, and stdio. The server checks every structured result against its tool's output schema before it returns the result. So a mismatch names the tool instead of failing in the client.

### Phase 3: workflow tools

Phase 3 added hand-written workflow tools that run on the same tool path as the generated ones, and one resource:

- `issue_context` returns the issue, allowed statuses, relations read from the issue, subtasks with status, attachments, watchers, and journals as readable changes with names.
- `reference_data` maps names to ids and caches globals for 5 minutes per server.
- `issues_transition` sets a status by id or name. A refusal lists the allowed statuses by id and name.
- `attachments_upload` takes text, base64, or a path in `REDMINE_MCP_FILES_DIR`, capped at 5 MiB.
- `attachments_download` returns small images as image content, small text as text, and thumbnails.
- `attachments_save` exists only with a files directory.
- `raw_request` appears in every mode, and its hints and description depend on the mode.
- The `redmine://issues/{id}` resource returns the issue as Markdown.

### Phase 4: Streamable HTTP

Phase 4 added Streamable HTTP. By default, `redmine-mcp --http` serves `/mcp` on `127.0.0.1:3737`. `createRedmineMcpHandler` is the same server as a web-standard handler for Bun and Workers. Each request brings its user's key in `X-Redmine-API-Key`, and every key works against the one `REDMINE_URL`. The access modes apply as they do over stdio. The server serves 2025-era clients statelessly next to 2026-07-28 ones. It checks Origin, and on loopback also Host, with the MCP SDK's helpers.

### Phase 5: public package

The package is public, with the `redmine-mcp` command and the Node-only `@redmine-ts/mcp/node` entry. Its first release is 0.1.0. npm/cli#9969 blocked trusted publishing for the SDK through 0.3.0, so the owner published those SDK releases locally. CI published `@redmine-ts/mcp@0.2.0` and `@redmine-ts/sdk@0.3.1` with provenance (`docs/releasing.md`).

### CORS

`--allow-origin` and `allowedOrigins` take a hostname or an exact origin. An allowed origin gets a 204 preflight and CORS headers on every response, so browser-based MCP clients can call the handler directly.

### Portable schemas

Tool schemas have one `type` per schema, with `anyOf` and a `null` branch for nullable values. So single-type dialects, such as Gemini's function declarations, can read them. With `--strict`, the MCP Inspector went from 587 warnings across 57 tools to none. CI fails on any finding.

### OAuth

With `REDMINE_MCP_AUTH_SECRET` (or `oauth`), the server is its own OAuth authorization server for MCP clients. It signs people in through Redmine's OAuth, which needs Redmine 6.1 or later and one confidential application. So claude.ai and ChatGPT can connect. The server seals codes, tokens, states, and registrations with AES-GCM under HKDF keys bound to their purpose, so it needs no database. An optional grant store makes codes, states, and consent pages single-use across instances. The CLI uses `memoryGrantStore()`, and Workers use a Durable Object. The store also rotates refresh tokens, and it ends a sign-in when that sign-in's code or refresh token is presented again. Without a store, those guarantees hold per process, and an API-key sign-in ends 30 days after consent. The server supports Client ID Metadata Documents, stateless Dynamic Client Registration, PKCE S256, RFC 8707 audiences, and RFC 9207 `iss`. It has its own consent page and the scopes `redmine:read`, `redmine:write`, and `redmine:delete`, which map to the access modes. `--allow-client <hostname>` admits only clients whose metadata document or redirect URIs are on listed hosts. `--api-key-login` is the opt-in fallback for a Redmine without OAuth applications. Every path derives from `REDMINE_MCP_PUBLIC_URL`, so a same-origin proxy forwards the endpoint's path and three well-known paths. A `verifier` option accepts tokens from another authorization server. The server runs on Node and on Workers. The Workers case was checked locally in workerd.

### OAuth walkthrough

[What a sign-in looks like](mcp/http-and-oauth.md#what-a-sign-in-looks-like) shows MCP Inspector signing in to the Docker Redmine 7.0, as an animation and six screenshots in `packages/mcp/docs/oauth/`. `scripts/oauth-walkthrough/record.sh` records them again. The script keeps the Inspector's state in a temporary directory. It tells the browser over CDP to bypass CSP, because the consent page's CSP blocks the recorder's pointer overlay.

### Real clients

On 2026-10-26, claude.ai and ChatGPT each connected through a cloudflared tunnel in front of the Docker Redmine 7.0. Each client signed in, ran tool calls, and refreshed its tokens after a 401 `invalid_token` that a test proxy forced. claude.ai names its metadata document, `https://claude.ai/oauth/mcp-oauth-client-metadata`, and stays a public client. ChatGPT names `https://chatgpt.com/oauth/client.json` and authenticates with `private_key_jwt`. Its JWT uses RS256 with a `kid`, sets `aud` to the token endpoint, lives 60 seconds, and carries a new `jti` on the refresh. Before the server supported `private_key_jwt`, ChatGPT never registered while the server advertised metadata documents. When a proxy hid `client_id_metadata_document_supported`, ChatGPT registered through Dynamic Client Registration and worked.

### private_key_jwt

The built-in authorization server admits a Client ID Metadata Document that declares `private_key_jwt`, with its keys in exactly one of `jwks` and `jwks_uri`. The authorize endpoint seals the method into the code and every refresh token of the sign-in. The token endpoint then requires an RFC 7523 client assertion, which `jose` verifies against the client's current document. The assertion must use RS256, PS256, or ES256, and it must name the `client_id` in `iss` and `sub`. Its `aud` must name the issuer or the token endpoint. It must expire within an hour and carry a `jti` that the grant store spends once. The server fetches key sets the way it fetches documents, and it keeps each set for 5 minutes. For an unknown `kid`, it fetches the set again at most once a minute. At most 4 key set fetches run at once. Public clients keep their token path, and registration stays public-only (`.audit/decisions.tsv`, phase `mcp-private-key-jwt`).

### Metadata fetches (Fable I8)

One process or Worker isolate fetches at most 8 Client ID Metadata Documents at once. A sign-in beyond that limit gets a 503 page with `Retry-After: 5`. Concurrent sign-ins of one client share a fetch. A fetch that has not settled after 6 seconds frees its slot. That happens, for example, when Workers cancel the request that started the fetch. The sign-ins that wait on that fetch then get the copy fetched within the last hour, or the 503 page. As the draft requires, the server does not cache failed fetches or invalid documents. Each API-key check slot is a 9-second lease, so a cancelled check cannot hold a slot. `createRedmineMcpHandler` refuses a `*` in `allowedOrigins`, `allowedHosts`, and `oauth.allowedClientHosts`, as the CLI flags do (`.audit/decisions.tsv`, phase `mcp-client-metadata`).

### 401 and 403 inside a request (Codex M8)

On OAuth requests, the server maps two refusals to HTTP statuses. If Redmine refuses a credential on an API path (`.json` or `.xml`) during the request, the response is HTTP 401 `invalid_token` with the Bearer challenge. If a call goes beyond the token's scope but the server's own mode allows it, the response is 403 `insufficient_scope`, which names the scopes that the call needs. Both rules hold on 2025-era and 2026-07-28 requests. To decide the status, the server holds each OAuth response until the call ends. It keeps a 200 when Redmine may have applied a write during the request, so a retry cannot repeat the write. It passes a 2026-07-28 `subscriptions/listen` stream on without holding it. A Redmine 401 on a non-API path stays an error result that tells the agent to use a `.json` path. Redmine answers 401 on such a path even to a live credential. The design came from an arena of three candidates with a cross-judge (`.audit/decisions.tsv`, phase `mcp-bearer-status`).

### Loose `where`

`tools/list` shows one loose condition for every filter. The description of `where` holds a table of the filters, with each filter's value and what it filters, under the operators it takes. The server still checks each call against the schema of each filter, so a bad filter gets the same error. A full-access listing went from 276K to 200K characters, and its input schemas went from 147K to 71K. The input schema of `issues_list` went from 48,004 to 4,466 bytes. Every input schema is now under 5,000 bytes, so Codex no longer strips their descriptions. A unit test keeps them under that bound.

### People by name

`people_find` returns the id and login of people by name in a project or an issue. It works with any key, unlike `users_list`, which needs an admin key. The 14 tools whose Redmine actions run `require_admin` say "Needs an admin key" in their description. Their 403 says the same and names what works without an admin key.

### Admin tools by key

A key whose user is not an admin no longer gets those 14 tools in `tools/list`, nor the sentence about them in the instructions. Those tools are 14% of a full-access listing. stdio reads `users/current.json` once at start. Over HTTP, the server asks once for each `initialize`, `server/discover`, and `tools/list` request with the key header, and it reuses the key check's call. With OAuth, the server seals the answer into the grant at sign-in. A sign-in through Redmine never counts as an admin's, because the server never requests the `admin` scope. Without an answer, the server lists every tool.

### Short issue items

`issues_list` items carry only `id`, `project`, `tracker`, `status`, `assigned_to`, `subject`, and `updated_on`, plus what `include` names. `fields` adds other fields, and `detailed: true` returns every field. On a test server, a page of 100 went from about 69K to 27K characters. The server rounds hour fields to two decimals in every result except the result of `raw_request`.

### Result budget

List pages and `issue_context` stop at a budget of 32,000 UTF-8 bytes, measured on one copy of the result's JSON. `REDMINE_MCP_MAX_RESULT_BYTES` changes the budget. Cursor takes 40,000 bytes, Codex about 48,000, and OpenCode 51,200. Russian text takes 1.6 to 1.75 bytes per character, so the server counts the budget in bytes. A page ends before the item that would pass the budget, and `next_offset` points at that item. `issue_context` pages older journals with `journals_before` (`.audit/decisions.tsv`, phase `product-calls`).

### After phase 4

`--allow-host <hostname>` adds names to the Host check, for a proxy that keeps the client's Host. Off loopback, the flag turns the check on. The server's own JSON-RPC errors carry the request's id. These errors are the 401 for a missing key and the 403s for a refused Origin or Host. The server reads the id only from a body that declares at most 64 KiB and arrives within a second. So a refusal waits at most a second for a slow client. `--allow-origin`, `--allow-host`, and `--allow-client` refuse a `*` at startup.

### Unauthenticated body reads

For a request with an `X-Redmine-API-Key`, the server passes at most 64 KiB, or one second of body arrival, to the MCP SDK before one `GET users/current.json` accepts the key. A refused key gets 401, and an unanswered check gets 503. A started check holds the rest of the body. Small, fast requests cost no extra call. In a measurement, 60 stalled 4 MB uploads with a bogus key all got an answer within about 0.1 s on Node and Bun. Before this change, those uploads held 600 MB, and none got an answer. With the key check in place, the HTTP body limit follows the 5 MB cap of `attachments_upload`, which is about 6.7 MiB of JSON. So a 5 MiB file uploads over HTTP. In one Workers isolate, three concurrent 5 MiB uploads peak at 70 to 100 MB of its 128 MB. Four uploads come close to that limit, and five exceed it. The design came from an arena of two candidates, judged by Sonnet and Sol (`.audit/decisions.tsv`, phase `mcp-body-reads`).

### Authenticated stalls

Bodies that are still arriving share a per-handler budget, `maxBodyBytesInFlight` (32 MiB). Once a body passes its first 64 KiB, the server charges the budget for the buffer that it reads the body into. A body that needs room takes it from bodies that have not grown by 128 KiB in 5 seconds, and those bodies get 408. If no such body exists, the body that needs room gets 503 with `Retry-After: 5`. Every body must arrive within `bodyTimeoutMs` (300 s). That value is Node's own request timeout, and it gives Bun and Workers a bound. On `main`, Bun under the CLI held stalled bodies past 150 s. This roadmap had said 10 s. The handler reads each body once, as bytes, and passes the parsed message to the MCP SDK. After a refusal partway through a body, the handler reads and drops the rest for 5 seconds, so a client that is still sending can read the answer. One measurement used 60 uploads stopped at 95% of the limit. Live heap went from 794 MB on Node and 778 MB on Bun to at most 29 MB above idle. Another user's 1 MiB upload succeeded beside them. The design came from an arena of two candidates with two Claude judges (`.audit/decisions.tsv`, phase `mcp-body-budget`).

### Journal details as a readable diff

Redmine returns journal details with ids as strings, such as `status_id` from `"1"` to `"2"`. A normalizer turns those ids into names through the same cached lookups. The readable diff is the main input that a triage agent needs. `issue_context` depends on the normalizer. Source: the owner's original research.

The MCP part is done. For now, the normalizer lives in `packages/mcp/src/workflow/journals.ts`, with the name lookups it needs. It can move to the curated toolkit when that package exists, so that scripts get the same diff.

### Inline uploads in create and update

`issues.create`, `issues.update`, `news.create`, `news.update`, and `wiki.update` take `{ file, filename }` entries in `uploads` next to references. Inside the call, they upload those entries in order and then send the record. A failed call carries `error.uploads`, so a retry reuses what Redmine acknowledged. The generator finds these operations through the spec's `uploads` component, and the catalog marks them with `inlineUploads`. `attachments.upload` stays, for a reference you keep and for `files.create`. The MCP server keeps the two-step path. An inline form would add about 4K characters to its most-used tool schemas, and over HTTP all files would share one request body. Revisit that choice if agent evals show agents failing the two-step attach. The design came from an arena of two candidates, judged by Sonnet and Sol (`.audit/decisions.tsv`, phase `sdk-inline-uploads`).

### Issue fields upstream

The spec left an issue's `project`, `tracker`, `status`, `priority`, `author`, and `parent.id` optional, though Redmine always sends them. `@redmine-ts/sdk` 0.6.0 marked them as required through an overlay correction. The fix went upstream as d-yoshi/redmine-openapi#9 and d-yoshi/redmine-openapi#10, and shipped in the spec tags `6.1.3-r2` and `7.0.2-r2`. The SDK vendors those tags, and the corrections mechanism is gone.

## MCP server package

`@redmine-ts/mcp` in `packages/mcp` is a new server built on the 2026-07-28 MCP spec and the official TypeScript SDK v2. It is not a clone of the owner's earlier generic Redmine MCP. Agents increasingly use code mode, so the server optimizes for precise, typed tools instead of a small tool count. The owner made these decisions:

- Access is full by default, deletes included.
- `--read-only` and `--no-delete`, or `REDMINE_MCP_ACCESS`, narrow access, and the strictest setting wins.
- `raw_request` stays available but obeys the access mode.
- OAuth came after v1. The server is its own authorization server, federated to Redmine's OAuth, with an API-key consent page as the opt-in fallback.

The SDK stays free of `@modelcontextprotocol/sdk`. Sources: the owner's original research, `docs/architecture.md`, and the MCP design proposal in this repository's decision log (`.audit/decisions.tsv`, phase `mcp-design`).
