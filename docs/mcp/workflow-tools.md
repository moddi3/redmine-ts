# Workflow tools in detail

Some behavior of the hand-written tools needs more than their descriptions. This page covers journal paging and diffs in `issue_context`, name matching in `people_find`, local files, and the issue resource.

## Read an issue with `issue_context`

`issue_context` returns one issue with what an agent needs to work on it: the full description, the statuses it can move to, its relations and subtasks, attachment metadata, watchers, and its newest journals as readable changes. [MCP tools](tools.md#workflow-tools) lists every workflow tool.

### Page through the journals

`issue_context` returns the newest `journals`, 20 by default. It returns fewer when they do not all fit in the [result budget](tools.md#result-size) with the rest of the result. When it leaves older journals out, for either reason, `journals_before` is the id of the oldest journal it returned. For the next older page, call `issue_context` again with that `journals_before`. Repeat until `journals_before` is `null`. On each page, `journals_omitted` counts the older journals that the next pages return, and `journals_total` counts all journals. `journals_before` means the journals before that one in Redmine's order. For a journal the key cannot see, such as one deleted since, it means the journals with lower ids. Journals named in `full` come in addition to the page, and `issue_context` never cuts them. An older journal in `full` still counts in `journals_omitted`, and comes again on its own page.

A page with `journals_before` returns the issue as `{id, updated_on}`, with the journals and their counts, and leaves out the rest of the issue, because the first page carried it. `journals_after` returns only the journals newer than the one it names, in the same short form. Use it, for example, to check for replies after a note. For a journal the key cannot see, `journals_after` means the journals with higher ids. When those journals do not fit on one page, pass the page's `journals_before` with the same `journals_after` to get the rest. A call with `journals` 0 and ids in `full`, which a clip marker names, returns the same short form with only those journals. Any other call returns the whole issue.

A page holds at least one journal, so paging moves on even when the issue alone is over the budget. An epic with hundreds of subtasks can be that large, and so can an issue with a long text custom field. The first page then holds the issue and one journal, and goes over the budget by that much.

### Read what changed

`issue_context` turns each journal detail into `{field, from, to}` with names, such as `{"field": "Status", "from": "New", "to": "In Progress"}`. It takes the names of statuses, trackers, and priorities from lists it caches for 5 minutes. It takes the names of assignees, categories, versions, and projects from the issue's project, and fetches them only when a journal needs them. A lookup the key may not read leaves the raw id.

A change to the description whose old or new text spans lines or is longer than 350 characters comes as `{field, diff}` instead, such as `{"field": "Description", "diff": "@@ line 13 @@\n  13. Step 13\n- 14. Step 14\n+ 14. Step fourteen\n  15. Step 15"}`. A change to a custom field comes as a diff only when a value spans lines. The diff lists the changed lines, `-` for old and `+` for new, with one unchanged line around each run of changes. In each run, the removed lines come before the added ones. `N` in `@@ line N @@` is the number of the run's first line in the new text.

A line longer than 350 characters shows an excerpt of at most 350 characters, with `…` in place of each part it leaves out. Each changed line longer than 350 characters pairs with one line on the other side of its run, one to one. The pairs that share the most text at their start and end form first, and a tie goes to the earlier lines. A long line can get its second choice when a closer pair took its first. The excerpt shows 40 characters on each side of every place where the two lines differ. When that would leave out only one character before the line's start or end, the excerpt runs to the start or end instead. The excerpt stops at 350 characters only when those parts do not fit. When a `-` and a `+` excerpt in one run would still read the same, both excerpts also show where those two lines differ. When no room is left for that, the diff stops before the `+` line. Any other long line shows its start. A diff stops at 1000 characters, so a rewrite whose removed lines fill all 1000 shows only removed lines. A diff that leaves anything out ends with one clip marker, which counts the characters of the full diff that it left out. A journal in `full` shows its diff uncut, with every line whole. CRLF and LF line breaks compare equal.

### Get text that was cut

`issue_context` cuts descriptions and notes longer than 4000 characters, and adds a marker that names the call for the full text. The result says how many journals it left out. For a description, that call is `issues_get`. For a journal, it is `issue_context` with `journals` 0 and the journal's id in `full`, which returns that journal unclipped even when it is older than the newest `journals`. That call returns the issue as `{id, updated_on}`, because the page with the marker carried the rest.

### Link to a note

Each journal's `note` is its N in the issue page's `#note-N`, and the issue resource puts `#note-N` in each journal heading. Redmine numbers all journals of an issue before it hides some of them. It hides other users' private notes from a user who may not view them. It also hides a journal without notes when the user may not see any of its changes. Such a change can be a relation to an issue that the user cannot see or that someone deleted later, or a custom field the user cannot see. After a hidden journal, `note` is lower than Redmine's number. A relation to a deleted issue lowers `note` for an admin key too.

## Find people

An `@login` mention needs the person's login. `users_list` would find it by name, but Redmine answers `users_list` only for an admin key. `people_find` searches the people that a project or an issue involves. Any key that can see those people may read them:

- With `project_id`, the project's members.
- With `issue_id`, the members of the issue's project, and the issue's author, assignee, watchers, and the users of its journals.

Each match comes as `{id, name, login, match, found_as}`. `name` is the name as Redmine shows it, in the users display format set under **Administration**, **Settings**, **Display**. `found_as` lists where `people_find` found the person: `member`, `author`, `assignee`, `watcher`, or `journal`. A person on the issue without `member`, such as an admin or someone who left, is not a member of its project now.

Matching works on words. Case, accents, and other marks do not count, so `семен` finds Семён and `jose` finds José. Letters with no mark to drop match their Latin spelling, so `lukasz` finds Łukasz and `strauss` finds Strauß. Punctuation splits words, except an apostrophe. The apostrophes `'`, `’`, and `ʼ` match each other. Each word of `name` pairs with a different word of the person's name, in any order, so `petrov ivan` finds Ivan Petrov. A word may be the start of one, so `Iv Pet` finds him too, but `van` does not. A Latin spelling does not find a name in Cyrillic, or the other way round. A name in a script without spaces matches only from its start.

`match` says how the person matched:

- `exact` means each word of `name` is a whole word of the person's name, such as `Petrov` for Ivan Petrov.
- `prefix` means each word of `name` is a whole word or the start of one, such as `Iv Pet` for Ivan Petrov.
- `partial` means the name as Redmine shows it holds less than `name`. Each of its words is a word of `name` or the initial of one. So `Ivan Petrov` finds someone shown as Ivan P., I. Petrov, or Ivan, and `Ivan Ivanovich Petrov` finds Ivan Petrov. When the shown name has as many words as `name`, a word of `name` may also start one of them, so `Iv Petrov` finds Ivan P.

A partial match may be someone else, so `people_find` returns partial matches only when no user matched better. The best matches come first: the same words, then whole words of a longer name, then starts of words, then partial matches. People on the issue come before the other members, and ties go by name.

`people_find` matches the names that Redmine shows. Under the `username` display format, Redmine shows logins, so search by login. Under `lastnamefirstname`, Redmine runs the last and first name together, so search by the last name or its start.

`people_find` leaves groups out, because a mention names a user. It still matches a user who is a member only through a group, because Redmine gives each user of a member group a membership of their own. An issue's assignee may be a group, and a group may watch an issue without being a member. `users_get` answers 404 for a group. So for a watcher or assignee that `users_get` does not find, `people_find` calls `groups_get`, drops the group, and looks up the next match in its place. A group the key may not see stays, with `login: null`.

`people_find` makes at most 26 calls. One call reads the issue. At most 5 calls read pages of members, which is 500 members. At most 20 calls look up matches, best first. A lookup calls `users_get`, or `groups_get` for a watcher or assignee that `users_get` does not find. With its default settings, the SDK retries each call up to twice on a 429, 502, 503, or 504 status, a network error, or a timeout. So `people_find` sends at most 78 requests. It returns at most 10 matches, and `more` counts the matches it did not look up. Ten groups that watch the issue can use up the 20 lookups. Then fewer than 10 matches come back while `more` is above 0, and `unavailable` says so. In a project of more than 500 members, `unavailable` says that `people_find` did not search the rest, and `memberships_list` pages through all of them.

`users_get` returns the login to any key that may see the user. A key that is not an admin's sees only active users, and, depending on its roles, only users in the projects it can see. For a user the key may not see, `login` is `null`, and `unavailable` names the user's id. Redmine resolves a mention from that key to the same users, so the mention would not reach them either. With an admin key, a locked user comes with `locked: true`, because Redmine notifies no locked user of a mention.

Redmine shows the issues and journals of a deleted user as its Anonymous user's, which has no login. `people_find` returns the Anonymous user with `login: null`, and `unavailable` says why. A key that is not an admin's gets 404 from `users_get` for it, as for a user it may not see.

A key whose role may not view watchers gets no watchers, and `unavailable` says so. When the key may not read the members of the issue's project, `people_find` searches the issue's people alone and says so in `unavailable`. When a page of members after the first fails, it searches the members it read before that page, and `unavailable` says how many. With `project_id`, a failed first page is an error.

## Attach and save files

To attach a file, call `attachments_upload`, then pass the reference in `uploads` of the create or update tool. The generated tools take references in `uploads`, never file content, so their schemas stay small and each file travels in its own request. Over `--http`, a request body may be up to about 6.7 MiB, enough for a 5 MiB file as `content_base64`. [Security defaults](http-server.md#security-defaults) lists that limit. Redmine keeps an upload that no record takes until an admin prunes it, so upload only what you attach.

`REDMINE_MCP_FILES_DIR` names the one local directory the server may use. With it set, `attachments_upload` accepts `path`, a file in that directory, given relative to the directory or as an absolute path. The server also lists `attachments_save`. It saves an attachment in that directory under a name that never replaces an existing file, such as `build (1).log`, and returns the absolute path. The description of `path` names the directory with its symlinks resolved, as do the paths that `attachments_save` returns. The errors for a path that does not exist in the directory, or that resolves outside it, name the directory the same way.

A path must resolve inside the directory once the server follows its symlinks. Before it reads or sends anything, the server refuses `../secret`, an absolute path outside the directory, and a symlink that points outside. `attachments_save` only reads from Redmine, so `read-only` mode lists it too. It writes the local file, though, so its `readOnlyHint` is `false`.

## Read an issue as a resource

The server offers the resource template `redmine://issues/{id}`. A read of `redmine://issues/123` returns issue 123 as Markdown, built from the same data as `issue_context`. The first line holds the warning about user-written text, and the user-written text comes quoted. The resource holds the newest 20 journals, and the [result budget](tools.md#result-size) does not apply to it. An unknown URI or a missing issue returns an MCP error.
