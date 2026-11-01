# OAuth sign-in

claude.ai and ChatGPT connect to remote MCP servers only through OAuth, and neither can send an `X-Redmine-API-Key` header. With OAuth on, the server is its own OAuth authorization server for MCP clients, as the 2026-07-28 MCP spec describes. People sign in through Redmine's own OAuth, which Redmine has offered since 6.1. The header keeps working next to OAuth, for clients that can send it.

This page explains how a sign-in works and what it guarantees. [Run a shared server for claude.ai and ChatGPT](http-and-oauth.md) is the step-by-step setup.

## How a sign-in works

A sign-in goes like this:

1. The MCP client finds the server's metadata from the 401. It identifies itself with a Client ID Metadata Document or by registering.
2. The server shows its own consent page. The page names the client and its host, where the client sends the person back, and the access the client asks for. A malformed request gets an error page instead, never a redirect. So nobody can use the server's URL to send people to a site of their choosing.
3. When the person allows the client, the browser goes to Redmine's `/oauth/authorize`. The person signs in to Redmine, with two-factor authentication if Redmine asks for it, and approves Redmine's own consent page.
4. Redmine sends the browser back to the server, and the server gives the client a code. The client exchanges the code for the server's own access and refresh tokens.
5. On each MCP request, the server opens the client's token to get the Redmine token sealed inside it. The server calls Redmine with the Redmine token. The client's token never reaches Redmine.

The server encrypts codes, tokens, states, and client registrations with keys derived from `REDMINE_MCP_AUTH_SECRET`, so it needs no database. A [grant store](#grant-store) marks the values that must be used only once, and the sign-ins that a reused token ends. The CLI keeps the store in memory. An embedded server with several processes or Worker isolates shares one store among them, or runs with the weaker guarantees of each process's own memory.

## The secret

Generate the secret once, with `openssl rand -base64 32`, and keep it. A new secret signs every client out. The secret must be random. Someone can guess a passphrase offline from any sealed value, such as the one on the consent page, and then open every token. The server refuses a secret shorter than 32 characters, or one with fewer than 12 distinct characters. It cannot tell a long passphrase from random text. [Change the secret](#change-the-secret) explains how to replace it without signing everyone out.

## Scopes and access modes

The server offers three scopes. Each scope includes the ones before it and grants one [access mode](tools.md#access-modes):

| Scope            | Access mode | Permissions the server asks Redmine for                                                             |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `redmine:read`   | `read-only` | The `view_*` permissions, `search_project`, `browse_repository`, and `export_wiki_pages`.           |
| `redmine:write`  | `no-delete` | Those, and every permission that adds or changes something, such as `add_issues` and `edit_issues`. |
| `redmine:delete` | `full`      | Those, and the `delete_*` permissions.                                                              |

The server's own mode caps what it grants. A `--no-delete` server offers only `redmine:read` and `redmine:write`, and its 401 asks for those. A request uses the stricter of the token's mode and the server's mode. A client that asks for no scope gets every scope the server offers, and the consent page lists them. When a request names one of the server's scopes, the server ignores the other names next to it. The server refuses a scope that names none of its own. A refresh may narrow the scope. The server refuses a refresh that names a scope the sign-in lacks. OAuth sessions never act as a Redmine admin, even for admins, because the server never asks for the `admin` scope. Use the header for admin work.

Redmine checks a token's permissions on most requests, but not on issue edits, notes, and deletes. Those check only the user's role ([Redmine #44271](https://www.redmine.org/issues/44271)). So the access mode, which the SDK applies before any request, is the guard that holds. The Redmine permissions narrow everything else.

## Choose which clients may sign in

Any MCP client may ask to sign in unless `--allow-client` limits them. The consent page shows the client's name and host, and the person who signs in decides whether to trust it.

### How each client identifies itself

Give the client the public URL. Every client below finds the rest from the server's 401.

| Client                                      | How it identifies itself                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude.ai, Claude Desktop, and mobile       | Its metadata document, `https://claude.ai/oauth/mcp-oauth-client-metadata`, with redirect URI `https://claude.ai/api/mcp/auth_callback`. It signs in as a public client with PKCE. On 2026-10-26 it signed in, ran tool calls, and refreshed its tokens through this server.                                                                                                                                                                                           |
| ChatGPT                                     | Its metadata document, `https://chatgpt.com/oauth/client.json`. The document declares `private_key_jwt` with the key set at `https://chatgpt.com/oauth/jwks.json`, so each token request carries a signed JWT, as [Clients with keys](#clients-with-keys) describes. Its JWT uses RS256 and sets `aud` to the token endpoint. The server returns `iss`, which ChatGPT needs. On 2026-10-26 it signed in, ran tool calls, and refreshed its tokens through this server. |
| Claude Code and Codex                       | Their metadata documents, with a loopback redirect URI on a random port, which the server allows.                                                                                                                                                                                                                                                                                                                                                                      |
| VS Code                                     | Its metadata document at `vscode.dev`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Cursor and other clients without a document | Dynamic Client Registration. The client ID that the server returns is the registration, sealed.                                                                                                                                                                                                                                                                                                                                                                        |

Clients that can send headers, such as Claude Code, Codex, Cursor, and VS Code, may keep using `X-Redmine-API-Key` instead. A request with both a key and a token uses the key. A token goes in `Authorization: Bearer <token>`, alone.

Every client proves itself with PKCE. A registration may ask for `client_secret_basic` or `client_secret_post`, or name no method. The server answers it with `token_endpoint_auth_method: "none"`, and the client then uses that method. The server refuses a registration that asks for a key-based method, such as `private_key_jwt` or `tls_client_auth`. The refusal tells a client with keys to use a metadata document. A metadata document is the client's own declaration, so the server takes its method as written. The server admits `none`, no method, and `private_key_jwt`, and refuses every other method. A registration takes at most 5 redirect URIs, each at most 256 characters long. The server drops a client name that is empty or over 100 characters. The server refuses a metadata document URL with a port. The draft allows a port, but no known client uses one.

### Limit sign-ins with `--allow-client`

`--allow-client claude.ai --allow-client vscode.dev` admits only the clients on those hosts. A client with a metadata document gets in when the document's URL is on a listed host. A registered client gets in when every one of its redirect URIs is on a listed host. Without the flag, any client may ask, and the consent page is what stops a client the person does not trust. A listed host vouches for whatever it serves. `localhost` admits every program on the person's computer that registers itself. A host where people upload files admits anyone who uploads a metadata document there. List only hosts that publish nothing but their own clients.

On a public deployment, pass `--allow-client`. Without it, anyone who reaches the sign-in page can make the server fetch an https URL of their choosing. When the fetch for a `client_id` fails, the server fetches it again on every sign-in that names that `client_id`. The flag limits only the hosts of metadata documents. A document that declares `private_key_jwt` may name its key set at a `jwks_uri` on any public https host. The server fetches that URL the same way as a document, at public addresses only. List the hosts of the clients your people use. For example, `claude.ai` serves Claude Code's metadata document. It also serves the redirect URI of claude.ai, Claude Desktop, and mobile, as [Claude's documentation](https://claude.com/docs/connectors/building/authentication) says. `chatgpt.com` serves ChatGPT's metadata documents and redirect URIs, as [OpenAI's documentation](https://developers.openai.com/plugins/build/auth) says.

### How the server bounds metadata fetches

With or without the flag, the server bounds those fetches:

- A fetch goes only to a public address and follows no redirect. It stops after 5 seconds, or after 5 KiB for a document and 16 KiB for a key set.
- The server keeps a document that passes the checks for 5 minutes. As the Client ID Metadata Document draft requires, the server keeps nothing from a fetch that fails or from a document that fails a check. The next sign-in of that `client_id` fetches the document again. Such a failure also drops the document kept from an earlier fetch.
- Sign-ins of the same client share a fetch of its document that is already under way.
- One process, or one Worker isolate, fetches at most 8 documents at once. Beyond that, a sign-in that needs a fetch gets a 503 page with `Retry-After: 5`. The page asks the person to reload in a moment. The server remembers nothing about the client from that refusal. A fetch that has not settled after 6 seconds no longer counts toward the 8, and the sign-ins waiting on it get the same 503 page. A fetch can stay unsettled that long when Workers cancel the request that started it.
- A registered client, or a client whose document the server keeps, signs in without a fetch, so the cap never affects it. While all 8 fetches are taken, or once a fetch has not settled after 6 seconds, an older document can still serve its client instead of the 503 page. That document must be among the last 256 fetched, and the server must have fetched it within the last hour.
- The server fetches a key set only at the token endpoint. It does so only for a code or refresh token that it sealed for a client whose document declared `private_key_jwt`. The server keeps a key set that passes the checks for 5 minutes, and keeps nothing from a fetch that fails. When an assertion names a `kid` that the kept set lacks, the server fetches the set again, at most once a minute. So random `kid`s cannot make the server fetch more. One process fetches at most 4 key sets at once, apart from the 8 documents. While all 4 are taken, or once a fetch has not settled after 6 seconds, an older key set can still serve the token request. That set must hold the assertion's `kid`, and the server must have fetched it within the last hour. Otherwise the token request gets 503 `temporarily_unavailable` with `Retry-After: 5`.

A caller can still keep the 8 document fetches busy. Until the caller stops, a client whose document the server has not fetched within the hour gets the 503 page. With `--allow-client`, the fetches go only to the hosts you listed. To limit how often one address can open the sign-in page, rate-limit `GET` on the authorize path at the proxy. For `https://mcp.example.com/mcp`, that path is `/mcp/oauth/authorize`. [HTTP server limits](https://github.com/moddi3/redmine-ts/blob/main/packages/mcp/docs/limits.md#metadata-document-and-key-set-fetches) covers the rest, such as Workers that cancel a fetch when its client disconnects.

## Clients with keys

A metadata document that declares `token_endpoint_auth_method: "private_key_jwt"` must give its public keys in exactly one of `jwks` and `jwks_uri`. A `jwks_uri` must be an https URL. If the document names `token_endpoint_auth_signing_alg`, the value must be `RS256`, `PS256`, or `ES256`. The server checks this at the consent page and refuses any other document.

The server seals the method into the code and into every refresh token of the sign-in. Each token request for them must then authenticate the client with a JWT, as RFC 7523 describes. The request sends `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` and the JWT in `client_assertion`. The server checks the JWT against the client's current document, which it keeps for 5 minutes, and against these rules:

- The signature uses `RS256`, `PS256`, or `ES256`, or the document's `token_endpoint_auth_signing_alg`, with the key that the JWT's `kid` names. RSA keys need at least 2048 bits.
- `iss` and `sub` are the `client_id`. The form may leave out its `client_id`. When the form sends a `client_id`, the value must equal `sub`.
- `aud` names either the issuer or the token endpoint. The issuer is the public URL.
- `exp` is at most an hour away, with 60 seconds of clock skew. `nbf` and `iat`, when present, are not in the future.
- `jti` is present, and works once. With a [grant store](#grant-store), it works once across every instance.

A failed check gets 401 `invalid_client`, with the failed check in `error_description`. The server answers before it spends the code or asks Redmine. A request without an assertion for such a sign-in gets 401. So does a request with an assertion for a public client's sign-in. If the client's document no longer declares `private_key_jwt`, its token requests get 401. If the server cannot fetch the document or the key set, the token requests get 502 `server_error`. The server never fetches anything for a public client's token requests.

## Sign out and revoke

- An access token lasts at most an hour, and never longer than the Redmine token inside it. A refresh token lasts 30 days, and each refresh brings a new one. Without a grant store, an API-key sign-in ends 30 days after consent, refreshed or not.
- People revoke the application in Redmine, under Authorized applications (`/oauth/authorized_applications`). Redmine then refuses its tokens at once. Every MCP client that a person signed in through this server uses the same Redmine application. So revoking the application ends all of those clients, not only one. The next typed tool call gets HTTP 401 `invalid_token`, and so does any call to a `.json` or `.xml` path through `raw_request`. The client's refresh then fails, and the client asks the person to sign in again.
- An admin who deletes the Redmine application ends every session the same way.
- With a grant store, a refresh token or a code that comes back more than 30 seconds after its first use ends every token of that sign-in.
- Changing `REDMINE_MCP_AUTH_SECRET` without keeping the old one signs every client out.
- When you turn `--api-key-login` off, the server refuses the key-based codes and refresh tokens at once. Their access tokens keep working until they expire, within the hour. To end them sooner, change the secret.

The server has no revocation endpoint. It cannot revoke one client on its own, because it keeps no list of what it issued.

## Change the secret

Set the new secret in `REDMINE_MCP_AUTH_SECRET` and the old one in `REDMINE_MCP_AUTH_PREVIOUS_SECRET`. The server seals with the new secret and opens with both. Every refresh moves a client to the new secret. After 30 days, when every refresh token that the old secret sealed has expired, remove the previous secret. Clients that registered dynamically, such as Cursor, then register again.

When you point the same public URL at another Redmine, change the secret and do not keep the old one. The server binds tokens to the public URL, not to the Redmine behind it. So the old tokens would carry their Redmine tokens to the new Redmine, or their API keys with [API key sign-in](#api-key-sign-in).

## Grant store

Each code, Redmine state, and consent page must be used only once, and each refresh token should be. A grant store marks them with two operations on namespaced keys, `consume(key, ttlSeconds)` and `has(key)`. `consume` marks a key used, and resolves false when the key already was. Every instance that serves the public URL must share one store, and `consume` must be atomic across those instances. Every instance that shares the secret must share the store, or none may have one. An instance without the store would renew a refresh token that an instance with the store sealed. It would neither rotate that token nor end the API-key sign-in 30 days after consent.

With a store:

- Codes of both sign-in methods, Redmine states, consent pages, and [client assertions](#clients-with-keys) work once across every instance.
- Refresh tokens rotate, so each one works once. A refresh token or a code that comes back a second time means that one leaked. The server then ends every token of that sign-in, and refuses its access tokens from then on.
- The exception is a second use within 30 seconds of the first. The server treats it as the same client racing itself, such as two processes that refresh at once, or a client that retries after a timeout. The server refuses the second use, and the sign-in stays. The window is the price of not signing people out in those cases. The server also refuses someone who steals a refresh token and uses it within those 30 seconds, but that use does not end the sign-in.
- The server checks a code or refresh token before it asks Redmine, and marks it after Redmine answers. So a Redmine outage spends nothing, and the client can retry.
- A store that fails, by throwing or rejecting, fails closed. The token endpoint answers 503 `temporarily_unavailable`. The consent page and Redmine's return show an error page to retry from. The MCP endpoint answers 503, and `onError` gets the cause.

The CLI is one process, so it keeps the store in its memory. A restart empties the store. Tokens sealed before the restart still open with the same secret. So a refresh token used before the restart works once more, and a sign-in that the server ended because a token came back works again. An embedded server passes `oauth.store`, either `memoryGrantStore()` for a single process or an adapter for a shared store. The memory store grows with use. Each refresh leaves a marker that lives 30 days, as long as the token it marks. So a client that refreshes every hour adds about 720 entries a month, and an ended sign-in adds one more. That growth suits the CLI. For a busy server, use a store that keeps its keys elsewhere. On Workers, that store is a Durable Object, one per key, which runs its storage calls one at a time. Workers KV is eventually consistent, so two isolates could both consume one key.

[Embed the server](embedding.md#share-the-grant-store-on-workers) shows a grant store for Cloudflare Workers built on a Durable Object. The adapter costs one object per key. It also costs one Durable Object call on every MCP request that carries a token, to check whether the server ended that sign-in. Sign-ins and refreshes make their own calls besides that one.

Without a store, the server keeps the weaker guarantees of each process's or isolate's own memory:

- A code, a state, or a consent page works once per process. Another process or Worker isolate that has not seen it accepts it once more within its lifetime. A code lives 60 seconds, and the other process accepts it only with the client's PKCE verifier.
- A client assertion works once per process. Another process may accept it once more until its `exp` passes, which is at most an hour away. That process accepts it only with a code or refresh token of its client.
- Refresh tokens do not rotate. With Redmine sign-in, Redmine replaces its own refresh token on use. Redmine still accepts the old one until the new access token is first used, so a stolen refresh token works in that window. With API key sign-in, nothing replaces the refresh token. A stolen refresh token works until the sign-in ends, 30 days after consent.
- A code that comes back cannot end the tokens that its first use issued. OAuth 2.1 asks for that where possible.

## What holds either way

- **No per-client revocation on the server's side.** Revocation happens in Redmine, or by changing the secret for everyone.
- **The secret protects everything.** With the secret and a captured token, someone can read the Redmine token inside until it expires. With [API key sign-in](#api-key-sign-in), they can read the API key. Keep the secret out of logs and repositories, and change it if it leaks.
- **Some failures inside a request stay error results.** Over OAuth, a tool call gets HTTP 401 `invalid_token` once Redmine refuses the sign-in. It gets HTTP 403 `insufficient_scope` when it needs a scope that the token lacks and that the server grants. A call that the server's own mode refuses, and a Redmine 403, still return an error result with HTTP 200, because a new sign-in cannot fix them. So does a request in which Redmine may have applied a write, so that the client's retry cannot repeat the write. The client's next request gets the 401. A Redmine 401 also stays an error result when its path ends in neither `.json` nor `.xml`, such as `my/page.js` through `raw_request`. Redmine answers 401 there even for a sign-in it accepts, because the path is outside its API. Tools beyond the token's scope stay out of `tools/list`, so the 403 comes from `raw_request` or from a call to an unlisted tool.
- **OAuth responses arrive whole.** To set the status, the server holds each OAuth response until the call ends. A long call sends no keep-alive events, and a client on a 2025 revision gets the result in one piece. A response to a 2025-revision request is an event stream, and the server reads it into memory once more. So a large response, such as a batch of big reads, needs about twice its size at its peak.
- **Plain http to Redmine.** `REDMINE_URL` and `REDMINE_PUBLIC_URL` may be http. The server's own https rule covers only the public URL. Secure the browser's connection to Redmine's login and the server's connection to Redmine's API yourself.

## API key sign-in

For a Redmine without OAuth applications, `--api-key-login` replaces `REDMINE_OAUTH_CLIENT_ID` and `REDMINE_OAUTH_CLIENT_SECRET`. The consent page asks for the person's API key and checks it with `GET /users/current.json`. The server then seals the key into the code and the tokens. Resetting the key in Redmine, under My account, ends the session. Tool calls then get HTTP 401 `invalid_token`, and the refresh fails because it checks the key again. Key checks have limits, so the page is a slow oracle for a list of leaked keys:

- One sign-in may try 5 keys. Each try needs the page that came back from the last one, so going back does not reset the count. A key that Redmine did not answer for counts too, and the page says that Redmine did not answer.
- With a grant store, one browser may fail 10 keys an hour. After that, the browser gets an error page.
- One process checks at most 4 keys at Redmine at once. Above that, the page answers with a 503 and asks the person to try again in a moment.

None of these limits is per source address. A browser that drops its cookie starts again. Behind a proxy, rate-limit `POST` to the consent page by client address at the proxy. For `https://mcp.example.com/mcp`, the consent page is at `/mcp/oauth/authorize`.

Prefer Redmine sign-in where you can. A page that asks people to paste a master key is what phishing looks like, and it teaches them to do it. The page says which address bar it belongs to and where the key goes, but people rarely check. The key is also stronger than a token. It never expires, and Redmine permissions do not narrow it, so only the access mode limits it.

Without a [grant store](#grant-store) shared by every instance, a code is single-use only per process or Worker isolate. Refresh tokens do not rotate, and the sign-in ends 30 days after consent. The list in that section gives the details.

## Endpoints

All paths derive from `REDMINE_MCP_PUBLIC_URL`. For `https://mcp.example.com/mcp`:

| Path                                                                             | What                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/mcp`                                                                           | The MCP endpoint.                                                                                                                                            |
| `/mcp/.well-known/oauth-protected-resource`                                      | Protected resource metadata, which the 401 names.                                                                                                            |
| `/.well-known/oauth-protected-resource/mcp`                                      | The same document where RFC 9728 places it.                                                                                                                  |
| `/.well-known/oauth-authorization-server/mcp`                                    | Authorization server metadata (RFC 8414). The issuer is the public URL.                                                                                      |
| `/.well-known/openid-configuration/mcp`, `/mcp/.well-known/openid-configuration` | The same document, at the other URLs the MCP spec has clients try.                                                                                           |
| `/mcp/oauth/authorize`                                                           | The consent page, and the form it posts.                                                                                                                     |
| `/mcp/oauth/redmine/callback`                                                    | Where Redmine sends the browser back.                                                                                                                        |
| `/mcp/oauth/token`                                                               | The token endpoint, for `authorization_code` with PKCE S256 and for `refresh_token`. A [client with keys](#clients-with-keys) also sends a client assertion. |
| `/mcp/oauth/register`                                                            | Dynamic Client Registration.                                                                                                                                 |

The server is not an OpenID provider and issues no ID tokens. So the document at the OpenID Connect URLs lacks `jwks_uri` and the other OpenID fields. Clients try the RFC 8414 URL first, so forward it.

For development on `http://localhost`, Chrome and Firefox keep the server's `Secure` cookie. Safari does not, so a sign-in in Safari ends with "did not start in this browser".
