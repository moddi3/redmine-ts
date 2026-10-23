# Roadmap

This page lists work that is planned but not started, so it is not lost. Each item says why it matters and where the idea comes from. `research.md` is the owner's original research, in Russian. `docs/architecture.md` is the current design.

Items marked **next** come after the first release. Items marked **later** wait for a need or for an upstream release.

## MCP server package

`@redmine-ts/mcp` in `packages/mcp` is a new server built on the 2026-07-28 MCP spec and the official TypeScript SDK v2. It is not a clone of the owner's earlier generic Redmine MCP. Agents increasingly use code mode, so the server optimizes for precise, typed tools rather than a small tool count. The owner's decisions: access is full by default, deletes included; `--read-only` and `--no-delete` (or `REDMINE_MCP_ACCESS`) narrow it, and the strictest wins; `raw_request` stays available but obeys the access mode; OAuth waits until after v1.

- **Done (phase 2):** one generated tool per SDK operation (86), named `<namespace>_<verb>`, with the catalog's input and output schemas, explicit annotations (updates count as destructive, as the spec defines it), agent-oriented descriptions, rewritten filter descriptions, paged list results with a concise default, actionable error results, version and access filtering, and stdio.
- **Done (phase 3):** hand-written workflow tools on the same tool path as the generated ones: `issue_context` (the issue, allowed statuses, relations read from the issue, subtasks with status, attachments, watchers, and journals as readable changes with names), `reference_data` (names to ids, globals cached for 5 minutes per server), `issues_transition` (status by id or name, refusals list the allowed statuses by id and name), `attachments_upload` (text, base64, or a path in `REDMINE_MCP_FILES_DIR`, capped at 5 MB), `attachments_download` (small images as image content, small text as text, thumbnails), `attachments_save` (only with a files directory), `raw_request` (listed in every mode, hints and description by mode), and the `redmine://issues/{id}` resource as Markdown.
- **Done (phase 4):** Streamable HTTP. `redmine-mcp --http` serves `/mcp` on `127.0.0.1:3737` by default, and `createRedmineMcpHandler` is the same server as a web-standard handler for Bun and Workers. Each request brings its user's key in `X-Redmine-API-Key` against the one `REDMINE_URL`, the access modes apply as over stdio, 2025-era clients are served statelessly next to 2026-07-28 ones, and Origin and, on loopback, Host are checked with the MCP SDK's helpers.
- **Done (phase 5):** the package is public, with the `redmine-mcp` command and the Node-only `@redmine-ts/mcp/node` entry, and 0.1.0 is its first release. While npm/cli#9969 blocks trusted publishing for this repository, releases are published from the owner's machine (`docs/releasing.md`).
- **Open after phase 4:** CORS for browser clients on other origins (`--allow-origin` only lifts the 403 today), a Host allowlist flag for proxies that keep the client's Host, tool schemas without `type` arrays (the MCP Inspector's `--strict` warns 587 times across 57 tools that single-type dialects such as Gemini's may reject them), and the request id in the server's own HTTP error bodies (they send `id: null`, as the SDK's do).
- **Later:** OAuth for ChatGPT and claude.ai connectors, an eval set of golden prompts measuring tool selection on Claude and GPT, prompts, project, tracker and field allowlists for writes, and a listing in the official MCP Registry (it needs `mcpName` in `package.json` and a `server.json`).
- **Follow-ups found while building:** expose filter value words (such as `open`) in the SDK catalog so the server does not infer them; resolve the SDK for tests with tsdown's dev exports instead of tsconfig paths; shorten the longest tool descriptions. From phase 3: Redmine 6.1 and 7.0 ignore `assigned_to_id: null` on an issue update and clear the field only for `""`, while the SDK types and `issues_update` accept only an integer or null, so an agent cannot unassign without `raw_request`; and `where: { issue_id: [1, 2] }` compiles to `issue_id=1|2`, which Redmine reads as issue 1 only, because its `issue_id` filter takes a comma-separated list in one value.

The SDK stays free of `@modelcontextprotocol/sdk`. Sources: `research.md` (sections "Агенты и MCP" and "OAuth2 не заменяет клиентскую политику"), `docs/architecture.md`, and the MCP design proposal in this repository's decision log (`.audit/decisions.tsv`, phase `mcp-design`).

## Curated triage toolset (next)

About a hundred generated tools are too much context for an agent. A small set covers triage: `issue_context`, `search_issues`, `find_similar`, `propose_update` (a dry run that shows the diff and checks the status transition), `apply_update`, `add_note`, `link_issues`, and `log_time`. Inputs and outputs use names instead of ids, because models handle "In Progress" reliably and `status_id: 7` poorly. Name-to-id resolution lives in the toolkit over cached lookups, not in the SDK. Source: `research.md` (section "Агенты и MCP"), and "Tradeoffs accepted" in `docs/architecture.md`.

## Read-only mode and tool hints (next)

Agents and scripts that should only read need a guarantee, not a convention. Two halves share the operation registry, which already classifies each operation as `read`, `idempotent`, or `write`:

- **SDK, runtime: done.** `createRedmine({ access: "read-only" })` refuses every method but `GET`, and `"no-delete"` refuses `DELETE`, for generated methods, extras, listings and `rm.request`, before anything is sent, with the error kind `access_denied`.
- **SDK, types: open.** The client type still has the write methods. Narrowing it by `access`, so a write on a read-only client fails to compile, is the remaining half. It guards scripts and dashboards that hold a powerful key at compile time too.
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
