---
"@redmine-ts/sdk": minor
---

The client type follows `access`. With a literal `access: "read-only"`, the client has only the methods that send `GET`: reads, listings, `attachments.download` and `attachments.thumbnail`. `issues.transition`, `attachments.upload` and every other write are gone, and `rm.request` takes only `method: "GET"`. With `"no-delete"`, the methods that send `DELETE` are gone, and `rm.request` does not take `"DELETE"`. `rm.with()` keeps the access, and `Redmine` takes it as a second type parameter, as in `Redmine<"7.0", "read-only">`.

Code that called a write on a literal read-only client, which failed at runtime with `access_denied`, no longer compiles. An access typed `Access`, such as one read from an environment variable, keeps every method. The runtime refusal is unchanged.
