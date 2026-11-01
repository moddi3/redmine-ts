---
"@redmine-ts/sdk": patch
---

The client now refuses a number that has no wire form with kind `invalid_input`, before anything is sent. A `NaN` or `Infinity` in a typed body went out as `null`, so `issues.update({ issue_id: 42, estimated_hours: NaN })` cleared the field. In a path parameter, a query value, or a `where` filter it went out as the word `NaN`. Redmine answered 404 for `issues/NaN.json` and read `limit=NaN&offset=NaN` as its defaults. A typed body also refuses a function, which was dropped, and a bigint or a circular object, which threw a raw `TypeError`. Typed and `rm.request` bodies refuse an `undefined` array item, which went out as `null`. `Listing.page()` refuses an `offset` that is not a whole number from 0 and a `limit` that is not a whole number from 1.

A `BearerSource.token()` that never settles no longer holds the call and its concurrency slot. The wait for `token()` counts against `timeoutMs`, and the call's `signal` ends it without cancelling the token promise. A `token()` that throws or rejects fails the call as `network`, with the error as `cause`. Before, the raw error escaped. A caller that aborts while a shared `refresh()` runs stops waiting, and the refresh goes on for the other callers.

`timeoutMs` takes a positive number up to 2147483647, on the client and per call, and anything else is `invalid_input`. Before, a per-call `NaN`, `Infinity`, `0`, or negative value timed out after about 1 ms, and so did `2 ** 31` at either level.
