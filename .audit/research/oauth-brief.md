# OAuth for `@redmine-ts/mcp` over HTTP: research brief

Date: 2026-10-23. Sources are cited inline. "Probed" means checked against the local Docker Redmine servers: 7.0 on port 3070 and 6.1 on port 3061. Everything there was read-only, except for one throwaway OAuth application on 7.0. I created it, ran a full authorization-code + PKCE flow as `jsmith`, then deleted it and logged out both sessions. No container was restarted or reconfigured.

## Summary

- The MCP 2026-07-28 spec makes the MCP server an OAuth resource server. It must publish RFC 9728 protected resource metadata, answer 401 with a `Bearer` challenge, and accept only tokens issued for its own URL. It must never pass a client's token on to Redmine. Client ID Metadata Documents (CIMD) are SHOULD; Dynamic Client Registration (DCR) is MAY and deprecated.
- The installed `@modelcontextprotocol/server` 2.3.1 covers the whole resource-server half: bearer gate, challenge responses, protected resource metadata, audience check, and per-tool scope step-up. It ships no authorization server. The v1 AS helpers are frozen in `@modelcontextprotocol/server-legacy/auth`, which is Express-only and has no CIMD.
- claude.ai and ChatGPT can only reach us through OAuth. ChatGPT cannot send API keys at all. claude.ai's header mode is a beta, available to a limited set of orgs, and a custom header name like `X-Redmine-API-Key` needs Anthropic's approval. Claude Code, VS Code, Cursor and Codex can already send the header today.
- Redmine has been an OAuth2 provider since 6.1.0 (Doorkeeper). It supports authorization code + PKCE, refresh tokens, and Redmine permissions as scopes. It has no discovery metadata, no DCR, no CIMD, no `resource` or audience, no introspection and no `iss`, and every application is confidential and created by an admin. So Redmine cannot be the MCP authorization server directly, but it works well as the upstream identity provider behind ours.
- **Recommendation:** v1 = option (a). The MCP server becomes its own authorization server, federates login to Redmine's OAuth, and offers CIMD plus DCR. Its tokens are sealed and stateless, and Redmine's own single-use code and refresh-token rotation carry the state. This works the same on Node and Workers with no database. The `X-Redmine-API-Key` header mode stays.

---

## 0. Starting point

- `packages/mcp/src/http.ts` reads `X-Redmine-API-Key`, puts it into `authInfo.token`, and builds a server per request against one fixed `REDMINE_URL`. With no header it answers 401 without `WWW-Authenticate`, on purpose (the comment: "a Bearer challenge sends clients to OAuth"). In OAuth mode that 401 must become a Bearer challenge.
- `node-http.ts` answers 404 for every path except `/mcp`. OAuth needs `/.well-known/...`, `/authorize`, `/token`, `/register` and a callback route.
- The README's Caddy example rewrites `Host` to the upstream (`header_up Host {upstream_hostport}`). So the server cannot work out its public URL by itself. OAuth needs that URL as the `resource` identifier and the issuer, which means a `--public-url` setting is required.
- The SDK already has `auth: { bearer: string | { token(), refresh() } }`, with single-flight refresh after a 401 (`packages/sdk/src/core/config.ts`). This is the Redmine-side half of option (a).
- `research.md` ("OAuth2 не заменяет клиентскую политику") already says Redmine scopes do not replace client-side policy. That is confirmed below: issue writes ignore token scopes. The access modes stay the real guard.

## 1. MCP authorization, spec 2026-07-28

Sources: [authorization][spec-auth], [AS discovery][spec-disc], [client registration][spec-reg], [security considerations][spec-sec], [security best practices][spec-sbp].

| Topic                                      | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                  | Level                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Applicability                              | Authorization is OPTIONAL. HTTP transports that support it SHOULD conform. stdio SHOULD NOT (credentials come from the environment).                                                                                                                                                                                                                                                                                         | [spec-auth]              |
| Roles                                      | The MCP server is an OAuth 2.1 resource server. The AS may be hosted together with the resource server or separately.                                                                                                                                                                                                                                                                                                        | [spec-auth]              |
| Protected resource metadata (RFC 9728)     | Servers MUST implement it, and the document MUST list at least one `authorization_servers` entry. Clients MUST use it.                                                                                                                                                                                                                                                                                                       | [spec-auth], [spec-disc] |
| How clients find it                        | Servers MUST offer one of two: `resource_metadata` in the `WWW-Authenticate` of a 401, or a well-known URI (`/.well-known/oauth-protected-resource/<path>` first, then root). Clients MUST support both, prefer the header, and MUST be able to parse `WWW-Authenticate` on 401.                                                                                                                                             | [spec-disc]              |
| AS metadata                                | The AS MUST provide RFC 8414 or OIDC Discovery. Clients MUST try both, in a fixed path-insertion order, and MUST reject a document whose `issuer` differs from the URL it was built from.                                                                                                                                                                                                                                    | [spec-auth], [spec-disc] |
| Client registration                        | Clients MUST get a client ID by one of: pre-registration, CIMD, or DCR. Client priority: pre-registered, then CIMD (if `client_id_metadata_document_supported`), then DCR (if `registration_endpoint`), then prompt the user. CIMD is SHOULD for both AS and clients. DCR is MAY and "deprecated, retained for backwards compatibility". Clients SHOULD support static credentials.                                          | [spec-reg]               |
| CIMD on the AS                             | SHOULD fetch URL-shaped `client_id`s. MUST check that the document's `client_id` equals its URL. MUST validate redirect URIs against the document. MUST validate the document's structure. SHOULD cache. SHOULD guard against SSRF. SHOULD warn on localhost-only redirect URIs, and MUST clearly show the redirect host. MAY apply domain trust policies.                                                                   | [spec-reg], [spec-sec]   |
| PKCE                                       | Clients MUST use PKCE with S256, and MUST refuse to proceed if the AS metadata lacks `code_challenge_methods_supported`. OIDC providers MUST include that field.                                                                                                                                                                                                                                                             | [spec-sec]               |
| Resource indicators (RFC 8707)             | Clients MUST send `resource` (the canonical server URI, e.g. `https://mcp.example.com/mcp`) in both the authorization and token requests, "regardless of whether authorization servers support it".                                                                                                                                                                                                                          | [spec-auth]              |
| Audience                                   | Servers MUST validate that a token was issued for them as audience, MUST accept only tokens for their own resources, and "MUST NOT accept or transit any other tokens".                                                                                                                                                                                                                                                      | [spec-auth], [spec-sec]  |
| Token passthrough                          | Forbidden. An upstream call uses a separate token, issued by the upstream AS. The server "MUST NOT pass through the token it received from the MCP client".                                                                                                                                                                                                                                                                  | [spec-sec], [spec-sbp]   |
| Token usage                                | `Authorization: Bearer` on every request, never in the query string. An invalid or expired token MUST get 401.                                                                                                                                                                                                                                                                                                               | [spec-auth]              |
| Scopes                                     | Servers SHOULD put `scope` in the 401 challenge. Clients use, in order: the challenge's `scope`, then PRM `scopes_supported`, then nothing. `scopes_supported` is the minimal set, and more comes by step-up. Servers SHOULD NOT advertise `offline_access`.                                                                                                                                                                 | [spec-auth]              |
| `insufficient_scope` and step-up           | On a runtime scope shortfall: SHOULD answer 403 with `WWW-Authenticate: Bearer error="insufficient_scope", scope="…", resource_metadata="…"`, putting all needed scopes in one challenge. Clients re-authorize with the union of old and new scopes and retry a bounded number of times. Servers MUST honour scope hierarchies.                                                                                              | [spec-auth]              |
| Status codes                               | 401 for missing or invalid tokens, 403 for scope or permission problems, 400 for malformed requests.                                                                                                                                                                                                                                                                                                                         | [spec-auth]              |
| `iss` (RFC 9207)                           | The AS SHOULD send `iss` in authorization responses, and if it does, MUST set `authorization_response_iss_parameter_supported: true`. Clients MUST validate it. Expected to become a MUST.                                                                                                                                                                                                                                   | [spec-auth]              |
| Transport security                         | All AS endpoints MUST be HTTPS. Redirect URIs MUST be localhost or HTTPS. Exact matching against registered redirect URIs is required. State SHOULD be used.                                                                                                                                                                                                                                                                 | [spec-sec]               |
| Refresh                                    | Short-lived access tokens are SHOULD. For public clients, rotating refresh tokens is MUST.                                                                                                                                                                                                                                                                                                                                   | [spec-sec]               |
| Proxies to a third-party AS (our option a) | A proxy with a static upstream client ID MUST get per-client consent before forwarding to the upstream AS. Consent page: client name, scopes, redirect URI, CSRF protection, `frame-ancestors`/`X-Frame-Options`. Consent cookies: `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, signed, bound to `client_id`. Redirect URIs matched exactly. `state` is single-use, set only after consent, expires in about 10 minutes. | [spec-sec], [spec-sbp]   |

The "third-party authorization flow" was a named section only in [2025-03-26][spec-2025-03]: the MCP server is an OAuth client of the third-party AS and an AS to the MCP client, and it "generates its own access token bound to the third-party session". 2026-07-28 no longer names it, but still allows it: the AS is out of scope and may be co-hosted, and the confused-deputy rules above govern it.

OAuth 2.1 details that matter for stateless designs ([draft-13][oauth21]): authorization codes must expire quickly (10 minutes at most is RECOMMENDED). A second valid use of a code must be rejected, and the tokens it issued revoked (§4.1.3, §7.5.3). For public clients, refresh-token replay must be detected, either by sender-constraining (DPoP or mTLS) or by rotation that keeps the token family (§4.3.1).

## 2. What clients support today

Detailed per-client notes, all from vendor docs, source code or live fetches on 2026-10-23, are summarized here. The claude.ai and ChatGPT rows were re-checked against [claude auth][cl-auth] and [OpenAI auth][oai-auth].

| Client                               | CIMD (`client_id` URL)                                                                                                                                                                                        | DCR                                   | Static client credentials                                            | Redirect URI                                                                                                                                          | `resource` / S256 / refresh / step-up                                                          | Header without OAuth                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude.ai (web, Desktop, mobile)     | Yes, recommended: `https://claude.ai/oauth/mcp-oauth-client-metadata`. Used only if the AS advertises `client_id_metadata_document_supported: true` **and** `none` in `token_endpoint_auth_methods_supported` | Fallback                              | "Use your own OAuth client" (ID and optional secret)                 | Fixed: `https://claude.ai/api/mcp/auth_callback`                                                                                                      | yes / yes / yes (`offline_access` appended if the AS lists it) / 403 step-up yes               | `static_headers`: beta, limited orgs, Owner-entered, shared org-wide. `authorization`, `x-api-key` and `x-auth-token` work. Other names need Anthropic approval |
| ChatGPT (custom MCP server, plugins) | Yes, preferred: `https://chatgpt.com/oauth/client.json` if the AS supports RFC 9207 `iss`, else `https://chatgpt.com/oauth/{callback_id}/client.json`. Auth `none` or `private_key_jwt`                       | Builder's choice, once per connection | "Used if provided" (UI field unconfirmed)                            | `https://chatgpt.com/connector_platform_oauth_redirect` with `iss` support, else a per-connection `https://chatgpt.com/connector/oauth/{callback_id}` | yes / required / yes / via tool-result `_meta["mcp/www_authenticate"]` (plain 403 unconfirmed) | **No.** OAuth, none, or mixed only. It "cannot present custom API keys" ([oai-auth])                                                                            |
| Claude Code                          | Yes: `https://claude.ai/oauth/claude-code-client-metadata` (loopback, any port)                                                                                                                               | Fallback                              | `--client-id`, `--client-secret`, `--callback-port`                  | `http://localhost:<random>/callback`                                                                                                                  | yes (inferred) / yes / yes / manual re-auth in `/mcp`                                          | Yes, any header (`--header`, `headersHelper`)                                                                                                                   |
| VS Code                              | Yes (source): `https://vscode.dev/oauth/client-metadata.json`, tried before DCR                                                                                                                               | Fallback                              | `oauth.clientId` in `mcp.json`, or a prompt                          | `http://127.0.0.1:33418/`, `https://vscode.dev/redirect`                                                                                              | yes / yes / yes / yes                                                                          | Yes, any header                                                                                                                                                 |
| Cursor                               | Not confirmed shipped (staff, 2026-09-22). A document exists at `https://cursor.com/oauth/mcp-client.json`                                                                                                    | **Default**                           | `auth: {CLIENT_ID, CLIENT_SECRET, scopes}`                           | `http://localhost:8787/callback`, `https://www.cursor.com/agents/mcp/oauth/callback`                                                                  | yes / PKCE (method unnamed) / yes / unconfirmed                                                | Yes, any header                                                                                                                                                 |
| Codex                                | Yes, default: `https://chatgpt.com/oauth/codex/client.json` (needs `iss`), else a per-server URL. Needs auth `none` and a loopback callback                                                                   | Fallback                              | `--oauth-client-id`/`--oauth-client-secret`, `[mcp_servers.X.oauth]` | `http://127.0.0.1:<random>/callback` (RFC 8252 variable port)                                                                                         | yes / yes / yes / detected, manual `codex mcp login`                                           | Yes (`env_http_headers`, `bearer_token_env_var`)                                                                                                                |

What follows for the AS we expose:

- Advertise CIMD (`client_id_metadata_document_supported: true`) with `none` in `token_endpoint_auth_methods_supported` and `S256` in `code_challenge_methods_supported`. Keep DCR for Cursor.
- Return `iss` and advertise `authorization_response_iss_parameter_supported: true`. That gives ChatGPT and Codex their stable CIMD document and redirect URI.
- Match loopback redirect URIs on `localhost` and `127.0.0.1` with any port (RFC 8252 §7.3), because Claude Code and Codex pick ports at random. Match every other redirect URI exactly.
- Tolerate unfamiliar `grant_types` in CIMD documents: claude.ai's lists `jwt-bearer` ([claude-ai-mcp#1148][cl-1148]).
- claude.ai specifics ([cl-auth]):
  - It needs a real HTTP 401, not a 200 with `isError`.
  - It uses only the first `authorization_servers` entry.
  - Discovery, registration and token calls must answer within 10 s, refresh within 30 s.
  - It connects from `160.79.104.0/21`, so the server must be on public HTTPS.
  - The PRM `resource` must equal the URL the user typed.
- ChatGPT likewise connects from OpenAI's cloud and needs public HTTPS or its tunnel ([oai-auth]).

## 3. Redmine as an OAuth provider

| Question                                 | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Source                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Ships an OAuth2 AS?                      | Yes, since **6.1.0**: Feature #24808 "OAuth2 support for Redmine API Apps (OAuth2 Provider)", Doorkeeper `~> 5.8.2`. The 6.1.5 and 7.0.2 configs are identical. Trunk moves to Doorkeeper 5.9.6 with the same config.                                                                                                                                                                                                                                                                                                                                                                                                        | [CHANGELOG 7.0.2][rm-changelog], [redmine.org #24808][rm-24808], [Gemfile 7.0.2][rm-gemfile], [30-redmine.rb][rm-init] |
| Grants                                   | `grant_flows ['authorization_code']` only. Probed: client credentials returns `unsupported_grant_type`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [rm-init], probed 6.1 and 7.0                                                                                          |
| PKCE                                     | The `enable_pkce` migration adds `code_challenge` and `code_challenge_method`, so Doorkeeper allows `plain` and `S256`. PKCE is not forced (`force_pkce` unset). Probed: a wrong verifier gets `invalid_grant`, the right one succeeds.                                                                                                                                                                                                                                                                                                                                                                                      | [enable_pkce migration][rm-pkce], [Doorkeeper config][dk-config], probed 7.0                                           |
| Refresh tokens                           | `use_refresh_token`. Access tokens last 2 h (Doorkeeper default 7200), codes 10 min. Probed: refresh returns a new pair. The old refresh token keeps working until the new access token is first used (Doorkeeper's `previous_refresh_token`). The old access token stays valid until it expires.                                                                                                                                                                                                                                                                                                                            | [rm-init], [dk-config], probed 7.0                                                                                     |
| Scopes                                   | Redmine permission names plus `admin`. `default_scopes` are the public permissions (`view_project`, `search_project`, `view_members`), and the admin's app form always adds them. `enforce_configured_scopes`. Probed: a token without `view_time_entries` gets 403 on `/time_entries.json`, while the same user's API key gets 200. With the `admin` scope missing, an admin acts as a non-admin.                                                                                                                                                                                                                           | [rm-init], [user.rb][rm-user], [oauth2_applications_controller.rb][rm-appctl], probed 7.0                              |
| Scope enforcement gaps                   | **Issue edits ignore the token's scope.** `Issue#attributes_editable?`, `notes_addable?` and `deletable?` go through `user_tracker_permission?`, which checks roles without the scope. Because `add_issue_notes` maps to `issues#update`, a token scoped to `add_issue_notes` can change any attribute the user's role may edit. This is open defect #44271 "OAuth token scopes ignored for issue edit, notes and delete". It is now login-walled on redmine.org; its text is known from a search snapshot. The 7.0.2 source still has the pattern. A separate scope bypass in the user account (#44174) was fixed in 6.1.3. | [issue.rb 7.0.2][rm-issue], [preparation.rb][rm-perm], [rm-changelog], [rm-44271]                                      |
| `Authorization: Bearer` on the REST API? | Yes. `ApplicationController#find_current_user` tries the API key, then `Doorkeeper.authenticate(request)`, then Basic. It needs the REST API setting turned on. Probed: `GET /users/current.json` with a Bearer token returns 200 for `jsmith`, without `api_key` in the body. A revoked token gets 401 with `WWW-Authenticate: Bearer realm="Redmine", error="invalid_token"`. An OAuth token does not work as `X-Redmine-API-Key` or `?key=`.                                                                                                                                                                              | [application_controller.rb][rm-appc], probed 7.0                                                                       |
| Token format                             | Opaque random string, hashed at rest (`hash_token_secrets`). No JWT and no audience.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [rm-init], probed                                                                                                      |
| Introspection                            | Off: `allow_token_introspection false`. Probed: `/oauth/introspect` returns 404.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [rm-init], probed 6.1 and 7.0                                                                                          |
| Revocation                               | `/oauth/revoke` (RFC 7009) with client authentication. Probed: revoking works. Users revoke apps under `/oauth/authorized_applications`. Deleting the app kills its tokens (probed 401).                                                                                                                                                                                                                                                                                                                                                                                                                                     | probed 7.0                                                                                                             |
| Discovery metadata                       | **None.** Probed: `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` return 404 on 6.1 and 7.0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | probed                                                                                                                 |
| DCR / CIMD                               | **None.** Probed: `/oauth/register` returns 404. Doorkeeper has no CIMD. Applications are created by admins only (`admin_authenticator`), in Administration, Applications.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [rm-init], probed                                                                                                      |
| Client types                             | Every app is **confidential**: the form has no "confidential" field and the column defaults to `true`. Probed: a token request without the secret gets `invalid_client`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [create_doorkeeper_tables][rm-tables], probed 7.0                                                                      |
| Redirect URIs                            | HTTPS is required except for hosts `localhost` and `127.0.0.1`. `data:`, `javascript:` and `vbscript:` are blocked. Matching is exact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [rm-init]                                                                                                              |
| `resource` (RFC 8707)                    | Ignored. Probed: the consent form drops it, and the token response has no audience.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | probed 7.0                                                                                                             |
| `iss` (RFC 9207)                         | Not sent. Probed: the redirect carries only `code` and `state`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | probed 7.0                                                                                                             |
| Consent skipping                         | For a confidential app, Doorkeeper auto-approves when the user already holds an active token with the same scopes (`can_authorize_response?`). This is the precondition for the confused-deputy attack in [spec-sbp].                                                                                                                                                                                                                                                                                                                                                                                                        | [Doorkeeper authorizations_controller][dk-authz]                                                                       |
| Admin setup                              | Turn on the REST API. Then in Administration, Applications, create an app with a name, an exact redirect URI and the scopes. The secret is shown once and hashed with BCrypt. Sudo mode, if enabled, applies.                                                                                                                                                                                                                                                                                                                                                                                                                | [rm-init], probed                                                                                                      |

Conclusion: the Redmine leg can be a standard confidential OAuth client with PKCE S256 and refresh, against a single app the admin registers once. Everything the MCP spec asks of the AS (metadata, CIMD or DCR, public clients, audience, `iss`) has to come from our side.

## 4. Architecture options

### SDK coverage

All options use the same resource-server pieces, all in `@modelcontextprotocol/server` 2.3.1 and runtime-neutral (`dist/index.d.mts`; [SDK authorization guide][ts-authz]):

- `requireBearerAuth` and `verifyBearerToken`, with `expectedResource` for the audience check. The gate rejects a token whose verifier result has no `expiresAt`.
- `bearerAuthChallengeResponse`, which answers 401 or 403 with the `WWW-Authenticate` challenge.
- `oauthMetadataResponse`, which serves `/.well-known/oauth-protected-resource/<path>` plus a verbatim mirror at `/.well-known/oauth-authorization-server`.
- `buildOAuthProtectedResourceMetadata`, `getOAuthProtectedResourceMetadataUrl`, `resourceUrlFromServerUrl` and `checkResourceAllowed`.
- `scopeChallenge` on `registerTool`, `registerResource` and `registerPrompt`, with `requireScopes`. This gives per-operation 403 step-up before the handler runs.
- Types: `OAuthMetadata`, `OAuthClientMetadata`, `OAuthTokens`, `OAuthError` and `OAuthErrorCode`.

The factory already receives `{ authInfo }` (`ctx.authInfo`), and `AuthInfo.extra` can carry the Redmine credential.

There is **no AS** in v2. The guide says the AS helpers "are frozen in `@modelcontextprotocol/server-legacy/auth`. Use a dedicated identity provider for new servers" ([ts-authz]). `server-legacy` 2.3.1 is "Deprecated", needs `express` as a peer, is "planned for removal in v3", and its router has no CIMD ([server-legacy README][legacy]).

Third-party AS libraries:

- **`@cloudflare/workers-oauth-provider` 1.2.4**, Workers only ([README][wop], [storage schema][wop-storage], [upstream sign-in][wop-up]). It implements MCP 2026-07-28: CIMD, DCR, PKCE, RFC 8707 audiences, RFC 9207, rotation and revocation. It stores everything in KV with tokens hashed and `props` encrypted under a key that only the token unwraps. Its `tokenExchangeCallback` refreshes upstream tokens, which is exactly option (a).
- **panva `oidc-provider` 9.13.0**, Node only: DCR, RFC 8707, and CIMD as `features.clientIdMetadataDocument` ([docs][oidcp]). It is heavy (Koa) and overkill for one fixed resource.

### (a) The MCP server is the AS and federates login to Redmine OAuth

The flow:

1. The MCP client registers by CIMD or DCR.
2. `/authorize` checks the client, the redirect URI, PKCE S256 and `resource`, then shows **our** consent page: "Allow _Claude_ (redirect host `claude.ai`) to act as you on `tracker.example.com`?"
3. After consent, the server redirects to Redmine's `/oauth/authorize` with our static `client_id`, its own PKCE pair and a single-use `state`.
4. Redmine logs the user in (2FA applies) and redirects to `/oauth/redmine/callback`.
5. The server issues **its own** code to the MCP client's `redirect_uri`, with `iss`.
6. At `/token` the MCP client gets **our** access and refresh tokens, with audience equal to our canonical URL.
7. Each MCP request turns our token into the user's Redmine token, and the SDK calls Redmine with `auth: { bearer }`.

The client's token never reaches Redmine, so there is no passthrough.

- **Clients:** every client in section 2 works, through CIMD (claude.ai, ChatGPT, Claude Code, VS Code, Codex) or DCR (Cursor), plus static IDs if wanted. The header mode stays for CLI and IDE clients.
- **Stateless variant (recommended):**
  - The server keeps one secret and seals every artifact with AES-256-GCM (WebCrypto, identical on Node 22, Bun and Workers).
  - DCR `client_id` = sealed registration metadata, so there is no client store. CIMD needs only an optional in-memory cache.
  - Our authorization code = sealed `{Redmine code, our PKCE verifier for Redmine, client_id, redirect_uri, client's code_challenge, resource, scope, exp ≤ 10 min}`. The Redmine code is exchanged only at our `/token`. Redmine then enforces single use: a second exchange fails with `invalid_grant`. That satisfies OAuth 2.1 §4.1.3 without a store.
  - Our access token = sealed `{Redmine access token, sub, client_id, scope, aud, exp}`, with `exp` no later than Redmine's (2 h minus skew; 1 h suggested).
  - Our refresh token = sealed `{Redmine refresh token, client_id, scope, aud}`. `/token` with `refresh_token` refreshes at Redmine and mints a new sealed pair.
  - Replay of an old refresh token fails at Redmine once the new access token has been used, because Doorkeeper revokes the previous refresh token then. Reuse is detected, but there is no family revocation and there is a short window before first use: a deviation to document.
  - Per-client consent goes in a signed `__Host-` cookie bound to `client_id`, which [spec-sbp] explicitly allows. The `state` cookie is set only after consent.
- **Variant with a store:** keep grants in a key-value store, as workers-oauth-provider does in KV.
  - Pros: full replay revocation, per-client revocation, and an admin view of grants.
  - Node: in-memory for a single process, SQLite or Redis for production.
  - Workers: KV is eventually consistent ("up to 60 seconds") and "not ideal… for atomic operations", so single-use and rotation want Durable Objects ([KV docs][cf-kv]).
- **Security:**
  - The user never handles an API key.
  - Redmine tokens are scoped, expire after 2 h, and can be revoked in Redmine by the user (authorized applications) or the admin (delete the app).
  - The server secret protects every sealed Redmine token. If it leaks together with captured tokens, those tokens are exposed until they expire or are refreshed, and rotating the secret logs everyone out. With the store variant, a leak of the store plus the secret exposes the same set.
  - Required: our own consent page, because Redmine auto-approves repeats; exact and loopback redirect matching; CSRF and `frame-ancestors 'none'`; CIMD SSRF guard (HTTPS only, public addresses only, size and time limits; on Workers the `global_fetch_strictly_public` flag); HTTPS everywhere.
  - Redmine scopes do not protect issue writes (#44271), so the access modes remain the write guard.
- **Operator setup:**
  1. Run Redmine 6.1 or later with the REST API on.
  2. As admin, create one app with redirect URI `https://mcp.example.com/oauth/redmine/callback` and the chosen scopes.
  3. Set `REDMINE_OAUTH_CLIENT_ID`, `REDMINE_OAUTH_CLIENT_SECRET`, `REDMINE_MCP_PUBLIC_URL`, and a 32-byte `REDMINE_MCP_OAUTH_SECRET`.
  4. Put it behind public HTTPS.
- **SDK coverage:** the RS half and the SDK's bearer refresh are covered. We write the AS endpoints, the consent page and the sealing. On Workers, `workers-oauth-provider` could replace our AS.

### (b) The MCP server is the AS, and its consent page asks for the Redmine API key

Steps 1 to 2 are as in (a). The page then asks the user to paste their API key. The server checks the key with `GET /users/current.json` and shows "signed in as _John Smith_ on `tracker.example.com`". It issues tokens bound to the key.

- **Clients:** same as (a).
- **Stateless?** Yes for tokens. Seal `{api_key, user id, client_id, scope, aud, exp}` with the server key, so the API key never leaves the server in clear and a stolen token is only usable at our server until `exp`. The ciphertext is opaque to the token holder.
  - But nothing upstream carries the state. Single-use codes and public-client refresh rotation (OAuth 2.1 MUSTs) need our own replay store: in-memory on one Node process, Durable Objects on Workers.
  - Otherwise we must accept a deviation (short code TTL plus PKCE, no refresh tokens), or issue long-lived access tokens, which goes against the short-lived SHOULD.
- **Security:**
  - Works on any Redmine and needs no admin step.
  - Revocation is coarse but simple: the user resets their API key in Redmine, and every token dies. That needs the server to turn Redmine's 401 into HTTP 401 `invalid_token`, because claude.ai only re-authenticates on a real 401.
  - API keys are full-power, unscoped and never expire. Only the MCP access modes limit them.
  - **It trains users to paste a master credential into a page that is not Redmine**, which a phishing server can imitate. The current header mode already gives the key to the server, but the pasting habit is new.
- **Operator setup:** `REDMINE_MCP_PUBLIC_URL`, the secret, public HTTPS. No Redmine admin needed.
- **SDK coverage:** as (a), minus the Redmine OAuth client.

### (c) Redmine is the AS directly

PRM would list Redmine in `authorization_servers`, and clients would get Redmine tokens.

- **Fails discovery:** no RFC 8414 or OIDC metadata (404), so spec clients cannot find endpoints or verify PKCE support, and MUST refuse. A facade, where we serve metadata that points at Redmine's endpoints, works around this but not the rest.
- **Fails registration:**
  - No CIMD or DCR, so an admin must pre-register every client. That needs a fixed redirect URI per client; for Claude Code and Codex it means pinning a callback port.
  - All apps are confidential, so every client needs a secret. ChatGPT's static-credentials field is unconfirmed, and claude.ai shares one org client.
- **Breaks audience validation and the passthrough rule:**
  - Redmine ignores `resource`, its tokens are opaque with no audience, and introspection is off.
  - Our server cannot tell a token minted for us from one minted for any other Redmine integration.
  - Using it means forwarding the client's token to Redmine, which is token passthrough ("MUST NOT accept or transit any other tokens").
  - **Not compliant; reject.**

### (d) Delegate login to an external IdP

Auth0, Keycloak, WorkOS, Entra or Okta would be the AS. We would be a resource server only, with a JWKS or introspection verifier: `requireBearerAuth` plus a JOSE library.

- **Clients:** depends on the IdP's CIMD, DCR and RFC 8707 support. That varies and I did not verify it per IdP.
- **Bridging the identity to Redmine is the hard part:**
  - (d1) The server holds an admin API key and impersonates with `X-Redmine-Switch-User`, mapping a claim to the Redmine login. The SDK already guards impersonation. But that puts an admin key on the server and turns any accepted token into "act as anyone", and the mapping must be exact.
  - (d2) Per-user account linking to a Redmine OAuth token or API key. That brings back (a) or (b) plus a store keyed by IdP `sub`.
- **Fits** organizations whose Redmine already uses the same SSO. **Operator burden:** run and configure the IdP.
- **SDK coverage:** RS half only. Supporting (d) costs us almost nothing once the resource-server seam exists (section 5).

### Comparison

|                                        | (a) federate to Redmine OAuth                          | (b) API key on consent page                         | (c) Redmine is the AS                                    | (d) external IdP               |
| -------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------- | ------------------------------ |
| Spec-compliant                         | Yes (stateless: minor refresh-replay window)           | Yes with a replay store; otherwise deviations       | **No** (no metadata or audience; passthrough)            | Yes, if the IdP is             |
| claude.ai / ChatGPT                    | Yes (CIMD)                                             | Yes (CIMD)                                          | Facade plus static creds per client; ChatGPT unconfirmed | Depends on IdP                 |
| Claude Code / VS Code / Codex / Cursor | Yes (CIMD; DCR for Cursor)                             | Yes                                                 | Pre-registered, pinned ports                             | Depends on IdP                 |
| Redmine versions                       | 6.1+ (the SDK's floor anyway)                          | All                                                 | 6.1+                                                     | All (d1); 6.1+ (d2 with OAuth) |
| Redmine admin step                     | Create one app                                         | None                                                | One app per client                                       | Admin key (d1) or app (d2)     |
| User handles API key                   | No                                                     | **Yes (pastes it)**                                 | No                                                       | No (d1)                        |
| Upstream credential                    | Scoped, 2 h tokens plus refresh                        | Full, non-expiring key                              | n/a                                                      | Admin key (d1)                 |
| State on Node                          | None (secret only)                                     | Replay store                                        | n/a                                                      | IdP's                          |
| State on Workers                       | None                                                   | Durable Object                                      | n/a                                                      | IdP's                          |
| Revocation                             | Redmine authorized apps or app delete; secret rotation | Reset API key; secret rotation                      | Redmine                                                  | IdP                            |
| Our code                               | AS endpoints, consent, sealing, Redmine client         | Same, minus Redmine client, plus key form and store | Facade only                                              | Verifier, identity bridge      |

## 5. Recommendation

### v1 scope

1. **Resource-server seam in `createRedmineMcpHandler`**, using SDK helpers only:
   - An `oauth` option: canonical `resource` URL, `authorizationServers`, and `verify(token)`. `verify` returns the Redmine credential (`{ bearer }` or `{ apiKey }`), `scopes`, `expiresAt`, `resource` and `clientId`.
   - The handler serves PRM with `oauthMetadataResponse`, gates with `requireBearerAuth({ expectedResource, resourceMetadataUrl })`, and answers 401 with the Bearer challenge.
   - It keeps accepting `X-Redmine-API-Key` when that header is present.
   - It maps a Redmine 401 during a request to HTTP 401 `invalid_token`.
   - This seam alone already lets operators front the server with workers-oauth-provider or an IdP.
2. **Built-in AS, option (a), stateless**, as a web-standard handler so Node, Bun and Workers share it:
   - Endpoints: `/.well-known/oauth-authorization-server`, `/authorize` (consent page), `/oauth/redmine/callback`, `/token` (`authorization_code`, `refresh_token`), and `/register` (stateless DCR).
   - CIMD: fetch with an SSRF guard, cache, an optional host allowlist, and tolerance for unknown `grant_types`.
   - Metadata: `code_challenge_methods_supported: ["S256"]` only; `token_endpoint_auth_methods_supported: ["none"]`; `authorization_response_iss_parameter_supported: true` with `iss` in every response; RFC 8707 audience equal to the one canonical URL.
   - Redirect matching: exact, with any-port loopback.
   - Tokens: access TTL of 1 h or less, so it never outlives the Redmine token. Refresh through Redmine.
   - Consent: a signed `__Host-` cookie bound to `client_id`.
   - CLI: `--public-url`, `REDMINE_OAUTH_CLIENT_ID`/`_SECRET`, `REDMINE_MCP_OAUTH_SECRET`. Node routes are added in `node-http.ts`.
3. **Scopes:** MCP scopes mirror the access modes: `redmine:read`, `redmine:write`, `redmine:delete`. The effective mode is the strictest of the server flag and the token. The PRM `scopes_supported` and the 401 challenge carry the server's configured mode. Each scope maps to a configured set of Redmine permission scopes requested upstream. Per-tool `scopeChallenge` step-up can wait.
4. **Docs and tests:**
   - README: the admin's Redmine app setup, the Caddy config with the public URL, and the note that Redmine scopes do not guard issue writes.
   - Contract tests against Docker 6.1 and 7.0 for the Redmine leg; unit tests for sealing, PKCE, redirect matching and CIMD validation.

### Out of v1

- Option (b) as a fallback for instances without an OAuth app.
- A grant store with per-client revocation.
- The external-IdP recipe (d), beyond the seam.
- Our own revocation endpoint (Redmine's can be called later).
- Per-tool step-up.
- DPoP, and enterprise-managed authorization (ID-JAG).
- Multiple Redmine instances.
- Listing in ChatGPT's directory (verified identity, domain challenge, review) and claude.ai's directory.
- Redmine below 6.1.

### Decisions for the owner

1. **AS flavor:** (a) Redmine-federated (recommended), (b) API-key consent, or (a) with (b) as an opt-in fallback.
2. **Built-in AS or seam only:** ship our own AS in `@redmine-ts/mcp` (portable, security code we own), or ship only the resource-server seam and document workers-oauth-provider and IdP recipes.
3. **Stateless or store:** accept the stateless design's short refresh-replay window and lack of per-client revocation, or add a storage interface (in-memory, SQLite or Redis on Node; Durable Objects on Workers).
4. **Scope model:** mirror the access modes as above, or a single `redmine` scope. Also which Redmine permission set each maps to. Redmine needs scopes requested explicitly, or the token carries only `view_project`, `search_project` and `view_members`.
5. **Keep header mode:** keep `X-Redmine-API-Key` beside OAuth (recommended). Optionally also accept `x-api-key` so claude.ai's header beta works without Anthropic approval.
6. **Client trust policy:** accept any CIMD or DCR client, or allowlist hosts (claude.ai, chatgpt.com, vscode.dev, cursor.com).
7. **Lifetimes and secret rotation:** access-token TTL; whether to support a previous secret during rotation.
8. **Runtimes in v1:** Node CLI only, or Workers too. The design runs on both; testing on both is the cost.

## Sources

[spec-auth]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
[spec-disc]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery
[spec-reg]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration
[spec-sec]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations
[spec-sbp]: https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
[spec-2025-03]: https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization
[oauth21]: https://www.ietf.org/archive/id/draft-ietf-oauth-v2-1-13.txt
[ts-authz]: https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization
[legacy]: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server-legacy/README.md
[wop]: https://github.com/cloudflare/workers-oauth-provider
[wop-storage]: https://github.com/cloudflare/workers-oauth-provider/blob/main/storage-schema.md
[wop-up]: https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/upstream-sign-in.md
[oidcp]: https://github.com/panva/node-oidc-provider/blob/main/docs/README.md
[cf-kv]: https://developers.cloudflare.com/kv/concepts/how-kv-works/
[rm-changelog]: https://github.com/redmine/redmine/blob/7.0.2/doc/CHANGELOG
[rm-24808]: https://www.redmine.org/issues/24808
[rm-44271]: https://www.redmine.org/issues/44271
[rm-gemfile]: https://github.com/redmine/redmine/blob/7.0.2/Gemfile
[rm-init]: https://github.com/redmine/redmine/blob/7.0.2/config/initializers/30-redmine.rb
[rm-pkce]: https://github.com/redmine/redmine/blob/7.0.2/db/migrate/20250611092227_enable_pkce.rb
[rm-tables]: https://github.com/redmine/redmine/blob/7.0.2/db/migrate/20250611092155_create_doorkeeper_tables.rb
[rm-appc]: https://github.com/redmine/redmine/blob/7.0.2/app/controllers/application_controller.rb
[rm-appctl]: https://github.com/redmine/redmine/blob/7.0.2/app/controllers/oauth2_applications_controller.rb
[rm-user]: https://github.com/redmine/redmine/blob/7.0.2/app/models/user.rb
[rm-issue]: https://github.com/redmine/redmine/blob/7.0.2/app/models/issue.rb
[rm-perm]: https://github.com/redmine/redmine/blob/7.0.2/lib/redmine/preparation.rb
[dk-authz]: https://github.com/doorkeeper-gem/doorkeeper/blob/v5.8.2/app/controllers/doorkeeper/authorizations_controller.rb
[dk-config]: https://github.com/doorkeeper-gem/doorkeeper/blob/v5.8.2/lib/doorkeeper/config.rb
[cl-auth]: https://claude.com/docs/connectors/building/authentication.md
[cl-1148]: https://github.com/anthropics/claude-ai-mcp/issues/1148
[oai-auth]: https://developers.openai.com/plugins/build/auth.md

- MCP spec 2026-07-28: [authorization][spec-auth], [AS discovery][spec-disc], [client registration][spec-reg], [security considerations][spec-sec], [security best practices][spec-sbp]. 2025-03-26 third-party flow: [spec-2025-03]. OAuth 2.1: [draft-13][oauth21].
- MCP TypeScript SDK: installed `node_modules/.pnpm/@modelcontextprotocol+server@2.3.1/.../dist/index.d.mts` and `mcp-DIH4cS6P.mjs`; [serving/authorization][ts-authz]; [server-legacy][legacy].
- AS libraries: [workers-oauth-provider][wop] ([storage][wop-storage], [upstream sign-in][wop-up]); [oidc-provider][oidcp]; [Cloudflare KV consistency][cf-kv].
- Redmine 7.0.2 and 6.1.5 source (configs identical): [initializer][rm-init], [ApplicationController][rm-appc], [User][rm-user], [Issue][rm-issue], [permissions][rm-perm], [migrations][rm-tables], [PKCE migration][rm-pkce], [apps controller][rm-appctl], [CHANGELOG][rm-changelog], [#24808][rm-24808], [#44271][rm-44271]. Doorkeeper 5.8.2: [authorizations controller][dk-authz], [config][dk-config]. Probes on the local Docker Redmine 6.1 and 7.0, 2026-10-23.
- Clients:
  - claude.ai: [auth][cl-auth], https://claude.com/docs/connectors/building/lazy-authentication.md, https://claude.com/docs/connectors/custom/add-unlisted.md, https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
  - ChatGPT: [auth][oai-auth], https://developers.openai.com/api/docs/guides/custom-mcp-server.md, https://developers.openai.com/plugins/deploy/submission.md
  - Claude Code: https://code.claude.com/docs/en/mcp
  - VS Code: https://code.visualstudio.com/docs/copilot/reference/mcp-configuration and `microsoft/vscode` `src/vs/workbench/api/browser/mainThreadAuthentication.ts`
  - Cursor: https://cursor.com/docs/context/mcp, https://forum.cursor.com/t/mcp-oauth-cimd-support-plans-and-timelines/148096
  - Codex: https://developers.openai.com/codex/mcp, `openai/codex` `codex-rs/rmcp-client/src/oauth_client_registration.rs`
  - Live CIMD documents fetched 2026-10-23 at the URLs in the section 2 table.
- Unconfirmed:
  - ChatGPT's UI field for static credentials, and its handling of a plain 403.
  - Whether Cursor has shipped CIMD.
  - The shipped VS Code CIMD URL (inferred from source, issues and the live document).
  - Claude Code's `resource` and S256 (inferred from Anthropic's statement that one infrastructure backs all Claude clients).
  - The current status of Redmine #44271 (login-walled). The 7.0.2 source still has the pattern.
