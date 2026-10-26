---
"@redmine-ts/mcp": minor
---

The OAuth authorization server now admits a Client ID Metadata Document that declares `token_endpoint_auth_method: "private_key_jwt"`, as ChatGPT's does. Before, it refused such a document at the consent page, so ChatGPT could not sign in through it.

- The document must give its public keys in exactly one of `jwks` and `jwks_uri`. A `token_endpoint_auth_signing_alg`, when present, must be `RS256`, `PS256` or `ES256`. Every other method is still refused, and the message names the methods the server takes.
- The server seals the method into the code and into every refresh token of the sign-in. Each token request for them must then send a `client_assertion` of type `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, as RFC 7523 describes. The server checks it with the keys of the client's current document: the alg, the key named by `kid`, `iss` and `sub` equal to the `client_id`, `aud` equal to the issuer or the token endpoint, `exp` at most an hour away, `nbf` and `iat`, and a `jti` that works once. RSA keys need at least 2048 bits. A failed check gets 401 `invalid_client` before the code is spent or Redmine is asked. `client_id` may be left out of such a request, as RFC 7521 allows.
- The server fetches a key set through `oauth.fetchClientMetadata`, without redirects, within 5 seconds and 16 KiB, and keeps it for 5 minutes. A key set that cannot be fetched is not kept, and the token request gets 502 `server_error`. A `kid` that the kept set lacks fetches it again at most once a minute. One process fetches at most 4 key sets at once.
- Public clients behave as before. Their token requests fetch nothing and may not send a `client_assertion`.
- The authorization server metadata now lists `private_key_jwt` in `token_endpoint_auth_methods_supported`, after `none`, and adds `token_endpoint_auth_signing_alg_values_supported`. Dynamic Client Registration still registers public clients only, and its refusal of a key-based method now points to a metadata document.
- `jose` is a new dependency. It verifies the assertion with WebCrypto, on Node, Bun and Workers.
