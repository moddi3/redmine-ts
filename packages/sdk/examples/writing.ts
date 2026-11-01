import { readFile, writeFile } from "node:fs/promises";
import { createRedmine, RedmineError } from "@redmine-ts/sdk";
import type { CreateIssueInput } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

const created = await rm.issues.create({
  project_id: "web",
  tracker_id: 1,
  subject: "Checkout fails on Safari 19",
  description: "The pay button does nothing after the address step.",
  uploads: [{ file: await readFile("trace.zip"), filename: "trace.zip" }],
});

await rm.issues.update({
  issue_id: created.id,
  priority_id: 4,
  notes: "Reproduced on 19.1, raising the priority.",
  uploads: [
    { file: await readFile("console.log"), filename: "console.log", content_type: "text/plain" },
  ],
});

const report: CreateIssueInput = {
  project_id: "web",
  subject: "Nightly build failed",
  uploads: [
    { file: await readFile("build.log"), filename: "build.log" },
    { file: await readFile("junit.xml"), filename: "junit.xml" },
  ],
};
try {
  await rm.issues.create(report);
} catch (error) {
  if (!RedmineError.is(error, "validation") || error.uploads === undefined) throw error;
  console.error(error.data.messages.join("\n")); // Severity cannot be blank
  await rm.issues.create({
    ...report,
    custom_fields: [{ id: 12, value: "S2" }],
    uploads: error.uploads,
  });
}

const release = await rm.attachments.upload({
  file: await readFile("app-2.4.0.zip"),
  filename: "app-2.4.0.zip",
  content_type: "application/zip",
});
await rm.files.create({ project_id: "web", token: release.token });

const issue = await rm.issues.get({ issue_id: created.id, include: ["attachments"] });
for (const attachment of issue.attachments) {
  const file = await rm.attachments.download(attachment);
  await writeFile(file.filename, await file.bytes());
}

await rm.issues.update({ issue_id: created.id, assigned_to_id: null, due_date: null });
