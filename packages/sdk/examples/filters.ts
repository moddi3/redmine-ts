import { createRedmine, type GetIssuesWhere } from "@redmine-ts/sdk";

const untriaged: GetIssuesWhere = {
  project_id: "web", // project_id=web
  status_id: "open", // status_id=o
  tracker_id: { not: 3 }, // tracker_id=!3
  assigned_to_id: { none: true }, // assigned_to_id=!*
  done_ratio: { between: [0, 50] }, // done_ratio=><0|50
  subject: { contains: "crash" }, // subject=~crash
  cf_12: ["S1", "S2"], // cf_12=S1|S2
  created_on: { raw: "<t-30" }, // created_on=<t-30, older than 30 days
};

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

const stale = await rm.issues.list({ where: untriaged, sort: "priority:desc" }).all({ max: 200 });
console.log(`${stale.length} untriaged issues older than a month`);

const pair = await rm.issues.list({ where: { issue_id: [4, 9], status_id: "any" } }).all();
console.log(pair.map((issue) => issue.id));

const twoProjects = await rm.issues.list({ where: { project_id: [1, 2] } }).count();
console.log(`${twoProjects} open issues in projects 1 and 2, not counting their subprojects`);

const allStatuses = await rm.issues
  .list({ where: { project_id: "web", status_id: "any" } })
  .count();
console.log(`${allStatuses} issues in web, open and closed`);

const belowEpic = await rm.issues.list({ where: { parent_id: { contains: 42 } } }).all();
console.log(`${belowEpic.length} open issues below #42`);
