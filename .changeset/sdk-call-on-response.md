---
"@redmine-ts/sdk": minor
---

Call options take `onResponse`, which gets the status of each response the call receives, retries included. The last one is the response the call resolved with, so `rm.request` callers can tell a 201 or a 202 from a 200:

```ts
let status = 0;
const body = await rm.request(
  { method: "POST", path: "issues.json", body: { issue: { project_id: 1, subject: "New" } } },
  { onResponse: (response) => (status = response.status) },
);
```
