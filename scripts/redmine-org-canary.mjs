// Weekly read-only check of the built SDK against www.redmine.org, the Redmine project's production
// site. Five GET requests, no writes, no retries beyond the SDK default. Run `vp run -r build` first.
import { createRedmine } from "../packages/sdk/dist/index.mjs";

const userAgent =
  "redmine-ts-canary (+https://github.com/moddi3/redmine-ts; weekly read-only check)";

const rm = createRedmine({
  baseUrl: "https://www.redmine.org",
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("User-Agent", userAgent);
    return fetch(input, { ...init, headers });
  },
});

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const issues = await rm.issues.list({ include: ["relations"] }).page({ limit: 3 });
expect(issues.items.length === 3, `issues page has ${issues.items.length} items`);
expect(issues.total_count > 3, `issues total_count ${issues.total_count}`);
console.log(`issues.list: ${issues.items.map((issue) => `#${issue.id}`).join(" ")}`);

const issue = await rm.issues.get({ issue_id: issues.items[0].id, include: ["journals"] });
expect(Array.isArray(issue.journals), "journals not included");
console.log(`issues.get #${issue.id}: ${issue.journals.length} journals`);

const ids = [];
let pages = 0;
for await (const page of rm.news.list({ pageSize: 2 }).pages()) {
  ids.push(...page.items.map((news) => news.id));
  if (++pages === 2) break;
}
expect(ids.length === 4 && new Set(ids).size === 4, `news pages gave ids ${ids.join(",")}`);
console.log(`news.list two pages: ${ids.join(" ")}`);

const statuses = await rm.issueStatuses.list().all();
expect(statuses.length > 0, "no issue statuses");
console.log(`issueStatuses.list: ${statuses.map((status) => status.name).join(", ")}`);
