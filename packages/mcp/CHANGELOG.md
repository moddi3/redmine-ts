# @redmine-ts/mcp

## 0.8.3

### Patch Changes

- 0e5d3ca: Generate from the spec tags `6.1.3-r2` and `7.0.2-r2`. `groups.create` now requires `name`, which Redmine always required. Issue relations, changesets, attachment authors and child trackers are typed as always present. The issue date filters document UTC timestamps, and the `where` legend says that a lower bound on a time also matches the second before it.
- Updated dependencies [0e5d3ca]
  - @redmine-ts/sdk@0.9.0

## 0.8.2

### Patch Changes

- Updated dependencies [11c4676]
  - @redmine-ts/sdk@0.8.0

## 0.8.1

### Patch Changes

- 53d8b12: The READMEs on npm are shorter and link to task guides on GitHub. The SDK README keeps the install steps, the requirements, the quickstart, and what the client catches. It links to guides for reading data, writing records, configuration, errors, and the reference. The MCP README keeps the quick start for Claude Code. It links to guides for each client, the shared server with OAuth, the tools, the settings, authentication, and embedding. Runtime behavior is unchanged.
- Updated dependencies [53d8b12]
- Updated dependencies [815be14]
  - @redmine-ts/sdk@0.7.2

## 0.8.0

### Minor Changes

- c843bab: `reference_data` now returns a custom field's possible value as `{value, label}` when Redmine shows a label other than the value, and as the plain string as before when the two are equal. For an `enumeration` field, `value` is the id to send and `label` is its name, so the agent no longer sees ids such as `"3"` with no name. A client that reads `possible_values` as strings only must now accept the object form too.
- 55c6d9b: A `no-delete` server now refuses the updates that make Redmine delete records, before sending: `journals_update` with blank `notes`, `issues_update` or `wiki_update` with `deleted_attachment_ids`, `memberships_update` with `role_ids` that name none of the membership's current roles, and the same requests through `raw_request`. A membership update with roles in `role_ids` reads the membership first, and its refusal says how to swap roles in two updates. The error reads `The "no-delete" access mode refused <tool>, because <what Redmine would delete>. Nothing was changed.` Over OAuth, a token limited to `redmine:write` that makes such a call is asked for `redmine:delete`. The instructions and the `raw_request` description say that updates that delete are refused.
- 613804e: The MCP now sends `User-Agent: redmine-ts-mcp/<version> (+https://github.com/moddi3/redmine-ts)` on its requests to Redmine: tool calls, the API key check, and the OAuth token exchange. Redmine and proxy admins can tell these requests apart in their access logs. A `fetch` passed in the config receives each request with that header and can replace it. The SDK sends no User-Agent of its own, as before.
- a729e72: `title`, `summary` and `content` now count as text written by Redmine users. A `news_list` or `search_list` page, whose items keep a news title or an issue's subject in `title`, now carries the untrusted-text warning first, as an issue list does. The warning and the server instructions name the new fields. `attachments_download` now carries the warning on every result, because its `content` field names what follows, such as the uploaded image.

### Patch Changes

- Updated dependencies [829396f]
- Updated dependencies [da27f53]
  - @redmine-ts/sdk@0.7.1

## 0.7.0

### Minor Changes

- b24928a: Following a clip marker now returns the issue as `{id, updated_on}`. An `issue_context` call with `journals: 0` and ids in `full`, which a clipped journal's marker names, returns those journals with the issue as `{id, updated_on}`, as a `journals_before` page does. It leaves out the rest of the issue and no longer lists the subtasks. A call with `journals` above 0, or without `full`, still returns the whole issue.

  The `issue_context` description now says that journals come oldest first, and that each journal's `note` is N in the issue page's `#note-N`, lower than Redmine's own number after a journal hidden from the key. Clients that do not pass output schemas to the model now get this too.

- 608ecff: `issues_update` and `issues_transition` with `notes` now return `journal: {id, note}`, the journal that the notes were added in. Pass `id` to `journals_update` to edit the notes, and cite `note` as `#note-N`, without reading the issue again. To find the journal, each such call reads the issue's journals before and after the update. When it cannot tell which journal is the right one, or a read fails, the result is `{ok: true}` as before, with `status` for `issues_transition`.

## 0.6.0

### Minor Changes

- d0f0beb: A key whose Redmine user is not an admin no longer sees the 14 tools that need an admin key, such as `users_list` and `groups_list`, in `tools/list`, and the server instructions leave out the sentence about them. Such a tool still answers a call, with Redmine's 403 and what works without an admin key.

  - Over stdio, the server reads `users/current.json` once when it starts, before the client's `initialize`. If Redmine does not answer, it lists every tool, as before.
  - Over HTTP with the `X-Redmine-API-Key` header, the server asks Redmine about the key once for each `initialize`, `server/discover` and `tools/list` request. A request past 64 KiB or slower than a second shares that one check with the key gate. A tool call adds no check. If Redmine does not answer or refuses the key, every tool is listed, as before.
  - Over OAuth, the built-in authorization server records in the grant whether the user is an admin at sign-in. An API key sign-in takes it from the key check on the consent page. A sign-in through Redmine is never an admin's, because Redmine lets an OAuth token act as an admin only with the `admin` scope, which the server does not request, so these sign-ins no longer list the tools Redmine refuses them. A refresh keeps the field, so a change of admin rights shows after the next sign-in. Tokens issued before this change list every tool. `BearerGrant` gains an optional `admin` field, which an external verifier may set.

  `createRedmineMcpServer` takes a new `admin` option: `false` hides the tools that need an admin key. Without it, every tool is listed.

- 28a7ac2: `attachments_download` and `attachments_save` take `attachment_id` instead of `id`, as `attachments_get` does. A call that still passes `id` is refused and names `attachment_id`.

  Arguments that do not match a tool's input schema are refused with the kind `invalid_input`, like the SDK's own refusals: the message reads "Invalid input for <tool>: ... Nothing was sent." and the last text block is the error as JSON. An unknown argument is named, with the arguments the tool takes, such as `unknown argument "id"; attachments_download takes attachment_id, thumbnail, size`. A reason that ends with a period no longer gets a second one.

- 3de4996: With OAuth on, a token request from a `private_key_jwt` client, such as ChatGPT, no longer gets 503 while every key set fetch is taken or its own fetch has not settled after 6 seconds, if the server fetched the client's key set within the last hour and that set holds the assertion's `kid`. A `kid` the set lacks still gets 503 `temporarily_unavailable`.

  A metadata document fetch that fails after 6 seconds now drops the kept document, as a fetch that fails sooner does, until a newer fetch for that client starts. A fetch that settles after a newer one started still changes nothing.

  `createRedmineMcpServer` keeps the tools of at most 8 pairs of access mode and files directory, so a library that creates servers with many `files.dir` values no longer keeps every set. An HTTP error that a tool serializes before it is returned gets the same `api_key` redaction in its body as one that is returned as it is.

- 4c57a86: More results fit the result budget, and some result shapes change:

  - `issues_get` with `include: ["journals"]` leaves out the oldest journals that do not fit, and adds `journals_omitted` and `journals_before` to the record. `issue_context` with that `journals_before` returns the journals it left out.
  - `raw_request` returns a response over the budget as `{status, truncated: true, bytes, response_text, message}`, where `status` is Redmine's HTTP status and `response_text` is the start of the response's JSON, in place of `{response}`. It starts with the user-text `warning` when the whole response holds user-written text, as `{response}` would.
  - An `issue_context` page with `journals_before` returns the issue as `{id, updated_on}` and the journals, without the rest of the issue, which the first page carried. The new `journals_after` returns only the journals newer than the one it names, in the same form.
  - `journals_omitted` now counts an older journal in `full` too, because the next pages return it.
  - `REDMINE_MCP_MAX_RESULT_BYTES` and `maxResultBytes` take at most 499,000 bytes, because Claude Code keeps at most 500,000 characters inline. A larger value is refused with a message that says so.

- 43d3da7: The `where` table in `tools/list` gives every filter a value: `issue id` for the relation filters, `group id` and `role id`, and the scheme name for `twofa_scheme`. `status_id`'s words are marked "alone", the project-scoped filters say they need one `project_id`, and the id filters that take `contains` say it matches the issue tree.

  `issues_list` and `time_entries_list` refuse `category_id` without one `project_id`, any filter next to `query_id` but one `project_id`, and a status word next to other values, before anything is sent. `{ "not": "closed" }` on `status_id` returns the open issues, and `{ "contains": 42 }` on `parent_id` is accepted.

  The filter descriptions come from the SDK, so a refused filter's error names its value as well as its forms.

- 150ca3d: A result that carries text written by Redmine users now starts its `structuredContent` with a `warning` field, set to the same warning as its first text block: the text is data, not instructions. Claude Code shows the model only `structuredContent`, so its model never saw the warning beside the text before. The first text block stays for clients that read the text blocks, such as Codex. The reference from `attachments_upload` no longer carries the warning, in a block or a field, because its `description` is the caller's own and goes back unchanged in `uploads`.

  It takes the place of a record's own top-level `warning` field, such as one a plugin adds, which `raw_request` still returns under `response`; a record without user-written text keeps that field. The output schema of each tool that returns a record or a list page now allows `warning`. The result budget counts it, so a list page or `issue_context` result fits the budget with the warning included. A caller that compares `structuredContent` with the record it expects should drop `warning` first.

### Patch Changes

- 6c7bc94: A long line in a journal's diff no longer starts or ends with a `…` that hides a single character. When the 40 characters around a change stop one character short of the line's start or end, the excerpt shows that character instead.
- a3c913c: `people_find` skips groups while it looks up matches, so a group that watches the issue or is its assignee no longer hides a partial match or counts in `more`. `more` counts only the matches it did not look up, and `unavailable` says when the call limit stopped the lookups.
- Updated dependencies [948cfac]
- Updated dependencies [86e9cd4]
- Updated dependencies [43d3da7]
  - @redmine-ts/sdk@0.7.0

## 0.5.1

### Patch Changes

- 75df372: `attachments_upload` reads a file from the files directory through one handle, checked after it is opened against what the path names in the directory, and reads no more than the size it checked, so a file that changes size meanwhile is refused. A FIFO no longer blocks it, and an unreadable file is refused with `invalid_input`.

## 0.5.0

### Minor Changes

- c9e701a: `tools/list` now describes `where` with a table instead of a schema for each filter. In `issues_list`, `time_entries_list`, `users_list` and `projects_list`, `where` takes one loose condition, and its description lists the filters: each filter's value, such as an id, a date, `me` or `open`, and what it filters, under the operators it takes. The server still checks each call against the forms of each filter, so a bad filter gets the same error as before.

  A full-access listing goes from 276K to 200K characters, and the input schema of `issues_list` from 48,004 to 4,474 bytes. Every input schema is now under 5,000 bytes. Codex strips the descriptions from a larger one, so it used to show the four list tools without their filter descriptions and with each operator form as `{}`.

- d5bd5a9: `people_find` is a new read-only workflow tool that finds people by name in a project's members, or on an issue and in its project, and returns each one's id, name and login for an `@login` mention, with any API key. Each match says how it matched: `exact`, `prefix`, or `partial` for a name that Redmine shows shorter, such as Ivan P., which comes only when nothing matched better. Groups the key may see are left out. It makes at most 26 calls, each retried up to twice by the SDK by default. Every access mode lists it, so `full` now lists 93 tools, 92 on a 6.1 server, `no-delete` 77 and `read-only` 44.

  The 14 tools whose Redmine actions run `require_admin`, such as `users_list`, now say "Needs an admin key" in their description, and their 403 error says that they need one or that the REST API is disabled. Each names what works without an admin key, where something does. A `user_id` input now names `people_find` as where to find the id, or `users_list` where `people_find` cannot find the user.

  `reference_data` and `issue_context` no longer read a sixth page of members to learn that a project has more than 500.

- 0281264: List tools and `issue_context` now stop filling a result at 32,000 bytes of its compact JSON, so that results stay under what Cursor, Codex and OpenCode accept and Claude Code no longer saves them to a file. The budget counts UTF-8 bytes of one copy of the JSON, as the result is sent, with API keys hidden.

  A list page now ends before the item that would take it over the budget, so it may hold fewer than `limit` items, and `next_offset` names the first item left out. A page holds one item at least, so `next_offset` always moves on. Callers that page with `next_offset` need no change; a caller that took a page short of `limit` for the last page should read `next_offset` instead.

  `issue_context` adds the newest journals only while they fit, one at least, and returns `journals_before`, the id of the oldest journal it returned, whenever it leaves older journals out, by the `journals` count or by the budget. Calling it again with `journals_before` returns the next older page, and `journals_before` is `null` on the last. `journals_omitted` counts the older journals still left out. Journals in `full` come on top and are never cut. When the issue alone is over the budget, each page holds the issue and one journal. The `issues_get` description now points to `issue_context` for a long history.

  `REDMINE_MCP_MAX_RESULT_BYTES`, or the `maxResultBytes` option of `createRedmineMcpServer` and `createRedmineMcpHandler`, changes the budget, at least 1,000 bytes. Above 49,000, list tools and `issue_context` also carry `_meta["anthropic/maxResultSizeChars"]`, set to the budget plus 1,000, so Claude Code keeps their results inline.

- 8ef5e5c: `issues_list` items are now short by default. Each item carries only `id`, `project`, `tracker`, `status`, `assigned_to`, `subject` and `updated_on`, plus the associations that `include` names, so a page of 100 issues on a test server went from about 69K to about 27K characters. The new `fields` input adds other item fields, such as `fields: ["due_date", "spent_hours"]`; `id` is always kept, `attachments` and `relations` there are fetched as `include` would, and a name that is not an item field is refused before any request. For the fields that items carried before, pass `detailed: true`, which returns every field as it did and adds `description`, or name the fields you need in `fields`. The other list tools are unchanged.

  Every tool but `raw_request`, and the issue resource, now rounds hour fields to two decimals: `estimated_hours`, `total_estimated_hours`, `spent_hours` and `total_spent_hours` of issues and versions, and a time entry's `hours`. Redmine can send them as long floats, such as `2.1600000262260437`, which now reads `2.16`. The SDK still returns what Redmine sends.

### Patch Changes

- 55df491: The output schemas of `issues_get`, `issues_list` and `issues_create` now require `project`, `tracker`, `status`, `priority` and `author` on each issue, and `id` in `parent`. Redmine sends them on every issue, so the results do not change.
- Updated dependencies [55df491]
  - @redmine-ts/sdk@0.6.0

## 0.4.0

### Minor Changes

- 8bab487: `issue_context` and the `redmine://issues/{id}` resource now show a journal's change to the description, or to a custom field on several lines, as the lines that changed. Before, an edited description came as `from` and `to`, each cut at 500 characters, so a change past the first 500 characters did not show. A long text custom field came whole.

  When the old or new description spans lines or is longer than 350 characters, or a custom field value spans lines, the change now comes as `{field, diff}` in place of `{field, from, to}`, such as `{"field": "Description", "diff": "@@ line 13 @@\n  13. Step 13\n- 14. Step 14\n+ 14. Step fourteen\n  15. Step 15"}`. The diff has one unchanged line around each run of changes, with the removed lines first. A changed line longer than 350 characters is paired with the line across its run that shares the most text with it. It shows 40 characters on each side of every place where the two differ, with `…` in place of each part left out, and is cut at 350 characters only when those parts do not fit. Any other line longer than 350 characters shows its start. The diff stops at 1000 characters, and a diff that leaves anything out ends with one clip marker. A journal named in `full` shows its diff uncut, with every line whole. CRLF and LF line breaks compare equal. The resource shows the diff in a fenced block under the field's name.

  Other changes keep `{field, from, to}`. A client that reads `from` and `to` on every change needs to handle `diff` too.

- d1a305e: With a files directory, the description of `attachments_upload`'s `path` now names the directory, and so do the errors for a path that does not exist in it or resolves outside it. Before, an agent could not tell where the directory was, so it passed a file from its own working directory and got an error that did not say where to put it. The server names the directory with its symlinks resolved, as in the paths `attachments_save` returns. The description also says that `path` takes an absolute path inside the directory, which the server already accepted. A path must still resolve inside the directory after symlinks are followed.

  `LocalFiles` has a new `dir` property with that path. `localFiles` now resolves the directory when it is called, so it throws when the directory does not exist.

- 1b0a0fe: `issue_context` takes `full`, the ids of journals to return unclipped. It still makes one `issues.get` request. A journal in `full` is returned even when it is older than the newest `journals`, and an id that is not a journal of the issue is refused with `unknown_journal`.

  A clipped note or changed value now ends with a marker that names this call, such as `Call issue_context with issue_id 7, journals 0 and full [1042] for all of it.` Before, the marker said to call `issues_get` with `include: ["journals"]`, which returns every journal with every raw detail. A clipped description still names `issues_get`, which returns the issue without journals.

- 80ce6ab: `issue_context` now gives each journal a `note`, its N in the issue page's `#note-N`, so an agent can find the journal that "see #note-68" means. The count starts at 1 with the oldest journal the API key may see. Journals that the `journals` cap leaves out still count. The `redmine://issues/{id}` resource puts the number in each journal heading, as in `### #note-68, 2026-01-15T09:30:00Z, Jane Doe (journal 1042)`.

  Redmine numbers all journals of an issue before it hides some of them. It hides other users' private notes from a user who may not view them, and a journal without notes whose changes the user may not see, such as a relation to an issue that the user cannot see or that was deleted later, or a custom field the user cannot see. After a hidden journal, `note` is lower than Redmine's number, for an admin key too in the second case. The output schema says so.

- 6431738: The OAuth authorization server now admits a Client ID Metadata Document that declares `token_endpoint_auth_method: "private_key_jwt"`, as ChatGPT's does. Before, it refused such a document at the consent page, so ChatGPT could not sign in through it.

  - The document must give its public keys in exactly one of `jwks` and `jwks_uri`. A `token_endpoint_auth_signing_alg`, when present, must be `RS256`, `PS256` or `ES256`. Every other method is still refused, and the message names the methods the server takes.
  - The server seals the method into the code and into every refresh token of the sign-in. Each token request for them must then send a `client_assertion` of type `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, as RFC 7523 describes. The server checks it with the keys of the client's current document: the alg, the key named by `kid`, `iss` and `sub` equal to the `client_id`, an `aud` that names the issuer or the token endpoint, `exp` at most an hour away, `nbf` and `iat`, and a `jti` that works once. RSA keys need at least 2048 bits. A failed check gets 401 `invalid_client` before the code is spent or Redmine is asked. `client_id` may be left out of such a request, as RFC 7521 allows.
  - The server fetches a key set through `oauth.fetchClientMetadata`, without redirects, within 5 seconds and 16 KiB, and keeps it for 5 minutes. A key set that cannot be fetched is not kept, and the token request gets 502 `server_error`. A `kid` that the kept set lacks fetches it again at most once a minute. One process fetches at most 4 key sets at once.
  - Public clients behave as before. Their token requests fetch nothing and may not send a `client_assertion`.
  - The authorization server metadata now lists `private_key_jwt` in `token_endpoint_auth_methods_supported`, after `none`, and adds `token_endpoint_auth_signing_alg_values_supported`. Dynamic Client Registration still registers public clients only, and its refusal of a key-based method now points to a metadata document.
  - `jose` is a new dependency. It verifies the assertion with WebCrypto, on Node, Bun and Workers.

- c430735: Results no longer carry working Redmine API keys. Before, `users_current`, `my_account_get` and `users_get` returned the calling user's own API key. With an admin key, `users_get` returned the API key of any user, and `users_create` returned the new user's key. `raw_request` returned the same keys from the same paths. Each key went into the agent's context and transcript.

  The server now replaces each `api_key` value, at any depth, with `[hidden by @redmine-ts/mcp]` in tool results, in error results and in the `redmine://issues/{id}` resource. The field stays, so the output schemas do not change. The server also replaces the API key or OAuth access token it sends to Redmine wherever a response repeats it. `--dangerously-reveal-api-keys`, over stdio only, and the `dangerouslyRevealApiKeys` option of `createRedmineMcpServer` turn this off. `@redmine-ts/sdk` still returns `api_key` as Redmine sends it.

### Patch Changes

- bb569d5: `issue_context`, `issues_get`, `raw_request`, and the `redmine://issues/{id}` resource now return an issue's journals oldest first, whatever the API key's user chose for **Display comments** in Redmine. The SDK now sets that order, so `include: ["changesets"]` and the comments from `news_get` come oldest first too.

  Redmine sends these lists newest first when that user reads comments in reverse chronological order. In that case `issue_context` kept the oldest journals under its `journals` cap instead of the newest, and listed them newest first.

- 13c51a9: `createRedmineMcpServer` and `createRedmineMcpHandler` keep the SDK's response fixes on even when the config passes `normalize: false`. With them off, `issue_context` kept the oldest journals for a key whose user reads comments newest first, as before the fix for #49. The CLI was not affected, because it has no `normalize` option.
- d0dbb5b: `issues_list` and `time_entries_list` now accept a `where.project_id` with a list of ids, `{not}`, `"mine"`, `"bookmarks"` or a `{raw}` such as `1|2`, as their schemas offer. Before, Redmine answered 404 to each of them, and the error result sent the agent to check ids that were valid. An identifier in a list of two or more or under `{not}` now gets an error result that asks for ids. Next to such a `project_id`, a custom field with `{raw}`, or with a value that starts with an operator character, gets an error result that asks for an operator object. A filter that Redmine offers only inside one project, such as `category_id`, and a saved query's `query_id` get an error result there too. The `project_id` description now says which forms include subprojects. The fix is in `@redmine-ts/sdk`.
- 69eae32: `issue_context` and the `redmine://issues/{id}` resource now label a subtask change "Subtask" and show the subtask as `#123`, as Redmine's issue page does. Redmine records this change on the parent issue as a `child_id` detail when someone adds a subtask to the issue or removes one. Before, `issue_context` showed it as `{"field": "child_id", "from": null, "to": "123"}`.
- Updated dependencies [d49ab0f]
- Updated dependencies [d0dbb5b]
- Updated dependencies [5dc6521]
  - @redmine-ts/sdk@0.5.0

## 0.3.2

### Patch Changes

- 8fa701d: The OAuth authorization server now bounds the Client ID Metadata Document fetches that unauthenticated sign-in requests trigger. One process, or one Worker isolate, fetches at most 8 documents at once. Beyond that, a sign-in that needs a fetch gets a 503 page with `Retry-After: 5`. A client whose document is cached, or was fetched within the last hour and is among the last 256 documents fetched, signs in as before. A fetch that has not settled after 6 seconds, as when Workers cancel the request that started it, frees its slot, and the sign-ins that share it get that copy or the 503 page instead of a refusal. Concurrent sign-ins of the same client share one fetch. A failed fetch or an invalid document is not cached, as the Client ID Metadata Document draft requires. A document whose body breaks off, as when the 5-second timeout ends a stalled one, now gets the "could not be fetched" page instead of a 500. `createRedmineMcpHandler` now throws a `TypeError` when `allowedOrigins`, `allowedHosts` or `oauth.allowedClientHosts` holds an entry with `*`, as the CLI flags already refused it, since each entry matches one name exactly. An API-key check at Redmine that never settles, as when Workers cancel its request, now holds one of the 4 check slots for at most 9 seconds, so it no longer turns every later API-key sign-in away as busy.
- 7ceaae2: The HTTP handler now bounds the memory and the time that request bodies take while they arrive. Before, a client whose key Redmine accepted, or whose OAuth token was valid, could stop its uploads near the 6.7 MiB limit and hold about 13 MB of live heap with each. Node closed them only at its 300-second request timeout, and Bun and Workers never did. 60 such uploads held 794 MB on Node.

  - The handler reads each body once, as bytes, and passes the parsed message to the MCP SDK, so it holds one copy of a body instead of two. Its buffer holds one to two bytes per byte received, however the client splits the body.
  - Bodies that are still arriving share a budget of 32 MiB for the buffers they are read into, set with the new `maxBodyBytesInFlight` option of `createRedmineMcpHandler`. A buffer doubles as its body grows up to 1 MiB and then grows 1 MiB at a time, so it is never more than 1 MiB ahead of what has arrived, and it ends at the body's exact size when the `Content-Length` is truthful. A body at the limit is charged in full once it passes 6 MiB, and four such bodies can arrive at once. The first 64 KiB of each body are not charged, so small requests never meet the budget. A body that needs room takes it from bodies that have not grown by 128 KiB in 5 seconds, longest stalled first, and those get 408. When the other bodies are all still growing, it gets 503 with `Retry-After: 5`, even partway through its body. Stalled bodies cannot hold the budget, but bodies that keep growing can. In two five-minute tests, one key with 10 bodies growing at 26 KiB/s each made 8 and 11 of another user's 15 uploads of 6.7 MiB get 503.
  - A body must arrive within 300 seconds of when the handler begins reading it, or it gets 408. The new `bodyTimeoutMs` option changes the time. It matches Node's request timeout, so Node servers see no change there, and gives Bun and Workers a bound they did not have.
  - After a 408, 503 or 413 partway through a body, the handler reads and drops the rest for 5 seconds, so a client still sending gets the answer instead of a reset, and then stops reading. The server closes the connection once it has been idle for its own timeout, which took 6 to 12 seconds after the answer on Node and Bun with their default timeouts. On Workers the connection ends with the answer.
  - A `maxBodyBytesInFlight` under about 6.7 MiB lowers the largest body accepted to the budget plus 64 KiB, with 413 beyond it. A budget of 0 answers 413 to any body over 64 KiB. `createRedmineMcpHandler` throws a `RangeError` when either option is not a number, such as `null` or a string.
  - CORS responses now expose `Retry-After` next to `WWW-Authenticate`, so a browser client can read when to send a refused body again.

## 0.3.1

### Patch Changes

- ee5d737: The `attachments_upload` description names every tool that takes its reference in `uploads`, including `news_create`, `news_update` and `wiki_update`, and no longer says Redmine discards an unattached upload. Redmine keeps it until an admin prunes it.
- 0e4dd48: A request with an `X-Redmine-API-Key` header now has its key checked with Redmine (`GET /users/current.json`) before the server reads more than 64 KiB of the body or waits more than a second for it. A key that Redmine refuses gets 401, and a check that Redmine does not answer gets 503, both with a `null` id. Before, any value of the header, even a made-up one, made the server read up to 4 MiB and wait for a stalled body until Node's 300-second request timeout. Smaller requests that arrive at once are unchanged and cost no extra call. `attachments_upload` decodes `content_base64` in a loop that holds one copy of the file, instead of about 30 bytes per byte.
- 36409bd: `attachments_upload` takes its advertised 5 MB over HTTP too. A request whose key Redmine accepted, or whose OAuth token is valid, may now carry about 6.7 MiB, which fits a 5 MB file in base64 and the JSON-RPC envelope around it. Before, the 4 MiB limit stopped base64 files at about 3 MB with a 413. A `content_text` near 5 MB can still exceed the limit once JSON escapes its line breaks, quotes, and control characters, so send such a file as `content_base64`.
- Updated dependencies [ee5d737]
  - @redmine-ts/sdk@0.4.0

## 0.3.0

### Minor Changes

- d14dc40: Over OAuth, two failures inside a request now get an HTTP status that makes clients act, instead of an error result in HTTP 200:

  - When Redmine refuses the credential inside a valid token, because the Redmine application or token was revoked or the API key behind an API-key sign-in was reset, the request answers 401 `invalid_token` with the Bearer challenge. Clients refresh, the refresh fails, and they ask the person to sign in again.
  - When a call needs more than the token's scope and the server's own mode allows it, the request answers 403 `insufficient_scope` and names the scopes the call needs. `raw_request` needs the scope of the method it sends.

  OAuth responses now arrive whole when the call has finished, on 2025-era requests too, so the status can still change. A request in which Redmine may have applied a write keeps its results, so a retry cannot repeat the write. The `X-Redmine-API-Key` header works as before. A Redmine 403, a Redmine 401 for a path outside its API such as `my/page.js`, and a call the server's own mode refuses are still error results. With either credential, the error result for such a 401 now says to end the path in `.json` instead of asking for a new sign-in. The error result for a refused call now names the request's access mode as "the read-only access mode", since a narrower token can set it.

  `createRedmineMcpServer` takes an `observe` option, which gets each request the server sends to Redmine and each call that the access mode refuses.

### Patch Changes

- 0acce2b: Add `--allow-host` for a proxy that passes the client's `Host` through. The flag adds hostnames to the `Host` check on loopback. On another address, such as `0.0.0.0` in a container, it turns the check on against the same list. The server's own JSON-RPC errors, the 401 for a missing key and the 403s for `Origin` and `Host`, now carry the request's `id` instead of `null` when the body is a single request of at most 64 KiB with a declared length. It reads at most that much and waits at most a second for it, so a large or stalled body does not hold up the error. `--allow-origin`, `--allow-host` and `--allow-client` now refuse a value with `*` at startup, because they match names exactly and a wildcard matched only itself.

## 0.2.0

### Minor Changes

- 6824636: Add OAuth over HTTP, so claude.ai, ChatGPT and other OAuth-only clients can connect. With `REDMINE_MCP_PUBLIC_URL`, `REDMINE_MCP_AUTH_SECRET` and a Redmine OAuth application (`REDMINE_OAUTH_CLIENT_ID`, `REDMINE_OAUTH_CLIENT_SECRET`, Redmine 6.1+), the server becomes its own authorization server and signs people in through Redmine. Everything it issues is sealed with the secret, so it needs no database; a grant store, kept in memory by the CLI, makes codes single-use and rotates refresh tokens, and a reused one ends the sign-in. The scopes `redmine:read`, `redmine:write` and `redmine:delete` map to the access modes. `--api-key-login` signs people in with their API key instead, for Redmine without OAuth applications. `X-Redmine-API-Key` keeps working, and without the new settings `--http` is unchanged. `createRedmineMcpHandler` takes `publicUrl`, `oauth` (with a required `fetchClientMetadata` and an optional `store`) and `verifier`; the main entry exports `memoryGrantStore`, and `@redmine-ts/mcp/node` exports `publicFetch`.

## 0.1.1

### Patch Changes

- 2cb3aa0: Add CORS to the HTTP handler. A request from an origin listed in `--allow-origin` (or `allowedOrigins`) now gets a 204 answer to its preflight and `Access-Control-Allow-Origin` on every response, so a browser-based MCP client can call the server. The flag also takes an exact origin such as `https://app.example.com`, next to a hostname.
- e941182: Tool schemas no longer use `type` arrays, so clients that map them onto a dialect with one type per schema, such as Gemini's function declarations, can read them. A nullable value is now an `anyOf` with a `{ "type": "null" }` branch, and each branch carries the constraints of its type. The schemas accept exactly the values they accepted before. The MCP Inspector's `tools/list --strict` reported 587 warnings across 57 tools and now reports none.
- fa9a216: `raw_request` declares `body` and `response` as any JSON value with one type per branch, instead of a schema that names no type. Claude Code sends an argument whose schema names no type as a JSON string (anthropics/claude-code#82652), so an object `body` could reach Redmine as text.
- Updated dependencies [9c54bb6]
  - @redmine-ts/sdk@0.3.0

## 0.1.0

### Minor Changes

- bbfcb0d: First release. An MCP server for the Redmine REST API, run with `npx -y @redmine-ts/mcp` or as the `redmine-mcp` command. It has one typed tool per `@redmine-ts/sdk` operation with explicit annotations, and workflow tools: `issue_context` reads an issue with its readable history, `reference_data` maps names to ids, `issues_transition` changes a status by name, and others upload and download attachments or send a raw request. Access is full by default; `--read-only` and `--no-delete` narrow it, and the SDK refuses a hidden tool before sending. It serves stdio, or Streamable HTTP with `--http`, where each request sends its own key in `X-Redmine-API-Key`. `createRedmineMcpServer` and `createRedmineMcpHandler` embed it, the handler unchanged on Node, Bun and Cloudflare Workers.

### Patch Changes

- Updated dependencies [8a0e64e]
  - @redmine-ts/sdk@0.2.1
