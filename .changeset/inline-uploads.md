---
"@redmine-ts/sdk": minor
---

`issues.create`, `issues.update`, `news.create`, `news.update` and `wiki.update` take files in `uploads`. The call uploads each `{ file, filename, content_type?, description? }` entry to `uploads.json`, one at a time in list order, then sends the record with a reference to each file. References from `attachments.upload` can sit in the same list, and `attachments.upload` is unchanged. Before the first request the client checks `access`, the declared version, each file entry and the record's input, so a refused call stores nothing.

When such a call fails after those checks, `error.uploads` holds your entries with each file Redmine acknowledged replaced by its reference. Pass it back as `uploads` to retry without sending those files again. It stays out of `toJSON`, because a token lets other users attach the file. A `ReadableStream` that is locked, appears twice, or was already sent by an earlier upload is refused before anything is sent.

`uploads` is now typed `UploadEntry[]`, and `InlineUpload` and `UploadEntry` are exported. `CatalogEntry.inlineUploads` names the input that takes files, and every catalog input schema is unchanged.
