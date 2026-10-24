# Security review: `feat/mcp-oauth` (draft PR #23)

Reviewed: `git diff origin/main...HEAD` in `/Users/moddi3/.t3/worktrees/redmine-ts/t3-c2225f02` (head `f19e913`). Read-only. Unit tests on the branch pass (10 files, 242 tests). Probes were run from the reviewer's scratchpad against the branch source with Node 24 (`--experimental-transform-types`); none touched the repository, the contract tests or the Docker containers. Spec text was checked against RFC 9700, draft-ietf-oauth-v2-1-13, draft-ietf-oauth-client-id-metadata-document-02 and Cloudflare's compatibility-flag reference.

Line numbers refer to the branch.

## Counts

| Severity      | Count |
| ------------- | ----- |
| Critical      | 0     |
| High          | 0     |
| Medium        | 3     |
| Low           | 7     |
| Informational | 11    |

No way was found to forge, replay across purposes, or cross-use sealed values, to bypass PKCE, consent, the browser binding, the audience check, or the access-mode cap. The three medium findings are an open redirector on the authorization endpoint, missing refresh-token rotation for API-key sign-in, and an SSRF guard that exists only on the Node CLI (with wrong Workers guidance).

---

## Findings, ranked

### M1. The authorization endpoint is an open redirector for any registered client (medium)

- **Where:** `packages/mcp/src/oauth/server.ts:260-279` (`back`/`fail` before consent); `packages/mcp/src/oauth/clients.ts:122-162` (unauthenticated, never-expiring DCR); CIMD resolution `clients.ts:68-109`.
- **Scenario:** Preconditions: none beyond network access (no `allowedClientHosts`, the default). The attacker `POST`s `/mcp/oauth/register` with `redirect_uris: ["https://evil.example/phish"]`, which needs no credentials and returns a sealed `client_id` that never expires. They then send the victim a link on the trusted domain, which in a same-origin deployment is Redmine's own domain:
  `https://tracker.example.com/mcp/oauth/authorize?client_id=<sealed>&redirect_uri=https://evil.example/phish&response_type=token`.
  The server answers `302 Location: https://evil.example/phish?error=unsupported_response_type&...&iss=...` without showing a page. A missing PKCE challenge and a foreign `resource` behave the same. A CIMD document on any public https host works too. The redirect is to an attacker-chosen URL from a link on a domain users trust, which is the phishing primitive RFC 9700 §4.11.2 describes: "The attacker could, for example, register a client via dynamic client registration [RFC7591] and ... intentionally send an erroneous authorization request ... The authorization server MUST take precautions to prevent these threats. The authorization server SHOULD only automatically redirect the user agent if it trusts the redirection URI."
- **Confirmed:** probe. All three error paths returned 302 to `https://evil.example/phish`.
- **Fix:** For validation errors found before the consent decision (`response_type`, PKCE, `resource`, `state` length), render the error page instead of redirecting when the client is not on `allowedClientHosts` (or always, since MCP clients only ever time out on these errors). Alternatively show an interstitial "Return to evil.example" page. Keep the redirect after a real user decision (`access_denied`, Redmine's refusal), which is user-initiated.

### M2. API-key sign-in: refresh tokens never rotate; a stolen one works for 30 days and renews itself (medium)

- **Where:** `packages/mcp/src/oauth/server.ts:553-566` (`refresh`), `:568-570` (`keyTokens`), `:581-586` (`issue`).
- **Scenario:** Preconditions: `apiKeyLogin: true`. Every refresh seals a new refresh token with a fresh 30-day expiry, but the old one is not invalidated and nothing detects reuse. A refresh token taken from a client's token store or a proxy log is a permanent credential for that user at this server: it can be refreshed forever, there is no server-side revocation, and only resetting the API key in Redmine ends it. OAuth 2.1 §4.3.1 and RFC 9700 §4.14.2: "Authorization servers MUST utilize one of these methods to detect refresh token replay by malicious actors for public clients" (sender-constraining or rotation that invalidates the previous token). For Redmine sign-in (option a) Doorkeeper's rotation bounds the window, which the README documents; the README's trade-offs section does not say that option (b) has no rotation at all.
- **Confirmed:** probe. The same refresh token was accepted three times in a row after a refresh had already issued a replacement; the old access token also kept working, as expected.
- **Fix:** The brief already noted that option (b) needs a replay store. Options, from cheapest: (1) document it plainly under "API key sign-in" and shorten `REFRESH_TTL` for key grants; (2) add a pluggable replay/rotation store (in-memory on one Node process, KV or a Durable Object on Workers) that records the refresh-token id on use and refuses reuse; (3) issue no refresh token for key grants and let the client re-consent hourly.

### M3. The metadata-document fetch is unguarded by default, and the Workers guidance is wrong (medium; low on the Node CLI)

- **Where:** `packages/mcp/src/oauth/server.ts:63-68, 207` (`fetchClientMetadata ?? fetch`); `packages/mcp/src/oauth/clients.ts:215-234` (URL filter only); `packages/mcp/README.md` ("turn on the `global_fetch_strictly_public` compatibility flag, so the metadata documents clients name cannot reach private addresses"); the Workers example in the README passes no `fetchClientMetadata`.
- **Scenario:** Only the CLI passes `publicFetch`. Every embedder, including the README's Bun and Workers examples and any Node embedding of `createRedmineMcpHandler`, gets the runtime's global fetch. `documentUrl` refuses IP literals and a few local suffixes, but a public DNS name resolving to a private or loopback address passes: `https://localhost./x`, `https://127.0.0.1.nip.io/x`, `https://169.254.169.254.sslip.io/x`, or any attacker-controlled name. The server then `GET`s that URL and reflects the upstream status in the error page ("its metadata document answered 404" vs "could not be fetched"), a port and status oracle into the server's network. Content is used only if it validates as a client document, so exfiltration is limited to the status. On Workers, the quoted compatibility flag does not do what the README and the code comment say. Cloudflare's reference: "the global fetch() function will strictly route requests as if they were made on the public Internet. This means requests to a Worker's own zone will loop back to the 'front door' of Cloudflare"; without it "such requests are routed to the zone's origin server ... bypassing Cloudflare security settings". It is about same-zone routing, not private ranges (which Workers cannot reach anyway). It is still worth enabling, for a different reason: without it, a client_id on the operator's own zone (say a Redmine behind Cloudflare Access on the same zone) is fetched straight from the origin, bypassing Access. The CIMD draft §8.6: "Authorization servers MUST NOT fetch a Client ID Metadata Document URL ... that resolve to special-use IP addresses as defined in [RFC6890]."
- **Confirmed:** probe (the listed URLs reached the fetch function); the flag's documentation was read.
- **Fix:** Fail closed: when `oauth` is set and `fetchClientMetadata` is absent, either throw at creation on runtimes where no guard is known, or default to a fetch that refuses everything with a clear message, and let the CLI and documented embeddings pass `publicFetch`. Correct the README and the option's doc comment about the Workers flag (keep recommending it, with the real reason). Stop reflecting the upstream status code in the error page; say "could not be fetched" for every non-200.

### L1. OAuth 2.1 clients that omit `redirect_uri` from the token request are refused (low, interoperability)

- **Where:** `packages/mcp/src/oauth/server.ts:512-514`.
- **Scenario:** `form.get("redirect_uri") !== code.redirect` treats an absent parameter (`null`) as a mismatch. draft-ietf-oauth-v2-1-13 §4.1.3 no longer lists `redirect_uri` in the token request ("it has been removed"), and §10.2 only requires the server to accept and enforce it when an OAuth 2.0 client sends it. A 2.1-only client gets `invalid_grant`. The MCP TypeScript client and today's hosted clients send it, so this is latent. PKCE already binds the exchange.
- **Confirmed:** reasoning only (code reading plus the draft text).
- **Fix:** compare only when the parameter is present.

### L2. `publicFetch` block list misses three special-use ranges (low)

- **Where:** `packages/mcp/src/public-fetch.ts:13-44`.
- **Scenario:** `fec0::/10` (deprecated site-local, still used on some networks), `64:ff9b:1::/48` (local-use NAT64, RFC 8215) and `192.88.99.0/24` (6to4 relay anycast) are not refused, so a DNS name resolving there is connected to. IPv4-mapped IPv6 addresses are correctly refused (BlockList checks them against the IPv4 rules; verified). `2001:2::/48` and `2001:10::/28` are also open but are not routable, so they do not matter.
- **Confirmed:** probe. `https://[fec0::1]:1/x` and `https://[64:ff9b:1::7f00:1]:1/x` reached `connect` (EHOSTUNREACH) instead of the pre-connect TypeError; `192.88.99.1` was attempted.
- **Fix:** add `fec0::/10`, `64:ff9b:1::/48` and `192.88.99.0/24`.

### L3. A Redmine token with `expires_in` of 60 s or less yields a token that is expired on issue (low, availability)

- **Where:** `packages/mcp/src/oauth/server.ts:574` (`Math.min(ACCESS_TTL, upstream.expiresIn - EXPIRY_SKEW)`).
- **Scenario:** An operator who shortens Doorkeeper's `access_token_expires_in` to a minute or less gets `expires_in: -30` in the token response and every request answers 401; the client refreshes, gets another dead token, and loops against Redmine.
- **Confirmed:** probe with a fake Redmine returning `expires_in: 30`: token response `expires_in -30`, immediate 401 `invalid_token`.
- **Fix:** refuse with `server_error` (and log) when `expiresIn <= EXPIRY_SKEW`, or clamp to a small positive minimum.

### L4. The replay guard burns a code before the upstream exchange, so one transient Redmine failure kills the sign-in (low, availability)

- **Where:** `packages/mcp/src/oauth/server.ts:519-520`.
- **Scenario:** `redeemed(code.id)` records the code, then `redeemUpstream` fails with `UNREACHABLE` (502). The client's retry gets "The code was already used" and the person must start over. The direction is safe (it never admits a second use), but the ordering costs availability for no security gain.
- **Confirmed:** probe with a fetch that failed the first `/oauth/token` call: first 502 "Redmine did not answer", retry 400 "The code was already used".
- **Fix:** keep marking first (to close the race), but clear the mark when the upstream result is `UNREACHABLE`.

### L5. A request naming only scopes the server does not offer is granted everything (low)

- **Where:** `packages/mcp/src/oauth/scopes.ts:37-41` (`top === -1 ? offered : ...`); `server.ts:286`.
- **Scenario:** `scope=openid offline_access` (what a generic OIDC-minded client might send) or any typo yields `redmine:read redmine:write redmine:delete` on a `full` server. The consent page does list the three scopes, which mitigates it, but it departs from least privilege and the OAuth answer for an unknown scope is `invalid_scope`. "No `scope` at all means everything offered" is a reasonable MCP default; "only unknown scopes" is not the same case.
- **Confirmed:** probe. The consent page listed all three scopes, including "Delete issues".
- **Fix:** distinguish absent `scope` (grant the offered set) from a `scope` that names none of ours (`invalid_scope`, or grant `redmine:read` only).

### L6. No limit on API-key checks from the consent form (low)

- **Where:** `packages/mcp/src/oauth/server.ts:380-394, 411-427`.
- **Scenario:** With `apiKeyLogin`, anyone who loads the consent page once can `POST` it repeatedly with different `api_key` values. Each attempt makes the server call Redmine's `/users/current.json`. Redmine keys are 40 hex characters, so guessing is infeasible, but the server is a validation oracle for stolen key lists that hides the attacker's IP from Redmine's logs, and a load amplifier (8 s timeout per attempt, no concurrency cap).
- **Confirmed:** reasoning only.
- **Fix:** rate-limit the consent `POST` per cookie nonce and per source address, or seal an attempt counter into the re-rendered consent value and refuse after a few failures.

### L7. Secret strength is a length check only (low)

- **Where:** `packages/mcp/src/oauth/seal.ts:30`, `packages/mcp/src/config.ts:142-150`.
- **Scenario:** `"redmine-mcp-oauth-secret-2026-prod!!"` passes. An attacker holding one captured sealed value (an access token, a DCR `client_id`, or the consent form value, which anyone can obtain from the public consent page) can brute-force a dictionary secret offline: each guess is one HKDF plus one AES-GCM decryption. With the secret, every captured token opens to the Redmine token or API key inside, and consent values, states and codes can be forged, which defeats the browser binding. The README does tell operators to use `openssl rand -base64 32`.
- **Confirmed:** reasoning only.
- **Fix:** say in the README and the error message that the secret must be random, not a passphrase; optionally refuse obviously weak input (for example fewer than 16 distinct characters).

---

## Informational

- **I1. CIMD URL rules differ from draft-02 in two places.** The draft says the URL "MAY contain a port" and "SHOULD NOT contain a query component"; the server refuses any port and allows a query (`clients.ts:224`). Neither is a security problem; a client with a port in its document URL is refused.
- **I2. Code reuse does not revoke previously issued tokens.** OAuth 2.1 §4.1.3 says the server "SHOULD revoke (when possible) all access tokens and refresh tokens previously issued based on that authorization code". Not possible without state; Redmine handles its own code. Worth a line in the trade-offs section.
- **I3. `Authorization: Bearer <token> extra` is accepted.** The SDK's parser takes the second space-separated word and ignores the rest (`verifyBearerToken`). Harmless.
- **I4. Dynamic registration is unbounded in count and in redirect-URI length.** A registration with ten 1.4 KB URIs yields a 19 KB `client_id`; the authorize `GET` would then exceed Node's default 16 KB header limit and the consent `POST` exceeds `FORM_MAX_BYTES`, so the flow fails with "This sign-in page has expired" (confirmed). Self-inflicted only. Capping each redirect URI (say 512 bytes) and `client_name` would keep `client_id` small.
- **I5. `__Host-` + `Secure` on `http://localhost` dev URLs.** Chrome and Firefox store Secure cookies from `http://localhost`; Safari does not, which turns every dev sign-in into "did not start in this browser". Development only.
- **I6. The per-process replay guard is per-isolate on Workers.** With `apiKeyLogin` a code can be redeemed once per isolate within 60 s. Since redemption needs the PKCE verifier, only the legitimate client can do it, so the practical risk is nil. Already documented as "another process"; "another isolate" on Workers could be said explicitly.
- **I7. `allowedClientHosts` and loopback clients.** Listing `localhost` admits every local DCR client, and listing a host that serves user-uploaded JSON admits anyone. Worth a sentence next to the flag.
- **I8. Unauthenticated `authorize` requests trigger outbound fetches.** Each new CIMD URL costs one outbound request (5 s, 5 KB) with no concurrency limit, and only successes are cached (correct per the draft, which forbids caching errors). An amplification vector against the server's egress; a small concurrency cap or short negative cache keyed by hostname would bound it.
- **I9. `insufficient_scope` asks for every offered scope.** For a token with none of our scopes the 403 lists all three; acceptable, since per-tool step-up is deferred.
- **I10. Metadata lists no `revocation_endpoint`.** Clients that want to sign out cannot; the README says revocation happens in Redmine.
- **I11. Unknown `client_id` at the token endpoint answers `invalid_grant`.** RFC 6749 would say `invalid_client` (401) for a client-authentication failure, but with public clients and a code bound to the client hash, `invalid_grant` is defensible.

---

## Checked and found sound

**Sealing (`seal.ts`).** AES-256-GCM with a fresh 12-byte random IV per seal (nonce collision bound is far beyond this server's volume); one HKDF-derived key per purpose (`info: "oauth <purpose>"`) so a code never opens as a token, a registration never as a state; the issuer as associated data so another deployment's values fail; `previousSecret` opens but never seals; `exp` enforced on open and again by the SDK gate; base64url input validated; decrypt failures swallowed without an oracle. Tests cover forged, cross-purpose, other-issuer and rotated values.

**PKCE.** S256 only, `plain` refused, challenge format checked at `authorize`, verifier format and SHA-256 match checked at `token`, downgrade impossible, replay check runs only after PKCE passes so an attacker without the verifier cannot burn a code.

**Codes.** 60 s TTL; bound to the client hash, the exact `redirect_uri` and the challenge; single use through Redmine for option (a) (Doorkeeper spends the code once, fake and contract tests), per process for (b) (documented). Redmine's code and our PKCE verifier for it travel only inside sealed values.

**Audience and resource.** `resource` compared after URL normalization at both endpoints (trailing slash, default port, case of host, dot segments all handled; path, query, fragment and sub-path differences refused, probe); audience is always the issuer; the gate compares with the SDK's `sameResource`; foreign-resource tokens answer 401 (tests).

**Lifetimes.** Access token ≤ min(1 h, Redmine `expires_in` − 60 s); refresh 30 days per refresh; a refresh may narrow scopes and never widen (`lastIndexIn`); switching sign-in method ends the other method's grants.

**CSRF, login CSRF and the confused deputy.** Sealed consent carries the browser nonce; the nonce lives in a `__Host-` cookie (Secure, HttpOnly, SameSite=Lax, Path=/) that a sibling domain cannot set and a cross-site POST does not send; the consent `POST` checks `Origin` when present and the nonce always; the Redmine `state` carries the same nonce and the callback refuses a mismatch with an error page, never a redirect, so a Redmine link started by an attacker and auto-approved for a returning victim yields nothing. Probes: no `Origin` + victim cookie + attacker's consent value → 403; no cookie → 403. The nonce is never exposed in clear.

**Redirect URIs.** Exact string match; loopback any-port only for `http` on `localhost`, `127.0.0.1`, `[::1]` with identical path and query and no fragment or userinfo (probe); `https` or loopback `http` only at registration and in CIMD; custom schemes, `javascript:`, fragments refused (tests); an invalid client or redirect URI gets an error page, never a redirect (RFC 6749 §4.1.2.1).

**Mix-up and `iss`.** One upstream (Redmine), so no upstream mix-up; `iss` on every downstream authorization response including errors and `access_denied`; metadata advertises it. `state` is opaque, capped at 1024, echoed verbatim.

**Consent page.** Every interpolated value HTML-escaped (test with a `<script>` client name); CSP `default-src 'none'`, nonce-only `style-src`, `form-action` naming exactly the origins the post-submit redirect chain visits, `frame-ancestors 'none'` plus `X-Frame-Options: DENY`, `base-uri 'none'`, `Referrer-Policy: same-origin`, `Cache-Control: no-store`; client name, document host (or "not verified" for DCR), redirect host, scopes and a loopback warning are shown as the MCP spec asks; the API-key page names the address bar to check and where the key goes.

**CIMD validation.** `https` only, normalized form required (dot segments and IDNA tricks fail the `href === clientId` check), path required, no port, userinfo or fragment, IP literals and `.localhost/.local/.internal/.home.arpa/.localdomain` refused, 200 only, redirects not followed, 5 KB, 5 s, `client_id` must equal the URL, `client_secret` refused, unknown fields ignored, success cached 5 min and bounded at 256 entries, allowlist by document host or by every redirect host of a registration.

**`publicFetch` (Node).** IP-literal check before connecting; the DNS lookup used for the connection is the one that checks every resolved address, so there is no check-then-connect rebinding gap; IPv4-mapped IPv6 covered (verified with BlockList); GET over https only; no redirects; abort signal honored; response size capped by the caller.

**Resource server.** Bearer parsing by the SDK (case-insensitive scheme, empty token refused); a request with no credentials gets 401 with `resource_metadata` and `scope` and no `error` (RFC 6750 §3.1); invalid, expired or foreign tokens get 401 `invalid_token`; a token with none of our scopes gets 403 `insufficient_scope`; `X-Redmine-API-Key` wins over `Authorization`, which cannot escalate since the key holder already has the server's full mode; the request's mode is `strictest(server mode, token's highest scope)`, so a token never exceeds the server's mode or its own scope; the SDK refuses hidden tools and `raw_request` obeys the mode; the client's token never reaches Redmine (only the sealed Redmine bearer or API key does); error paths carry no credentials (`RedmineError` captures no headers, token errors are static strings, `onError` messages contain status and error codes only, the CLI prints no values).

**API-key fallback.** Key checked at Redmine before any code is issued; sealed into code and tokens, so it never appears in a URL or a client store in clear; re-checked on every refresh so a reset ends sessions; `type="password"`, `autocomplete="off"`; the server sends it only to `REDMINE_URL`.

**Config and deployment.** `publicUrl` explicit, never read from `Host` or `X-Forwarded-*`; https required with OAuth except on localhost; every served path derived from it and matched by pathname only, so a proxy forwards one prefix plus three well-known paths and the server never claims the rest of a shared origin; the loopback `Host` allowlist includes the public host for proxies that pass it through; the cookie name cannot collide with `_redmine_session` and incoming cookies are never forwarded; token, registration and metadata endpoints answer `*` without credentials; the MCP endpoint echoes only allowed origins, allows `Authorization` in preflight, exposes `WWW-Authenticate`, and admits the public origin's own pages.

**Header mode.** The `http.ts` diff keeps the pre-existing path intact: same Origin and Host checks, same 401 body without `WWW-Authenticate` when no OAuth is configured, same per-request key; tests for it still pass.

**Spec conformance, otherwise.** RFC 9728 document at the path-inserted URL and under the mount; RFC 8414 document at the path-inserted URL with `code_challenge_methods_supported`, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported`, `authorization_response_iss_parameter_supported`; RFC 8707 at both endpoints; RFC 9207; RFC 7636 S256; RFC 8252 loopback; RFC 7591 registration with `client_id_issued_at` and the echoed metadata; MCP 2026-07-28 status codes (401 missing or invalid, 403 scope, 400 malformed).
