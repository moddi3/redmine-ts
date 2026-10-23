# Roadmap

This page lists work that is planned but not started, so it is not lost. Each item says why it matters and where the idea comes from. `research.md` is the owner's original research, in Russian. `docs/architecture.md` is the current design.

Items marked **next** come after the first release. Items marked **later** wait for a need or for an upstream release.

## MCP server package (next)

A new package in this repo that replaces the owner's current generic Redmine MCP server, which has six tools: `redmine_paths_list`, `redmine_paths_info`, `redmine_request`, `redmine_upload`, `redmine_download`, and `redmine_attachment_image`. The first version keeps those tools and their behavior, so it can replace the current server without changes to the agents that use it.

The second step exposes one typed tool per operation. The SDK's `catalog` entrypoint is done: it gives each client method's input and output as JSON Schema 2020-12, with its method, safety class and versions, and contract tests validate it against real servers. The tool annotations come from the operation's safety class: `GET` gives `readOnlyHint`, `DELETE` gives `destructiveHint`, and `PUT` gives `idempotentHint`. The default policy is read-only. Writes need an allowlist of projects, trackers, and fields. Redmine 6.1 has an open defect where some issue mutations check the user's role and ignore the OAuth token's scopes, so the client-side policy is the reliable limit.

The SDK stays free of `@modelcontextprotocol/sdk`. Sources: `research.md` (sections "Агенты и MCP" and "OAuth2 не заменяет клиентскую политику"), and "Agent toolkit and MCP (later)" in `docs/architecture.md`.

## Curated triage toolset (next)

About a hundred generated tools are too much context for an agent. A small set covers triage: `issue_context`, `search_issues`, `find_similar`, `propose_update` (a dry run that shows the diff and checks the status transition), `apply_update`, `add_note`, `link_issues`, and `log_time`. Inputs and outputs use names instead of ids, because models handle "In Progress" reliably and `status_id: 7` poorly. Name-to-id resolution lives in the toolkit over cached lookups, not in the SDK. Source: `research.md` (section "Агенты и MCP"), and "Tradeoffs accepted" in `docs/architecture.md`.

## Read-only mode and tool hints (next)

Agents and scripts that should only read need a guarantee, not a convention. Two halves share the operation registry, which already classifies each operation as `read`, `idempotent`, or `write`:

- **SDK, runtime: done.** `createRedmine({ access: "read-only" })` refuses every method but `GET`, and `"no-delete"` refuses `DELETE`, for generated methods, extras, listings and `rm.request`, before anything is sent, with the error kind `access_denied`.
- **SDK, types: open.** The client type still has the write methods. Narrowing it by `access`, so a write on a read-only client fails to compile, is the remaining half. It guards scripts and dashboards that hold a powerful key at compile time too.
- **MCP.** Every tool carries annotations derived from the registry: `readOnlyHint` for reads, `destructiveHint` for `DELETE`, `idempotentHint` for `PUT` and `DELETE`, and `openWorldHint`. Clients act on them. ChatGPT developer mode treats a tool without `readOnlyHint` as a write tool, and Codex CLI runs read-only tools concurrently. A read-only mode registers only read tools, and include and exclude patterns narrow the tool list further.

Sources: the owner's request, which named a client called devrelay as the model (its link is still to be added here). `research.md` (section "Что есть сейчас") describes onozaty/redmine-mcp-server, which marks tools with `readOnlyHint` and filters them with regex patterns. Section "Агенты и MCP" sets read-only as the default policy.

## `gen` CLI for an instance config (next)

A command that reads an instance with an admin key and writes a config with literal types: custom field names mapped to `cf_<id>`, and the instance's statuses, trackers, and priorities. With that config, filters can read `cf.severity` instead of `cf_12`. Custom field definitions are visible only to admins, so the CLI also accepts a hand-written config of the same shape. Source: `research.md` (sections "Custom fields" and "Слои").

## Journal details as a readable diff (next)

Redmine returns journal details with ids as strings, such as `status_id` from `"1"` to `"2"`. A normalizer turns them into names through the same cached lookups, which is the main input a triage agent needs. `issue_context` depends on it. Source: `research.md` (section "Журналы").

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
