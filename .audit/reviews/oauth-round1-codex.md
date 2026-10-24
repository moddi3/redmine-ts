# Independent OAuth security and correctness review

**Verdict: changes required before treating this as a production OAuth 2.1 authorization server.**

Reviewed draft [PR #23](https://github.com/moddi3/redmine-ts/pull/23), branch `feat/mcp-oauth`, at **`f19e913e3623d3de75850c5796afc4fcb385a971`**, against `origin/main` **`e81ee62d863211fbece8367f313c88f0b3f97387`**, using the three-dot diff. All source references below are relative to `/Users/moddi3/.t3/worktrees/redmine-ts/t3-c2225f02`.

**Counts: critical 0; high 2; medium 6; low 4; informational 0.** There are 12 numbered findings. Additional deployment qualifications below are not counted as findings.

The highest-priority findings are an unauthenticated Node process crash through a metadata response, and refresh-token replay that can preserve stolen access indefinitely. Other material gaps include authorization-code replay across instances in API-key mode, unsafe metadata-fetch defaults for embedded Node use, and accepting confidential CIMD clients without authentication. I found no cryptographic forgery or direct bypass of an already-issued token's access mode in the cases checked.

## Evidence and scope

- Read the changed implementation, the relevant original HTTP/server/SDK enforcement paths, branch README, research brief, and unit-test fixtures. Checked relevant MCP and OAuth requirements against primary sources rather than treating the brief as authoritative.
- Permitted unit command: `cd /Users/moddi3/.t3/worktrees/redmine-ts/t3-c2225f02/packages/mcp && vp test --project unit`. **Exit 0; 10 files, 242 tests passed**, duration 2.02 seconds.
- Independent scratch probes: `vp test --config (session scratchpad)/oauth-astra-probes/vite.config.ts --reporter verbose --silent=false`, run from the package directory. **Final exit 0; 14 probes passed.** Assertions intentionally check observed behavior, including defects; this is not an acceptance suite. The configuration aliases the SDK to branch source. Fixtures use synthetic credentials and the branch's in-memory Redmine fake; no real Redmine calls occur.
- Independent Node transport probes import the branch's `public-fetch.ts` and replace only the DNS/HTTPS transport. HTTP 205 produced an uncaught exception and **exit 1**; HTTP 204 control **exit 0**. The address-classification probe **exit 0**. These prove adapter/filter behavior, not actual attacks on a remote network.
- Reproduction sources and the final flow-test log are in [oauth-astra-probes](./oauth-astra-probes/), particularly [probes.test.ts](./oauth-astra-probes/probes.test.ts), [probe-results.log](./oauth-astra-probes/probe-results.log), [public-fetch-205.mjs](./oauth-astra-probes/public-fetch-205.mjs), and [public-fetch-dns.mjs](./oauth-astra-probes/public-fetch-dns.mjs).
- One exploratory probe initially assumed trailing-slash discovery would return 404. It actually returned 200; that expectation was corrected. Finding 12 concerns the returned identifier mismatch, **not** missing discovery routes.
- No contract tests, Docker operations, live client sign-ins, real Workers deployment, source changes, commits, or pushes. Repository status was clean before and after the review. The supplied research brief's live-probe claims were not rerun.

## Findings, ranked by severity

### 1. High — a metadata server can crash the Node process with HTTP 205

**Location:** `packages/mcp/src/public-fetch.ts:92-105`, especially `:98-101`; reachable through `packages/mcp/src/oauth/clients.ts:76` and the CLI's configured `publicFetch` at `packages/mcp/src/config.ts:371`.

**Scenario and preconditions:** OAuth is enabled on Node with CIMD fetching and an attacker-controlled metadata host is admitted (the default admits any host). An unauthenticated request to `/mcp/oauth/authorize` supplies `client_id=https://attacker.example/meta.json` and any nonempty redirect URI. Client resolution fetches the document before checking PKCE or showing consent. The attacker's valid HTTPS endpoint answers `205 Reset Content`, even with `Content-Length: 0`.

The adapter treats only 204 and 304 as bodyless. It supplies a stream to `new Response(..., {status:205})`, which throws. That asynchronous HTTPS callback is outside the promise executor's synchronous exception handling; the exception does not reject `publicFetch` and is not caught by `fetchDocument` or the Node request listener. An ordinary CLI process exits, terminating all sessions. A host allowlist limits who can trigger this; it does not fix the response adapter.

**Evidence:** Confirmed in an isolated Node v26.12.0 process, importing the unchanged source with a synthetic incoming response. `node public-fetch-205.mjs 205` exited 1 with `TypeError: Response constructor: Invalid response status code 205` at `public-fetch.ts:101:11`, despite a surrounding `try/await/catch`. The 204 control resolved normally and exited 0. No live exploit was sent.

**Suggested fix:** Handle all null-body statuses, including 205; contain all response/header/stream construction exceptions inside the callback, destroy/cancel the response and reject the promise. Test this through an actual controlled HTTPS response or an equivalent asynchronous transport fixture.

### 2. High — refresh tokens are re-encrypted, but replay is not safely invalidated

**Location:** `packages/mcp/src/oauth/server.ts:539-565`, `:568-587`; test-fixture mismatch at `packages/mcp/tests/unit/oauth-fakes.ts:94-99`.

**Scenario and preconditions:** An attacker obtains a refresh token and its public client ID. In API-key mode, refreshing just validates the same Redmine key and issues another pair. The original token is never consumed, so the legitimate client and attacker can both keep using it for its entire 30-day validity, even after newer access tokens are used. Every successful replay creates another 30-day refresh token, so an attacker can maintain a separate chain until the key is reset or the sealing secret is invalidated. PKCE does not protect this grant type.

Federated mode delegates replay handling to Redmine and retains no family relationship or revocation state. Doorkeeper's configured revoke-on-use behavior can admit repeated refreshes before a descendant access token is used; detecting an invalid old token does not revoke the attacker's descendants. This is supported by the upstream [refresh request implementation](https://raw.githubusercontent.com/doorkeeper-gem/doorkeeper/v5.8.2/lib/doorkeeper/oauth/refresh_token_request.rb) and [previous-refresh-token revocation implementation](https://raw.githubusercontent.com/doorkeeper-gem/doorkeeper/v5.8.2/lib/doorkeeper/models/access_token_mixin.rb). The README acknowledges the federated limitation, but the API-key limitation is substantially wider. The unit fake deletes refresh tokens immediately, so its passing replay assertion does not establish actual Doorkeeper behavior.

**Evidence:** P2 confirmed three successful uses of the **same** API-key refresh token, including after both first descendants were used successfully: statuses `200, 200, 200`, distinct replacement tokens. Federated behavior is code/source reasoning, not a live Redmine test in this review.

**Suggested fix:** Use an atomic grant/refresh-family store shared across replicas, invalidate each predecessor on successful rotation and revoke the active family on reuse, or implement genuine sender-constrained refresh tokens. For API-key fallback, omit refresh tokens until one of those mechanisms exists. Merely changing the ciphertext is not rotation with replay protection. This matters under [OAuth 2.1 draft-13 §4.3.1](https://www.ietf.org/archive/id/draft-ietf-oauth-v2-1-13.txt), which is the draft referenced by MCP 2026-07-28.

### 3. Medium — API-key authorization codes are single-use only within one handler

**Location:** `packages/mcp/src/oauth/server.ts:519-521`, `:528-529`, `:733-741`.

**Scenario and preconditions:** API-key fallback runs in two Node processes, two Worker isolates, two independently constructed handlers, or a restarted process. Someone with the full code-exchange material, including the PKCE verifier, submits the same unexpired code to another instance. The second instance has an empty `redeemed` map, and an API key has no upstream consumption state, so it issues a second token pair. The exploit window for the code is 60 seconds, but the resulting refresh tokens persist much longer. Intercepting the redirect code alone remains insufficient because PKCE is checked.

The README explicitly documents this limitation. It nevertheless violates the single-issuance requirement in [OAuth 2.1 §4.1.3](https://www.ietf.org/archive/id/draft-ietf-oauth-v2-1-13.txt). In federated mode, Redmine's code consumption prevents a second successful issuance across instances. Separately, the local guard's replay rejection does not revoke tokens already issued from a code; the draft recommends that revocation where possible.

**Evidence:** P1: first handler `200`, same-handler repeat `400`, new handler with identical configuration and secret `200`. P11: a valid federated code replay got `400`, while the previously issued access token remained usable (`200`).

**Suggested fix:** Atomically consume code IDs in shared storage and retain their relationship to grants. Do not offer the API-key code flow as conformant across replicas without that store. Keep PKCE checks before consumption, as the current code does.

### 4. Medium — embedded Node OAuth defaults to an SSRF-capable metadata fetch

**Location:** `packages/mcp/src/oauth/server.ts:203-208`; lexical-only filtering at `packages/mcp/src/oauth/clients.ts:215-233`.

**Scenario and preconditions:** An application calls the exported `createRedmineMcpHandler` on Node and enables OAuth without supplying `fetchClientMetadata`. Unlike the CLI, this uses ordinary global `fetch`. An unauthenticated caller can supply a public-looking hostname that resolves to a private address, including through split-horizon DNS or rebinding. The lexical checks reject literals and some suffixes, but never examine resolved addresses. A name such as `service.company.example` is accepted irrespective of where it resolves.

This permits blind HTTPS connection attempts to the server's private network; an internal HTTPS service with a certificate valid for that name can receive attacker-selected GET paths and queries. TLS validation still applies, port 443 is fixed by the CIMD URL policy, and this is not evidence of arbitrary HTTP access or data exfiltration. The README advises supplying `publicFetch`, but the exported API's working default is unsafe for this trust boundary.

**Evidence:** P6 confirmed that omitting the override invokes the unguarded global fetch and completes authorization-page generation. The DNS/private-network consequence is source reasoning; no actual internal endpoint was contacted. The CLI is not affected by this default because it injects `publicFetch`.

**Suggested fix:** Fail closed when the runtime cannot provide a vetted metadata transport, require it explicitly, or provide a Node constructor that installs `publicFetch` automatically. Keep a separate explicit Workers transport policy rather than presenting global fetch as a universally safe default.

### 5. Medium — the public-address filter admits local IPv6 translation and site-local ranges

**Location:** `packages/mcp/src/public-fetch.ts:30-47`, `:57-65`.

**Scenario and preconditions:** A Node deployment has a route through a local NAT64 translator using `64:ff9b:1::/48`, or retains site-local IPv6 routing. An admitted metadata hostname resolves into such a range. The blacklist blocks `64:ff9b::/96`, but not the separate local-use translation prefix, and omits `fec0::/10`. The checked connection is therefore allowed to enter a network that the comment and API contract describe as excluded. Under a configured translation prefix, an embedded IPv4 destination can be private or link-local. TLS still constrains successful HTTP exchanges.

**Evidence:** `public-fetch-dns.mjs` passed synthetic DNS answers through the **actual** `publicLookup` supplied to HTTPS: `64:ff9b:1::a9fe:a9fe` and `fec0::1` were allowed. Controls for `127.0.0.1`, `::ffff:127.0.0.1`, `fc00::1`, and `64:ff9b::a9fe:a9fe` were blocked. No live NAT64 network was exercised. [RFC 8215](https://www.rfc-editor.org/rfc/rfc8215.html) defines the omitted local-use prefix.

**Suggested fix:** Deny the missing local/special-use ranges and validate the classification against maintained address registries. Cover local-use NAT64 explicitly; deployments with network-specific translation prefixes also need an egress policy. Add allow/deny controls for mapped IPv4 and all translation mechanisms supported by the network.

### 6. Medium — CIMD client authentication requirements are silently discarded

**Location:** `packages/mcp/src/oauth/clients.ts:34-41`, `:100-105`; `packages/mcp/src/oauth/server.ts:489-505`, `:553-558`.

**Scenario and preconditions:** A legitimate metadata document declares `token_endpoint_auth_method: "private_key_jwt"` and a `jwks_uri`. The schema strips both fields, resolves the client as an ordinary public client, and token/refresh requests require only a matching client ID hash. An attacker who steals that client's refresh token can redeem it without its private key. A client whose redirect is loopback also loses the declared authentication defense against another local process impersonating it. This is distinct from supporting only public clients: unsupported confidential metadata should be rejected, not downgraded silently.

**Evidence:** P7 confirmed acceptance of such a document. P14 completed authorization-code exchange and refresh without any client assertion or client-authentication header (`200`). [CIMD draft-00 §6.2](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-00.html#section-6.2) treats this declaration as confidential registration requiring the declared authentication.

**Suggested fix:** For this implementation, validate and require `token_endpoint_auth_method` to be absent or `none`, and reject unsupported authentication methods and prohibited secret metadata. Alternatively retain and enforce the declared method at the token endpoint. DCR can explicitly negotiate `none` in its response; immutable CIMD declarations cannot be silently rewritten that way.

### 7. Medium — an approved upstream state can authorize repeatedly without new consent

**Location:** `packages/mcp/src/oauth/server.ts:351-370`, `:430-467`.

**Scenario and preconditions:** A complete post-consent Redmine authorization URL is replayed in the same browser within ten minutes. The browser's reusable nonce still matches, and the state is never consumed. Redmine can silently approve the returning user and issue a fresh upstream code with the same PKCE challenge. The callback accepts the same state again and creates another independent MCP code. The holder of the original downstream verifier can redeem it without another MCP consent decision. This also matters if the Redmine account in that browser changes during the window.

This is not a demonstrated cross-browser CSRF attack: the browser binding rejects another browser, and the attacker needs access to the approved flow and the relevant downstream exchange material. Nevertheless, it fails the explicit single-use state requirement and expands the window in which a completed approval can be reused. The applicable [MCP proxy state guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices#mitigation) requires consumption after validation.

**Evidence:** P3 replayed one approved upstream authorization URL twice, with fresh fake-Redmine codes; both downstream exchanges returned `200`. No second consent POST occurred. The test models the specified silent re-approval behavior; it is not a real browser/Redmine run.

**Suggested fix:** Give each approved flow an independent transaction ID and atomically consume it at callback, bound to the browser and client. Retain the current sealed bindings and expiry. A purely stateless reusable browser nonce is not a replacement for flow consumption.

### 8. Medium — authorization failures become HTTP 200 tool errors, preventing client recovery

**Location:** `packages/mcp/src/http.ts:306-311`; `packages/mcp/src/server.ts:104-109`, `:184-193`.

**Scenario and preconditions:** A valid `redmine:read` token calls a write/delete tool, or a user's Redmine grant/key is revoked while the outer MCP access token remains unexpired. The bearer gate accepts the outer token and does not enforce the requested operation's scope. The SDK correctly refuses the prohibited write, or Redmine rejects the revoked credential. The server then serializes either failure as an MCP tool result under HTTP 200 without `WWW-Authenticate`.

Consequently, clients that use HTTP `403 insufficient_scope` for step-up or HTTP `401 invalid_token` for refreshing/re-authentication receive neither signal. They can continue failing until the outer token expires, up to about an hour. **This is an interoperability/recovery defect, not a write-scope bypass:** the denied operation was not sent. The roadmap already identifies both missing behaviors. [MCP authorization error handling](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#scope-challenge-handling) defines the relevant HTTP responses.

**Evidence:** P4 produced `200` with no challenge for a forced delete using a read token and verified zero Redmine calls. After fake upstream revocation, a read also returned `200` with no challenge and an error message about rejected credentials.

**Suggested fix:** Preserve the difference between token scope and the server's immutable access cap. Use the MCP SDK's operation scope challenge mechanism (including argument-dependent `raw_request`) for token-scope shortages, and propagate upstream credential rejection to an OAuth HTTP 401 boundary for bearer-authenticated requests. Preserve the established header-mode behavior where required. Do not tell clients to request scopes that the server's configured cap cannot grant.

### 9. Low — an unrecognized requested scope grants the maximum offered access

**Location:** `packages/mcp/src/oauth/scopes.ts:37-40`; caller `packages/mcp/src/oauth/server.ts:286`.

**Scenario and preconditions:** A client intends to request read access but sends a typo such as `scope=redmine:raed`, or an unsupported-only scope. `top === -1` is treated like omitted scope and returns all offered scopes. On the default full server this yields read, write and delete. This is surprising over-authorization caused by malformed input, although the consent page accurately lists the broader permissions and the user must approve them; it does not exceed a correctly issued token's scope or the server cap.

**Evidence:** P5 completed a flow with `redmine:raed` and received `scope="redmine:read redmine:write redmine:delete"`.

**Suggested fix:** Distinguish absent/empty scope from a supplied unrecognized scope. Reject unsupported scopes with `invalid_scope`, or define an explicit narrow compatibility policy; do not use maximum access as the fallback for an invalid request. Similarly, reject refresh scope sets containing ungranted names instead of silently intersecting them.

### 10. Low — short upstream lifetimes produce immediately expired successful token responses

**Location:** `packages/mcp/src/oauth/server.ts:178-182`, `:573-585`.

**Scenario and preconditions:** A Redmine administrator configures an access-token lifetime of 60 seconds or less, or an upstream token response reports that little remaining life. Any positive `expires_in` passes validation, after which the server subtracts a fixed 60-second skew. It returns HTTP 200 with zero/negative `expires_in` and an already-expired access token. Clients can enter immediate refresh/retry cycles. The normal two-hour Redmine default does not trigger this.

**Evidence:** P8 used a synthetic upstream `expires_in: 30`: the token endpoint returned success with `expires_in: -30`; its immediate MCP use returned 401.

**Suggested fix:** Check that the usable remaining lifetime is positive before issuing success; reject an unusable grant clearly or use a bounded skew policy that preserves a positive lifetime without outliving upstream. Keep the present upper lifetime cap.

### 11. Low — malformed Bearer headers with trailing fields are accepted

**Location:** `packages/mcp/src/http.ts:304-311`; inherited parser in `packages/mcp/node_modules/@modelcontextprotocol/server/dist/mcp-DIH4cS6P.mjs:524-529`.

**Scenario and preconditions:** A caller sends `Authorization: Bearer <valid-token> extra-token`. The dependency splits on a single space and uses only its first two fields, silently ignoring trailing content. The caller still needs a valid credential, so this is not an authentication bypass, but it accepts malformed authorization input and can disagree with proxies or security middleware that parse the full header.

**Evidence:** P9: the malformed header successfully called a tool (`200`). Inspection confirmed the parser is supplied by the installed SDK and newly used by this branch.

**Suggested fix:** Strictly validate a single Bearer credential before calling the helper, or update/fix the SDK parser. Accept the auth scheme case-insensitively and the permitted spacing, but reject extra credentials, delimiters and trailing fields.

### 12. Low — trailing-slash public URLs return a different resource identifier

**Location:** `packages/mcp/src/oauth/web.ts:94-103`; `packages/mcp/src/http.ts:205-209`, `:285-289`.

**Scenario and preconditions:** The operator sets `publicUrl=https://example.com/mcp/`, which passes validation, or a client connects to that accepted endpoint spelling. `publicPaths` removes the final slash and advertises `resource=https://example.com/mcp`. A client applying exact protected-resource metadata validation rejects this response. The installed SDK tolerates this normalization, so an SDK-based happy-path test alone does not establish conformance for other clients. [RFC 9728 §3.3](https://www.rfc-editor.org/rfc/rfc9728.html#section-3.3) requires the identifiers to match.

**Evidence:** P13 obtained a 401 at the configured slash-ending URL, followed its advertised metadata URI, and confirmed the returned resource omitted the slash. Path-inserted discovery also returned 200; route availability is not the defect. No named third-party client was run against this case.

**Suggested fix:** Preserve the configured resource identifier consistently in metadata, grants and comparisons, or reject noncanonical configurations and explicitly redirect alternate endpoint spellings to the one canonical resource before authorization discovery. Avoid silently accepting one identifier while publishing another.

## Areas checked and found sound, with boundaries

- **Cryptographic construction:** `oauth/seal.ts` derives separate AES-256-GCM keys per purpose using HKDF-SHA-256; the issuer is authenticated as AAD. Every seal obtains a fresh 96-bit random IV from WebCrypto. Expiry is enforced on open. The key cache is keyed by purpose within a sealer, and old secrets are used only to decrypt while new seals use the first secret. P12 confirmed purpose and issuer separation using the same secret. Existing tests cover tampering, expiry and rotation. I found no practical forgery or cross-purpose opening in the reviewed paths. The 32-character check measures length, not entropy; deployment must follow the documented random-secret generation.
- **PKCE and code bindings:** Both hops use S256. Downstream verifiers are length/character checked and hashed, and code redemption requires the issuing client hash and exact redirect URI. Failed binding checks happen before local replay consumption. Resource mismatches are refused, and issuer AAD prevents replay to another configured issuer using the same secret. Missing `resource` is accepted only for this server's fixed audience; the MCP mandate to send it is a client requirement, so its absence alone was not counted as an audience bypass.
- **Consent, CSRF and mix-up:** GET authorization validates the client/redirect before redirecting errors, rejects duplicate query parameters, and always shows per-client consent. The consent payload binds client, redirect, scope, PKCE, downstream state and browser nonce. Foreign-Origin form POSTs and other-browser callbacks are refused. Sealed upstream state is issued only after approval. The pre-consent cookie is only a browser binding, not a reusable consent grant. The fixed upstream provider and upstream PKCE prevent a code from a different flow being exchanged successfully; downstream success/error redirects include the fixed issuer and metadata advertises `iss` support. Finding 7 limits the state-replay conclusion.
- **Redirects:** Remote redirects require HTTPS and exact strings. HTTP exceptions are limited to explicit loopback hosts, and any-port matching preserves host/path/query and rejects credentials and fragments. The same helper applies to DCR and CIMD clients; P12 exercised positive and negative controls. The loopback warning and redirect host are visible. No wildcard/open redirect outside a client's declared redirect set was found. Normalizing loopback paths is slightly more permissive than byte equality, but I did not identify a distinct browser destination exploit.
- **Page hardening and API-key handling:** Dynamic HTML values are escaped in text and attributes. CSP disables scripts and arbitrary resources, restricts forms, disallows framing and base URI changes; X-Frame-Options is DENY. The browser cookie is `__Host-`, Secure, HttpOnly, SameSite=Lax, Path=/, with an unrelated name to Redmine's session. Allow/deny form responses use 303, so the API-key POST body is not forwarded on redirection. The key is checked before issue, encrypted in the grant, never displayed back in the page, and checked again at refresh. The warning addresses the real phishing trade-off, but cannot eliminate it. Findings 2 and 3 apply to reuse of those sealed credentials.
- **Resource-server enforcement:** API-key headers intentionally take precedence and use the server cap; empty headers allow bearer processing. A valid token's highest known scope is converted to an access mode and combined with the server's stricter mode. The SDK blocks forbidden HTTP methods, including through `raw_request`; P4 independently verified refusal before sending. Forged/expired/wrong-resource tokens get a 401 challenge, and tokens with no recognized scope get 403. Only the extracted Redmine credential is sent upstream, never the outer MCP bearer. Finding 8 concerns response semantics, not an authorization escape.
- **Metadata transport/cache:** Apart from findings 1, 4 and 5, the CLI transport checks the actual DNS answers used for the connection, avoiding a separate-lookup/rebinding gap. IPv4-mapped private addresses are blocked. Fetches are HTTPS GETs, no redirects are followed, and the client layer enforces a five-second deadline and 5 KiB streamed-body limit. Only successfully validated documents with an exactly matching client ID enter the bounded 256-entry cache. Host admission is checked before cached retrieval. No cross-client cache poisoning path was found.
- **Public URL, mounting and CORS:** Endpoints, issuer, resource and callback are derived from configured `publicUrl`, never Host or X-Forwarded headers. Nonloopback plain HTTP public URLs, embedded credentials, query and fragment are rejected for OAuth. Prefix routing and all three AS discovery locations are present; on a nonroot MCP mount the OAuth paths do not collide with Redmine's own `/oauth` paths. Protected-resource metadata is available both path-inserted and through the challenged in-mount URL. Allowed MCP origins receive Authorization-capable preflight responses and exposed WWW-Authenticate; token/registration/metadata CORS does not enable credentialed cookie reads. Root mounting necessarily claims root OAuth paths and should not share those paths with Redmine.
- **Errors/logs:** I found no direct logging or echoing of the sealing secret, API key, client secret or token in normal tested failure responses. CLI configuration errors name settings rather than their values. Arbitrary caller-supplied fetch/error callbacks and trusted upstream error strings are not a universal redaction boundary; they were not treated as proof of a concrete secret leak here.

## Deployment and validation qualifications

The HTTPS validation checks the **advertised MCP URL**, not the actual incoming connection; the Node listener is intentionally HTTP behind a TLS proxy. `redminePublicUrl` and the internal Redmine transport also permit HTTP, so operators still need to secure the browser-facing Redmine login and the credential-carrying upstream connection. Local HTTP development exceptions and browser acceptance of Secure cookies were not verified in real browsers.

For Workers, the absence of Node imports and the unit fake's unbound fetch test are portability evidence, not live security acceptance. The documented `global_fetch_strictly_public` flag changes same-zone fetches to use Cloudflare's public routing instead of bypassing the zone's frontend/security configuration; its [official documentation](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public) should not be replaced by an assumption that a mocked fetch proves all private-address protections. No deployed Worker was tested here.

Seals are bound to the issuer, not to the Redmine backend identity or application ID. P10 confirmed that keeping issuer/secret while changing `baseUrl` sends a previously sealed API key to the new backend. This is an operator-controlled trust change rather than a standalone remote exploit, so it is not counted as a finding; rotate/invalidate grants when repointing an issuer to a different trust domain. Removing API-key login rejects its code/refresh grants, but existing access tokens are still accepted until expiry unless the secret is invalidated.

The documented stateless trade-offs and roadmap items were retained as findings where they leave a required security property or practical client recovery mechanism absent. The green unit suite does not override those results. Priority should be to contain the Node metadata adapter crash, decide on a conformant shared replay/family mechanism, and close metadata-fetch/authentication gaps before claiming production OAuth 2.1 readiness.
