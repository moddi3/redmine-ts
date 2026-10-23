import { createRedmine, RedmineError, type Access } from "@redmine-ts/sdk";

const reader = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  access: "read-only",
});

console.log(`${await reader.issues.list({ where: { status_id: "open" } }).count()} open issues`);

// @ts-expect-error a read-only client has no update
await reader.issues.update({ issue_id: 42, notes: "Never sent." });

const agent = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  access: (process.env.REDMINE_ACCESS ?? "read-only") as Access,
});

try {
  await agent.issues.update({ issue_id: 42, notes: "Sent unless the access refuses it." });
} catch (error) {
  if (!RedmineError.is(error, "access_denied")) throw error;
  console.error(`${error.data.method} refused, the client is ${error.data.access}`);
}
