import { createRedmine, RedmineError } from "@redmine-ts/sdk";

const reader = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  access: "read-only",
});

console.log(`${await reader.issues.list({ where: { status_id: "open" } }).count()} open issues`);

try {
  await reader.issues.update({ issue_id: 42, notes: "Never sent." });
} catch (error) {
  if (!RedmineError.is(error, "access_denied")) throw error;
  console.error(`${error.data.method} refused, the client is ${error.data.access}`);
}
