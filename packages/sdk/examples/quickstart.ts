import { createRedmine } from "redmine-ts-sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

const issue = await rm.issues.get({ issue_id: 42, include: ["journals"] });
console.log(issue.subject, `${issue.journals.length} journal entries`);

for await (const open of rm.issues.list({
  where: {
    project_id: "web",
    status_id: "open",
    assigned_to_id: "me",
    updated_on: { gte: "2026-10-01" },
  },
  sort: "updated_on:desc",
})) {
  console.log(`#${open.id} ${open.subject}`);
}
