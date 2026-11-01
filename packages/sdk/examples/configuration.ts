import { createRedmine } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  timeoutMs: 10_000,
  maxConcurrent: 8,
  retry: { attempts: 4, maxMs: 10_000 },
  onEvent: (event) => {
    if (event.type === "retry") console.warn(`${event.op}: retry in ${event.delay_ms} ms`);
  },
});

const users = await rm.users
  .list({ where: { status: 1 } }, { signal: AbortSignal.timeout(60_000), retry: false })
  .all();
console.log(`${users.length} active users`);

const asSent = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  normalize: false,
});
const issue = await asSent.issues.get({ issue_id: 42, include: ["journals"] });
console.log(issue.journals.map((journal) => journal.id));
