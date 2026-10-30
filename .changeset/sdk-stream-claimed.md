---
"@redmine-ts/sdk": patch
---

An inline upload that passes a `ReadableStream` another call is sending at the same moment now gets `invalid_input` before it sends anything, as one made after that call does. It failed at `fetch` as `network` before. A call that fails before it sends its stream releases it, so a later call can upload it.
