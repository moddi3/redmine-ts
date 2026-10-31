# OAuth sign-in

claude.ai and ChatGPT connect to remote MCP servers only through OAuth, and neither can send an `X-Redmine-API-Key` header. With OAuth on, the server is its own OAuth authorization server for MCP clients, as the 2026-07-28 MCP spec describes, and people sign in at Redmine's own OAuth, which Redmine has offered since 6.1. The header keeps working next to OAuth, for clients that can send it.

This page explains how a sign-in works and what it guarantees. [Run a shared server for claude.ai and ChatGPT](http-and-oauth.md) is the step-by-step setup.

## How a sign-in works

A sign-in goes like this:

1. The MCP client finds the server's metadata from the 401 and identifies itself, with a Client ID Metadata Document or by registering.
2. The server shows its own consent page: the client's name and host, where it sends the person back, and the access it asks for. A malformed request gets an error page instead, never a redirect, so nobody can use the server's URL to send people to a site of their choosing.
3. On Allow, the browser goes to Redmine's `/oauth/authorize`. The person signs in to Redmine, with two-factor authentication if Redmine asks for it, and approves Redmine's own consent page.
4. Redmine sends the browser back to the server, which gives the client a code, and the client exchanges it for the server's own access and refresh tokens.
5. Each MCP request opens the client's token to the Redmine token sealed inside it, and calls Redmine with that one. The client's token never reaches Redmine.

Codes, tokens, states and client registrations are encrypted with keys derived from `REDMINE_MCP_AUTH_SECRET`, so the server needs no database. What must be used only once, and the sign-ins that a reused token ends, are marked in a [grant store](#grant-store). The CLI keeps it in memory; an embedded server with several processes or Worker isolates shares one, or runs with the weaker guarantees of each process's own memory.

## The secret

Generate the secret once, with `openssl rand -base64 32`, and keep it: a new one signs every client out. It must be random. A passphrase can be guessed offline from any sealed value, such as the one on the consent page, and then every token opens. The server refuses a secret shorter than 32 characters or with fewer than 12 distinct ones, but it cannot tell a long passphrase from random text. [Change the secret](#change-the-secret) explains how to replace it without signing everyone out.

## Scopes and access modes

The server offers three scopes, each including the ones before it, and each grants one [access mode](tools.md#access-modes):

| Scope            | Access mode | Permissions the server asks Redmine for                                                             |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `redmine:read`   | `read-only` | The `view_*` permissions, `search_project`, `browse_repository` and `export_wiki_pages`.            |
| `redmine:write`  | `no-delete` | Those, and every permission that adds or changes something, such as `add_issues` and `edit_issues`. |
| `redmine:delete` | `full`      | Those, and the `delete_*` permissions.                                                              |

The server's own mode caps what it grants: a `--no-delete` server offers `redmine:read` and `redmine:write` only, and its 401 asks for those. A request uses the stricter of the token's mode and the server's. A client that asks for no scope gets all the server offers; the consent page lists them. Names that are not the server's, next to its own, are ignored; a scope that names none of them is refused. A refresh may narrow the scope, and is refused when it names one the sign-in lacks. OAuth sessions never act as a Redmine admin, even for admins, because the server never asks for the `admin` scope; use the header for admin work.

Redmine checks a token's permissions on most requests, but not on issue edits, notes and deletes: those check only the user's role ([Redmine #44271](https://www.redmine.org/issues/44271)). So the access mode, which the SDK applies before any request, is the guard that holds. The Redmine permissions narrow everything else.

## Choose which clients may sign in

Any MCP client may ask to sign in unless `--allow-client` limits them. The consent page shows the client's name and host, and the person who signs in decides whether to trust it.

### How each client identifies itself

Give the client the public URL. Every client below finds the rest from the server's 401.

| Client                                      | How it identifies itself                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| claude.ai, Claude Desktop and mobile        | Its metadata document, `https://claude.ai/oauth/mcp-oauth-client-metadata`, with redirect URI `https://claude.ai/api/mcp/auth_callback`. It signs in as a public client with PKCE. On 2026-10-26 it signed in, ran tool calls, and refreshed its tokens through this server.                                                                                                                                                                           |
| ChatGPT                                     | Its metadata document, `https://chatgpt.com/oauth/client.json`, which declares `private_key_jwt` with the key set at `https://chatgpt.com/oauth/jwks.json`, so each token request carries a signed JWT. See [Clients with keys](#clients-with-keys). On 2026-10-26 it signed in, ran tool calls, and refreshed its tokens through this server. Its JWT uses RS256 and sets `aud` to the token endpoint. The server returns `iss`, which ChatGPT needs. |
| Claude Code, Codex                          | Their metadata documents, with a loopback redirect URI on a random port, which the server allows.                                                                                                                                                                                                                                                                                                                                                      |
| VS Code                                     | Its metadata document at `vscode.dev`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Cursor and other clients without a document | Dynamic Client Registration. The client ID the server returns is the registration, sealed.                                                                                                                                                                                                                                                                                                                                                             |

Clients that can send headers, such as Claude Code, Codex, Cursor, and VS Code, may keep using `X-Redmine-API-Key` instead. A request with both uses the key. A token goes in `Authorization: Bearer <token>`, alone.

Every client proves itself with PKCE. A registration that asks for `client_secret_basic` or `client_secret_post`, or names no method, is answered `token_endpoint_auth_method: "none"`, which the client then uses. A registration that asks for a key-based method, such as `private_key_jwt` or `tls_client_auth`, is refused, and the refusal tells a client with keys to use a metadata document. A metadata document is the client's own declaration, so the server takes its method as written. It admits `none`, no method, and `private_key_jwt`, and refuses every other method. A registration takes at most 5 redirect URIs of 256 characters each; an empty name, or one over 100 characters, is dropped. The server refuses a metadata document URL with a port, which the draft allows; no known client uses one.

### Limit sign-ins with `--allow-client`

`--allow-client claude.ai --allow-client vscode.dev` admits only those clients: a client with a metadata document when the document's URL is on a listed host, a registered client when every one of its redirect URIs is. Without the flag, any client may ask; the consent page is what stops one the person does not trust. A listed host vouches for whatever it serves: `localhost` admits every program on the person's computer that registers itself, and a host where people upload files admits anyone who uploads a metadata document there. List only hosts that publish nothing but their own clients.

On a public deployment, pass `--allow-client`. Without it, anyone who reaches the sign-in page can make the server fetch an https URL of their choosing. A `client_id` whose fetch fails is fetched again on every sign-in that names it. The flag limits only the hosts of metadata documents. A document that declares `private_key_jwt` may name its key set at a `jwks_uri` on any public https host, and the server fetches that URL the same way as a document, at public addresses only. List the hosts of the clients your people use. For example, `claude.ai` serves Claude Code's metadata document and the redirect URI of claude.ai, Claude Desktop and mobile, as [Claude's documentation](https://claude.com/docs/connectors/building/authentication) says. `chatgpt.com` serves ChatGPT's metadata documents and redirect URIs, as [OpenAI's documentation](https://developers.openai.com/plugins/build/auth) says.

### How the server bounds metadata fetches

With or without the flag, the server bounds those fetches:

- A fetch goes only to a public address, follows no redirect, and stops after 5 seconds, or after 5 KB for a document and 16 KiB for a key set.
- A document that passes the checks is kept for 5 minutes. A fetch that fails, or a document that fails a check, is not kept, as the Client ID Metadata Document draft requires, so the next sign-in of that `client_id` fetches it again. Such a failure also drops the document kept from an earlier fetch.
- Sign-ins of the same client while its document is being fetched share that fetch.
- One process, or one Worker isolate, fetches at most 8 documents at once. Beyond that, a sign-in that needs a fetch gets a 503 page with `Retry-After: 5` that asks the person to reload in a moment. Nothing about the client is remembered from that refusal. A fetch that has not settled after 6 seconds, as when Workers cancel the request that started it, no longer counts, and the sign-ins waiting on it get the same 503 page.
- A registered client, or one whose document is kept, signs in without a fetch, so the cap never touches it. While all 8 fetches are taken, or once a fetch has not settled after 6 seconds, a document fetched within the last hour, and among the last 256 fetched, still serves its client instead of the 503 page.
- The server fetches a key set only at the token endpoint, for a code or refresh token it sealed for a client whose document declared `private_key_jwt`. A key set that passes the checks is kept for 5 minutes, and a fetch that fails is not kept. An assertion whose `kid` the kept set lacks fetches the set again, at most once a minute, so random `kid`s cannot make the server fetch more. One process fetches at most 4 key sets at once, apart from the 8 documents. While all 4 are taken, or once a fetch has not settled after 6 seconds, a key set fetched within the last hour still serves the token request if it holds the assertion's `kid`. Otherwise the token request gets 503 `temporarily_unavailable` with `Retry-After: 5`.

A caller can still keep the 8 document fetches busy, and a client the server has not fetched within the hour then gets the 503 page until they stop. With `--allow-client`, the fetches go only to the hosts you listed. To limit how often one address can open the sign-in page, rate-limit `GET` on the authorize path, `/mcp/oauth/authorize` for `https://mcp.example.com/mcp`, at the proxy. [HTTP server limits](https://github.com/moddi3/redmine-ts/blob/main/packages/mcp/docs/limits.md#metadata-document-and-key-set-fetches) covers the rest, such as Workers that cancel a fetch when its client disconnects.

## Clients with keys

A metadata document that declares `token_endpoint_auth_method: "private_key_jwt"` must give its public keys in exactly one of `jwks` and `jwks_uri`, an https URL. If it names `token_endpoint_auth_signing_alg`, that must be `RS256`, `PS256` or `ES256`. The server checks this at the consent page and refuses any other document.

The server seals the method into the code and into every refresh token of the sign-in. Each token request for them must then authenticate the client with a JWT, as RFC 7523 describes: `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` and the JWT in `client_assertion`. The server checks the JWT against the client's current document, which it keeps for 5 minutes, and these rules:

- The signature uses `RS256`, `PS256` or `ES256`, or the document's `token_endpoint_auth_signing_alg`, with the key that the JWT's `kid` names. RSA keys need at least 2048 bits.
- `iss` and `sub` are the `client_id`. The form's `client_id` may be left out; when sent, it must equal `sub`.
- `aud` names the issuer, which is the public URL, or the token endpoint.
- `exp` is at most an hour away, with 60 seconds of clock skew. `nbf` and `iat`, when present, are not in the future.
- `jti` is present, and works once. With a [grant store](#grant-store), it works once across every instance.

A failed check gets 401 `invalid_client` with the check in `error_description`, before the server spends the code or asks Redmine. A request without an assertion for such a sign-in gets 401, and so does a request with an assertion for a public client's sign-in. If the client's document no longer declares `private_key_jwt`, its token requests get 401. If the document or the key set cannot be fetched, they get 502 `server_error`. A public client's token requests never fetch anything.

## Sign out and revoke

- An access token lasts at most an hour, and never longer than the Redmine token inside it. A refresh token lasts 30 days, and each refresh brings a new one. Without a grant store, an API-key sign-in ends 30 days after consent, refreshed or not.
- People revoke the application in Redmine, under Authorized applications (`/oauth/authorized_applications`). Redmine then refuses its tokens at once. Every MCP client a person signed in through this server uses the same Redmine application, so revoking it ends all of them, not only one. The next typed tool call, or any call to a `.json` or `.xml` path through `raw_request`, gets HTTP 401 `invalid_token`, the client's refresh fails, and the client asks them to sign in again.
- An admin who deletes the Redmine application ends every session the same way.
- With a grant store, a refresh token or a code that comes back more than 30 seconds after its first use ends every token of that sign-in.
- Changing `REDMINE_MCP_AUTH_SECRET` without keeping the old one signs every client out.
- Turning `--api-key-login` off refuses the key-based codes and refresh tokens at once; their access tokens keep working until they expire, within the hour. To end them sooner, change the secret.

The server has no revocation endpoint and cannot revoke one client on its own: it keeps no list of what it issued.

## Change the secret

Set the new secret in `REDMINE_MCP_AUTH_SECRET` and the old one in `REDMINE_MCP_AUTH_PREVIOUS_SECRET`. The server seals with the new one and opens with both, and every refresh moves a client to the new one. After 30 days, when every refresh token the old secret sealed has expired, remove the previous secret. Clients that registered dynamically, such as Cursor, then register again.

Change the secret, without keeping the old one, when you point the same public URL at another Redmine. Tokens are bound to the public URL, not to the Redmine behind it, so the old tokens would carry their Redmine tokens, or with [API key sign-in](#api-key-sign-in) their API keys, to the new Redmine.

## Grant store

Codes, Redmine states and consent pages must each be used once, and a refresh token should be. A grant store marks them: two operations on namespaced keys, `consume(key, ttlSeconds)`, which marks a key used and resolves false when it already was, and `has(key)`. Every instance that serves the public URL must share one, and `consume` must be atomic across them. Every instance that shares the secret must share the store, or none may have one: an instance without it neither rotates refresh tokens nor ends API-key sign-ins after 30 days, so a refresh token sealed by an instance with the store would renew there without either.

With a store:

- Codes of both sign-in methods, Redmine states, consent pages and [client assertions](#clients-with-keys) work once across every instance.
- Refresh tokens rotate: each works once. A refresh token or a code that comes back a second time means one leaked, so the server ends every token of that sign-in, and refuses its access tokens from then on.
- Except within 30 seconds of the first use: then the second use is the same client racing itself, such as two processes refreshing at once, or retrying after a timeout. It is refused, and the sign-in stays. The window is the price of not signing people out for that; someone who steals a refresh token and uses it within those 30 seconds is refused too, but does not end the sign-in.
- A code or refresh token is checked before the server asks Redmine and marked after Redmine answers, so a Redmine outage spends nothing and the client can retry.
- A store that fails, by throwing or rejecting, fails closed: the token endpoint answers 503 `temporarily_unavailable`, the consent page and Redmine's return show an error page to retry from, the MCP endpoint answers 503, and `onError` gets the cause.

The CLI is one process, so it keeps the store in its memory. A restart empties it. Tokens sealed before the restart still open with the same secret, so a refresh token used before the restart works once more, and a sign-in that the server ended because a token came back works again. An embedded server passes `oauth.store`: `memoryGrantStore()` for a single process, or an adapter for something shared. The memory store grows with use: each refresh leaves a marker that lives 30 days, as long as the token it marks, so a client that refreshes every hour adds about 720 entries a month, and an ended sign-in adds one more. That suits the CLI; for a busy server, use a store that keeps its keys elsewhere. On Workers that is a Durable Object, one per key, which runs its storage calls one at a time; Workers KV is eventually consistent, so two isolates could both consume one key.

[Embed the server](embedding.md#share-the-grant-store-on-workers) shows a grant store for Cloudflare Workers built on a Durable Object. The adapter costs one Durable Object call on every MCP request that carries a token, to check whether its sign-in was ended, besides the calls that sign-ins and refreshes make, and one object per key.

Without a store, the server keeps the weaker guarantees of each process's or isolate's own memory:

- A code, a state or a consent page works once per process. Another process or Worker isolate that has not seen it accepts it once more within its lifetime: 60 seconds for a code, and only with the client's PKCE verifier.
- A client assertion works once per process. Another process may accept it once more until its `exp` passes, at most an hour, and only with a code or refresh token of its client.
- Refresh tokens do not rotate. With Redmine sign-in, Redmine replaces its own refresh token on use, but accepts the old one until the new access token is first used, so a stolen refresh token works in that window. With API key sign-in nothing replaces it: a stolen refresh token works until the sign-in ends, 30 days after consent.
- A code that comes back cannot end the tokens its first use issued, as OAuth 2.1 asks where possible.

## What holds either way

- **No per-client revocation** on the server's side; revocation happens in Redmine, or by changing the secret for everyone.
- **The secret protects everything.** With the secret and a captured token, someone can read the Redmine token inside until it expires, or the API key with [API key sign-in](#api-key-sign-in). Keep the secret out of logs and repositories, and change it if it leaks.
- **Some failures inside a request stay error results.** Over OAuth, a tool call gets HTTP 401 `invalid_token` once Redmine refuses the sign-in, and HTTP 403 `insufficient_scope` when it needs a scope that the token lacks and the server grants. A call that the server's own mode refuses, and a Redmine 403, still return an error result with HTTP 200, because a new sign-in cannot fix them. So does a request in which Redmine may have applied a write, so that the client's retry cannot repeat the write. The client's next request gets the 401. A Redmine 401 stays an error result too when its path ends in neither `.json` nor `.xml`, such as `my/page.js` through `raw_request`. Redmine answers 401 there even for a sign-in it accepts, because the path is outside its API. Tools beyond the token's scope stay out of `tools/list`, so the 403 comes from `raw_request` or from a call to an unlisted tool.
- **OAuth responses arrive whole.** To set the status, the server holds each OAuth response until the call ends. A long call sends no keep-alive events, and a client on a 2025 revision gets the result in one piece. A response to a 2025-revision request is an event stream, which the server reads into memory once more, so a large one, such as a batch of big reads, needs about twice its size at its peak.
- **Plain http to Redmine.** `REDMINE_URL` and `REDMINE_PUBLIC_URL` may be http. The server's own https rule covers only the public URL, so secure the browser's way to Redmine's login and the server's way to Redmine's API yourself.

## API key sign-in

For a Redmine without OAuth applications, `--api-key-login` replaces `REDMINE_OAUTH_CLIENT_ID` and `REDMINE_OAUTH_CLIENT_SECRET`: the consent page asks for the person's API key, checks it with `GET /users/current.json`, and seals it into the code and the tokens. Resetting the key in Redmine, under My account, ends the session. Tool calls then get HTTP 401 `invalid_token`, and the refresh fails because it checks the key again. Checking keys has limits, so the page is a slow oracle for a list of leaked keys:

- One sign-in may try 5 keys. Each try needs the page that came back from the last one, so going back does not reset the count. A key Redmine did not answer for counts too, and the page says Redmine did not answer.
- With a grant store, one browser may fail 10 keys an hour; after that it gets an error page.
- One process checks at most 4 keys at Redmine at once; above that the page asks the person to try again in a moment, with a 503.

None of this limits a source address: a browser that drops its cookie starts again. Behind a proxy, rate-limit `POST` to the consent page, `/mcp/oauth/authorize` for `https://mcp.example.com/mcp`, by client address there.

Prefer Redmine sign-in where you can. A page that asks people to paste a master key is what phishing looks like, and it teaches them to do it. The page says which address bar it belongs to and where the key goes, but people rarely check. The key is also stronger than a token: it never expires, and Redmine permissions do not narrow it, so only the access mode limits it.

Without a [grant store](#grant-store) shared by every instance, a code is single-use only per process or Worker isolate, refresh tokens do not rotate, and the sign-in ends 30 days after consent; see the list there.

## Endpoints

All paths derive from `REDMINE_MCP_PUBLIC_URL`. For `https://mcp.example.com/mcp`:

| Path                                                                             | What                                                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/mcp`                                                                           | The MCP endpoint.                                                                                                                         |
| `/mcp/.well-known/oauth-protected-resource`                                      | Protected resource metadata, which the 401 names.                                                                                         |
| `/.well-known/oauth-protected-resource/mcp`                                      | The same document where RFC 9728 places it.                                                                                               |
| `/.well-known/oauth-authorization-server/mcp`                                    | Authorization server metadata (RFC 8414). The issuer is the public URL.                                                                   |
| `/.well-known/openid-configuration/mcp`, `/mcp/.well-known/openid-configuration` | The same document, at the other URLs the MCP spec has clients try.                                                                        |
| `/mcp/oauth/authorize`                                                           | The consent page, and the form it posts.                                                                                                  |
| `/mcp/oauth/redmine/callback`                                                    | Where Redmine sends the browser back.                                                                                                     |
| `/mcp/oauth/token`                                                               | Tokens: `authorization_code` with PKCE S256, and `refresh_token`. A [client with keys](#clients-with-keys) also sends a client assertion. |
| `/mcp/oauth/register`                                                            | Dynamic Client Registration.                                                                                                              |

The server is not an OpenID provider and issues no ID tokens, so the document at the OpenID Connect URLs lacks `jwks_uri` and the other OpenID fields. Clients try the RFC 8414 URL first; forward it.

For development on `http://localhost`, Chrome and Firefox keep the server's `Secure` cookie; Safari does not, so a sign-in there ends with "did not start in this browser".
