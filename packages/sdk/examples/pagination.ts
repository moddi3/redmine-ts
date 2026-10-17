import { createRedmine } from "redmine-ts-sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

const open = rm.issues.list({ where: { project_id: "web", status_id: "open" } });
console.log(`${await open.count()} open issues`);

const first = await open.page({ limit: 25 });
console.log(`showing ${first.items.length} of ${first.total_count}`);

const statuses = await rm.issueStatuses.list().all();
console.log(statuses.map((status) => status.name));

const recent = await rm.issues
  .list({ where: { updated_on: { gte: "2026-10-01" } }, sort: "updated_on:desc" })
  .all({ max: 500 });
console.log(`${recent.length} issues updated this month`);

for await (const issue of rm.issues.list({ paging: "keyset", pageSize: 100 })) {
  console.log(issue.id, issue.updated_on);
}

for await (const page of rm.timeEntries.list({ from: "2026-10-01", to: "2026-10-31" }).pages()) {
  console.log(`offset ${page.offset}: ${page.items.length} entries`);
}
