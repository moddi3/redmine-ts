# Create and update records

This page covers creating and updating records, clearing fields, and attaching and downloading files. The examples use a client `rm` made as in the [quickstart](../../packages/sdk/README.md#quickstart), and these imports:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { createRedmine, RedmineError } from "@redmine-ts/sdk";
import type { CreateIssueInput } from "@redmine-ts/sdk";
```

## Create and update a record

`create` returns the new record. `update` returns nothing, because Redmine answers it with an empty body. `notes` on an issue update adds a journal entry. To attach files, put them in `uploads` on `issues.create`, `issues.update`, `news.create`, `news.update`, or `wiki.update`:

```ts
const created = await rm.issues.create({
  project_id: "web",
  tracker_id: 1,
  subject: "Checkout fails on Safari 19",
  description: "The pay button does nothing after the address step.",
  uploads: [{ file: await readFile("trace.zip"), filename: "trace.zip" }],
});

await rm.issues.update({
  issue_id: created.id,
  priority_id: 4,
  notes: "Reproduced on 19.1, raising the priority.",
  uploads: [
    { file: await readFile("console.log"), filename: "console.log", content_type: "text/plain" },
  ],
});
```

## Clear a field

To clear a field on update, set it to `null`. Redmine ignores a `null` `assigned_to_id` but clears the field for `""`, so the client sends `""` for that one field. For every other nullable field, the client sends `null` as is:

```ts
await rm.issues.update({ issue_id: created.id, assigned_to_id: null, due_date: null });
```

## Attach files

`file` takes a `Blob`, `Uint8Array`, `ArrayBuffer`, or `ReadableStream`. An entry also takes `filename` and, optionally, `content_type` and `description`. Redmine attaches files in two steps, and the call runs both. The call uploads each file to `uploads.json`, one at a time in list order, and then sends the record with a reference to each file. A reference from `attachments.upload` can go in the same list, and the client sends it to Redmine as is.

- Each file is one more request under the same `access`, `as`, retry, and `timeoutMs` rules, so a call with three files can take four timeouts.
- The client never retries a `ReadableStream`, because a stream can be read only once. Before it sends anything, the client also refuses some streams with `invalid_input`. It refuses a stream that is locked to a reader, that appears twice in the list, or that another upload already sent or is sending.
- Before the first request, the call checks `access` and the declared `version` for both steps, every file entry, and the record's own input. A call that fails these checks stores nothing.

## Retry a failed upload

When a call fails after its checks, `error.uploads` holds your entries in order, with each file that Redmine acknowledged replaced by its reference. To retry without sending those files again, pass `error.uploads` back as `uploads`:

```ts
const report: CreateIssueInput = {
  project_id: "web",
  subject: "Nightly build failed",
  uploads: [
    { file: await readFile("build.log"), filename: "build.log" },
    { file: await readFile("junit.xml"), filename: "junit.xml" },
  ],
};
try {
  await rm.issues.create(report);
} catch (error) {
  if (!RedmineError.is(error, "validation") || error.uploads === undefined) throw error;
  console.error(error.data.messages.join("\n")); // Severity cannot be blank
  await rm.issues.create({
    ...report,
    custom_fields: [{ id: 12, value: "S2" }],
    uploads: error.uploads,
  });
}
```

- The client deletes nothing after a failure. Redmine keeps an upload that no record took until an admin runs `rake redmine:attachments:prune`, which deletes unattached uploads older than a day. The official Docker image does not schedule that task.
- Redmine did not acknowledge an entry that still has `file`. If the upload's response was lost, Redmine may have stored the file anyway, and a retry uploads it again.
- `toJSON` and the enumerable properties leave `uploads` out, because a token lets any user who can edit a record attach the upload and read it.
- After a `timeout` or a `network` error, the record may have reached Redmine. Redmine then refuses a retry of an issue create or update with `validation`, because the retry's tokens are already attached. So Redmine does not add a second issue or note. `wiki.update` skips attached tokens and saves the page again. To make a retry fail with `conflict` after a later edit, pass `version`.
- Redmine attaches files on `issues.update` only for a user who may edit the issue or add notes to it. A role that can update without either, such as one that may edit only its own issues, gets 204 on another author's issue, and Redmine drops the files.

## Upload a file without a record

`attachments.upload` runs the first step alone and returns the reference. Use it when you want to keep the reference, or for `files.create`, which takes one `token` instead of `uploads`:

```ts
const release = await rm.attachments.upload({
  file: await readFile("app-2.4.0.zip"),
  filename: "app-2.4.0.zip",
  content_type: "application/zip",
});
await rm.files.create({ project_id: "web", token: release.token });
```

## Download attachments

To read files back, download them from the record's attachments:

```ts
const issue = await rm.issues.get({ issue_id: created.id, include: ["attachments"] });
for (const attachment of issue.attachments) {
  const file = await rm.attachments.download(attachment);
  await writeFile(file.filename, await file.bytes());
}
```

`download` takes any object with `id` and `filename` and builds the URL from `baseUrl`. It ignores the attachment's `content_url`. Behind a proxy, `content_url` can name another host, which would then receive your API key. The result has `filename`, `content_type`, `size`, a `body` stream that you can read once, and `bytes()`. `attachments.thumbnail` works the same way.
