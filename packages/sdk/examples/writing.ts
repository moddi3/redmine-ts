import { readFile, writeFile } from "node:fs/promises";
import { createRedmine } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

const created = await rm.issues.create({
  project_id: "web",
  tracker_id: 1,
  subject: "Checkout fails on Safari 19",
  description: "The pay button does nothing after the address step.",
});

await rm.issues.update({
  issue_id: created.id,
  priority_id: 4,
  notes: "Reproduced on 19.1, raising the priority.",
});

const upload = await rm.attachments.upload({
  file: await readFile("trace.zip"),
  filename: "trace.zip",
  content_type: "application/zip",
});
await rm.issues.update({ issue_id: created.id, notes: "Trace attached.", uploads: [upload] });

const issue = await rm.issues.get({ issue_id: created.id, include: ["attachments"] });
for (const attachment of issue.attachments) {
  const file = await rm.attachments.download(attachment);
  await writeFile(file.filename, await file.bytes());
}
