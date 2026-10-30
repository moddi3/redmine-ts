---
"@redmine-ts/mcp": minor
---

`attachments_download` and `attachments_save` take `attachment_id` instead of `id`, as `attachments_get` does. A call that still passes `id` is refused and names `attachment_id`.

Arguments that do not match a tool's input schema are refused with the kind `invalid_input`, like the SDK's own refusals: the message reads "Invalid input for <tool>: ... Nothing was sent." and the last text block is the error as JSON. An unknown argument is named, with the arguments the tool takes, such as `unknown argument "id"; attachments_download takes attachment_id, thumbnail, size`. A reason that ends with a period no longer gets a second one.
