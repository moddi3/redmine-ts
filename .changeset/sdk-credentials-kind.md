---
"@redmine-ts/sdk": minor
---

A bearer `token()` that throws or rejects now fails the call with the new error kind `credentials` instead of `network`, with the error as `cause`. The client no longer retries it, so retry inside `token()` if its source can fail briefly. A `switch` over `kind` that checks for every kind needs a `credentials` case.
