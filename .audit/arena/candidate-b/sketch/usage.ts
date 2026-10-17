// Type-checked call sites (tsc passes on this file). The spec the sketch was reconciled to.

import { createRedmine, ops, RedmineError } from "./00-module-map.ts";
import type { Issue } from "./00-module-map.ts";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine", // subpath kept
  auth: { apiKey: "secret" },
  version: "6.1",
});

// 1. include narrows the result type; allowed_statuses is non-optional here
const issue = await rm.issues.get(42, { include: ["journals", "allowed_statuses"] });
const statuses: { id: number }[] = issue.allowed_statuses;

// 2. filters: wire names, typed operators, async iteration, pages of 100 under the hood
for await (const i of rm.issues.list({
  project_id: "web",
  where: { status_id: "open", assigned_to_id: { none: true }, updated_on: { gte: "2026-10-01" }, cf_12: ["S1", "S2"] },
  sort: "updated_on:desc",
})) {
  const _: Issue = i;
}
// @ts-expect-error `contains` is not a capability of status_id
rm.issues.list({ where: { status_id: { contains: "x" } } });

// 3. version gating without per-version modules: a 6.1 client has no groups.removeUsers
// @ts-expect-error removeUsers is since 7.0
await rm.groups.removeUsers(3, { user_ids: [1] });
const rm70 = createRedmine({ baseUrl: "https://x", version: "7.0" });
await rm70.groups.removeUsers(3, { user_ids: [1] });

// 4. the dispatch seam for generic code, per-call impersonation
await rm.with({ as: "jsmith" }).issues.update(42, { notes: "from jsmith", status_id: 3 });
const generic = await rm.call(ops.getIssue, { issue_id: 42 });

// 5. errors are data
try {
  await rm.issues.update(42, { subject: "" });
} catch (e) {
  if (RedmineError.is(e, "validation")) console.log(e.data.messages); // raw, localized
  else if (RedmineError.is(e, "switch_user_rejected")) console.log(e.data.login);
}

export { generic };
