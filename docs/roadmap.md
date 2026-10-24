# Roadmap

This page lists work that is planned but not started, so it is not lost. Each item says why it matters and where the idea comes from. `research.md` is the owner's original research, in Russian. `docs/architecture.md` is the current design.

Items marked **next** come after the first release. Items marked **later** wait for a need or for an upstream release.

## MCP server package

`@redmine-ts/mcp` in `packages/mcp` is a new server built on the 2026-07-28 MCP spec and the official TypeScript SDK v2. It is not a clone of the owner's earlier generic Redmine MCP. Agents increasingly use code mode, so the server optimizes for precise, typed tools rather than a small tool count. The owner's decisions: access is full by default, deletes included; `--read-only` and `--no-delete` (or `REDMINE_MCP_ACCESS`) narrow it, and the strictest wins; `raw_request` stays available but obeys the access mode; OAuth came after v1, as its own authorization server federated to Redmine's OAuth, with an API-key consent page as the opt-in fallback.

- **Done (phase 2):** one generated tool per SDK operation (86), named `<namespace>_<verb>`, with the catalog's input and output schemas, explicit annotations (updates count as destructive, as the spec defines it), agent-oriented descriptions, rewritten filter descriptions, paged list results with a concise default, actionable error results, version and access filtering, and stdio.
- **Done (phase 3):** hand-written workflow tools on the same tool path as the generated ones: `issue_context` (the issue, allowed statuses, relations read from the issue, subtasks with status, attachments, watchers, and journals as readable changes with names), `reference_data` (names to ids, globals cached for 5 minutes per server), `issues_transition` (status by id or name, refusals list the allowed statuses by id and name), `attachments_upload` (text, base64, or a path in `REDMINE_MCP_FILES_DIR`, capped at 5 MB), `attachments_download` (small images as image content, small text as text, thumbnails), `attachments_save` (only with a files directory), `raw_request` (listed in every mode, hints and description by mode), and the `redmine://issues/{id}` resource as Markdown.
- **Done (phase 4):** Streamable HTTP. `redmine-mcp --http` serves `/mcp` on `127.0.0.1:3737` by default, and `createRedmineMcpHandler` is the same server as a web-standard handler for Bun and Workers. Each request brings its user's key in `X-Redmine-API-Key` against the one `REDMINE_URL`, the access modes apply as over stdio, 2025-era clients are served statelessly next to 2026-07-28 ones, and Origin and, on loopback, Host are checked with the MCP SDK's helpers.
- **Done (phase 5):** the package is public, with the `redmine-mcp` command and the Node-only `@redmine-ts/mcp/node` entry, and 0.1.0 is its first release. npm/cli#9969 blocked trusted publishing for the SDK through 0.3.0, so those were published from the owner's machine; `@redmine-ts/mcp@0.2.0` published through CI with provenance (`docs/releasing.md`).
- **Done (CORS):** `--allow-origin` and `allowedOrigins` take a hostname or an exact origin, and an allowed origin gets a 204 preflight and CORS headers on every response, so browser-based MCP clients can call the handler directly.
- **Done (portable schemas):** tool schemas have one `type` per schema, with `anyOf` and a `null` branch for nullable values, so single-type dialects such as Gemini's function declarations read them. The MCP Inspector's `--strict` went from 587 warnings across 57 tools to none, and CI fails on any finding.
- **Done (OAuth):** with `REDMINE_MCP_AUTH_SECRET` (or `oauth`), the server is its own OAuth authorization server for MCP clients and signs people in through Redmine's OAuth (Redmine 6.1+, one confidential application), so claude.ai and ChatGPT can connect. Codes, tokens, states and registrations are sealed with AES-GCM under HKDF keys bound to their purpose, so it needs no database; an optional grant store (`memoryGrantStore()` in the CLI, a Durable Object on Workers) makes codes, states and consent pages single-use across instances, rotates refresh tokens, and ends a sign-in whose code or refresh token comes back. Without one, those hold per process, and an API-key sign-in ends 30 days after consent. It offers Client ID Metadata Documents, stateless Dynamic Client Registration, PKCE S256, RFC 8707 audiences and RFC 9207 `iss`, its own consent page, and the scopes `redmine:read`, `redmine:write` and `redmine:delete`, which map to the access modes. `--api-key-login` is the opt-in fallback for Redmine without OAuth applications. Every path derives from `REDMINE_MCP_PUBLIC_URL`, so a same-origin proxy forwards the endpoint's path and three well-known paths. A `verifier` option accepts tokens from another authorization server. Runs on Node and, checked locally in workerd, on Workers.
- **Open after OAuth:** HTTP 403 `insufficient_scope` and 401 `invalid_token` for scope and revocation failures inside a request, which now come back as tool errors with HTTP 200 (security review, Codex M8); per-tool scope step-up, instead of hiding the tools a token's scope does not allow; a revocation endpoint and per-client revocation; Client ID Metadata Document URLs with a port, which the draft allows and the server refuses (Fable I1); a concurrency cap or short per-host negative cache on metadata fetches, which unauthenticated authorize requests trigger (Fable I8); a Workers run in CI; and Redmine plugin permissions in the requested scopes.
- **Open after phase 4:** a Host allowlist flag for proxies that keep the client's Host, and the request id in the server's own HTTP error bodies (they send `id: null`, as the SDK's do).
- **Later: evals.** A private `packages/evals` TypeScript runner without a framework: about 24 tasks graded on Redmine's final state and on forbidden calls, tool choice reported but not gating, several trials per task. The owner deferred it, and wants it runnable locally through a Claude Code subscription (`claude -p` with the MCP server configured), which also measures a real client with its own tool search. The first experiment is trimming the largest list schemas: `issues_list` alone is about 46K characters, and all tools an estimated 50-55K tokens. Plan: `.audit/research/evals-plan.md`.
- **Later:** prompts, project, tracker and field allowlists for writes, and a listing in the official MCP Registry (it needs `mcpName` in `package.json` and a `server.json`).
- **Follow-ups found while building:** expose filter value words (such as `open`) in the SDK catalog so the server does not infer them; resolve the SDK for tests with tsdown's dev exports instead of tsconfig paths; shorten the longest tool descriptions. The two SDK bugs phase 3 found, `assigned_to_id: null` not unassigning and id lists matching only their first id, are fixed in `@redmine-ts/sdk` (`overlay.clearAsEmpty` and `overlay.commaLists`).

The SDK stays free of `@modelcontextprotocol/sdk`. Sources: `research.md` (sections "Агенты и MCP" and "OAuth2 не заменяет клиентскую политику"), `docs/architecture.md`, and the MCP design proposal in this repository's decision log (`.audit/decisions.tsv`, phase `mcp-design`).

## Redmine plugin: MCP at the tracker's own address (later)

An organization may want MCP at `https://redmine.company.com/mcp` instead of on a second host. A reverse-proxy rule in front of the standalone server already gives them that address, so the first step is a deployment recipe (nginx, Caddy, Apache, a Docker Compose sidecar, and Redmine under a subpath), not a plugin. For the recipe, the OAuth work mounts every endpoint under the MCP endpoint's path, takes a public URL apart from `REDMINE_URL`, serves its metadata at each discovery path a client may try, and never reads Redmine's `_redmine_session` cookie. The standalone server stays the supported product, because hosted Redmine services install third-party plugins only on top plans or on request.

A plugin would have to beat that recipe, and the obvious designs do not yet. Five dedicated Ruby plugins and an AI suite already serve MCP from inside Redmine, and the closest, `joaoperfig/redmine_mcp_plugin`, has OAuth, dynamic registration and 16 hand-written tools, so a native Ruby tool layer would copy our tools into a crowded niche. A plugin that makes Redmine the authorization server would rebuild in Ruby, on the Doorkeeper 5.8 that Redmine 6.1 and 7.0 pin, the metadata, `resource` audiences, `iss` and Client ID Metadata Documents that Doorkeeper 6 adds. It would not fix Redmine's #44271 either: issue edits ignore token scopes inside Redmine's `Issue` model, so the access modes stay the write guard.

Revisit when Redmine adopts Doorkeeper 6, when Redmine core builds its own MCP server (feature #42689 is open), or when a real deployment can install a plugin but cannot add a proxy rule. The plugin would then be a thin Rack proxy with in-process authentication in front of the standalone server, with Redmine as the authorization server, not a second tool layer. Source: the owner's request, and `.audit/research/plugin-brief.md`.

## Curated triage toolset (next)

About a hundred generated tools are too much context for an agent. A small set covers triage: `issue_context`, `search_issues`, `find_similar`, `propose_update` (a dry run that shows the diff and checks the status transition), `apply_update`, `add_note`, `link_issues`, and `log_time`. Inputs and outputs use names instead of ids, because models handle "In Progress" reliably and `status_id: 7` poorly. Name-to-id resolution lives in the toolkit over cached lookups, not in the SDK. Source: `research.md` (section "Агенты и MCP"), and "Tradeoffs accepted" in `docs/architecture.md`.

## Read-only mode and tool hints (next)

Agents and scripts that should only read need a guarantee, not a convention. Two halves share the operation registry, which already classifies each operation as `read`, `idempotent`, or `write`:

- **SDK, runtime: done.** `createRedmine({ access: "read-only" })` refuses every method but `GET`, and `"no-delete"` refuses `DELETE`, for generated methods, extras, listings and `rm.request`, before anything is sent, with the error kind `access_denied`.
- **SDK, types: done.** A literal `access` narrows the client type. A read-only client has only the methods that send `GET`: reads, listings, `attachments.download` and `attachments.thumbnail`, and `rm.request` takes only `GET`. A no-delete client has no `DELETE` method. A write on a read-only client fails to compile, which guards scripts and dashboards that hold a powerful key at compile time too. An access read from config keeps the full type and the runtime refusal.
- **MCP: done in `@redmine-ts/mcp`.** Every tool carries explicit annotations from its HTTP method: reads are `readOnlyHint`, updates and deletes are `destructiveHint`, `PUT` and `DELETE` are `idempotentHint`, and `openWorldHint` is false. Clients act on them: ChatGPT developer mode treats a tool without `readOnlyHint` as a write tool, and Codex CLI runs read-only tools concurrently. `--read-only` lists only read tools and `--no-delete` hides deletes; include and exclude patterns are still open.

Sources: the owner's request, which named a client called devrelay as the model (its link is still to be added here). `research.md` (section "Что есть сейчас") describes onozaty/redmine-mcp-server, which marks tools with `readOnlyHint` and filters them with regex patterns. Section "Агенты и MCP" proposed read-only as the default policy; the owner chose full access by default with opt-in narrowing.

## `gen` CLI for an instance config (next)

A command that reads an instance with an admin key and writes a config with literal types: custom field names mapped to `cf_<id>`, and the instance's statuses, trackers, and priorities. With that config, filters can read `cf.severity` instead of `cf_12`. Custom field definitions are visible only to admins, so the CLI also accepts a hand-written config of the same shape. Source: `research.md` (sections "Custom fields" and "Слои").

## Journal details as a readable diff (done in MCP)

Redmine returns journal details with ids as strings, such as `status_id` from `"1"` to `"2"`. A normalizer turns them into names through the same cached lookups, which is the main input a triage agent needs. `issue_context` depends on it. Source: `research.md` (section "Журналы").

Done for MCP: the normalizer lives in `packages/mcp/src/workflow/journals.ts` for now, with the name lookups it needs. It can move to the curated toolkit when that package exists, so scripts get the same diff.

## Webhook verification for Redmine 7.0 (later)

Redmine 7.0 sends outgoing webhooks for issues, wiki pages, time entries, news, and versions. Each request carries `X-Redmine-Signature-256`, which is `sha256=` followed by the HMAC-SHA256 of the body. A `/webhooks` entrypoint verifies it with WebCrypto and a constant-time compare, with no dependencies, and reuses the REST types for payloads. Redmine 6.x has no webhooks, so the same event interface runs over polling by `updated_on`. Check the final event list against the 7.0 release before building it. Source: `research.md` (section "События").

## Redmine 7.1 (later)

Add 7.1 when d-yoshi/redmine-openapi tags a 7.1 spec. The weekly `spec-watch` job opens an issue when that happens. 7.1 adds a Documents API. From 7.1 the server also ignores the `content_type` a client sends with an upload, so the `content_type` input of `attachments.upload` needs a note or a version guard. The steps are in "Add a Redmine version" in the root README. Source: `research.md` (section "Версионные entrypoints").

## Redmine 6.0 (later, only on demand)

Add 6.0 only if real instances need it. 6.0 is legacy stable, and the spec's earliest tags are for 6.1, so a 6.0 spec would have to be derived and verified by hand. Source: `research.md` (section "Версионные entrypoints"), and "Open questions" in `docs/architecture.md`.

## Optional response validation (later)

The SDK does not validate responses today. An opt-in hook that accepts any [Standard Schema](https://standardschema.dev) validator would let users plug in Zod 4 or similar without a dependency in the package. A dev mode could also log responses that differ from the spec's JSON Schema. Source: `research.md` (section "Стек"), and "Open questions" in `docs/architecture.md`.

## `/testing` entrypoint (later)

A fake transport and fixtures recorded from the Docker Redmine servers, so users can test code built on the SDK without a server. Today users write their own fake `fetch`, as the SDK README shows. Source: `research.md` (sections "Слои" and "Стек").

## Inline uploads in create and update (later)

Let `issues.create` and `issues.update` take files directly and run the upload step inside the call. The design kept the explicit two-step `attachments.upload` so the extra request stays visible. Adding inline uploads later breaks nothing. Source: "Synthesis decision" in `docs/architecture.md`.

## Effect entrypoint (later)

A separate package, `@redmine-ts/effect`, for applications built on [Effect](https://effect.website). It keeps `effect` out of the SDK's dependencies and builds on the same registry and engine, so both clients cover the same operations. The plan:

- **Service.** The client is a service provided by a `Layer` built from the usual config.
- **Return types.** Every method returns an `Effect` whose error channel is a tagged union with one tag per `RedmineError` kind, so `Effect.catchTag("validation", ...)` works.
- **Listings.** They become a `Stream`.
- **Cancellation.** Effect interruption maps to the engine's `AbortSignal`, so cancelling stops the request.
- **Retries.** Effect `Schedule` takes over from the SDK's built-in policy.
- **Response decoding.** It can use Effect Schema. That also covers the Standard Schema hook above, since Effect Schema implements Standard Schema.

Source: the owner's request.

## Text formatting as config (later)

The API does not say whether an instance uses Textile or CommonMark, so an agent cannot know which syntax to write in notes. A config option would declare it, and the toolkit would use it when it writes text. Source: `research.md` (section "Окружение").

## Spec-diff bot (later)

When a new spec tag appears, a bot runs oasdiff between the vendored spec and the new tag, regenerates `src/generated/`, and opens a pull request with the drift report. The weekly `spec-watch` job, which opens a tracking issue, is the first step. Source: `research.md` (section "Стек", "Контрактные тесты").
