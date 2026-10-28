---
"@redmine-ts/mcp": minor
---

`people_find` is a new read-only workflow tool that finds people by name in a project's members, or on an issue and in its project, and returns each one's id, name and login for an `@login` mention, with any API key. Each match says how it matched: `exact`, `prefix`, or `partial` for a name that Redmine shows shorter, such as Ivan P., which comes only when nothing matched better. Groups are never returned. It makes at most 26 calls, each retried up to twice by the SDK. Every access mode lists it, so `full` now lists 93 tools, 92 on a 6.1 server, `no-delete` 77 and `read-only` 44.

The 14 tools whose Redmine actions run `require_admin`, such as `users_list`, now say "Needs an admin key" in their description, and their 403 error says that they need one or that the REST API is disabled. Each names what works without an admin key, where something does. A `user_id` input now names `people_find` as where to find the id, or `users_list` where `people_find` cannot find the user.

`reference_data` and `issue_context` no longer read a sixth page of members to learn that a project has more than 500.
