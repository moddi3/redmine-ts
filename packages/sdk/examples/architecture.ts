declare const blob: Blob;
declare function show(messages: readonly string[]): void;

import { createRedmine, RedmineError } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine", // subpath kept
  auth: { apiKey: process.env.REDMINE_API_KEY! }, // X-Redmine-API-Key header only
  version: "6.1", // optional; narrows types and refuses newer operations before any request
});

const issue = await rm.issues.get({ issue_id: 42, include: ["journals", "allowed_statuses"] });
console.log(issue.journals.length); // journals is Journal[], not optional, because it was included

for await (const open of rm.issues.list({
  where: {
    project_id: "web",
    status_id: "open", // status_id=o
    assigned_to_id: { none: true }, // assigned_to_id=!*
    updated_on: { gte: "2026-10-01" }, // updated_on=>=2026-10-01
    cf_12: ["S1", "S2"], // cf_12=S1|S2
  },
  sort: "updated_on:desc",
})) {
  console.log(open.subject); // fetched in pages of 100; `break` stops fetching
}

const upload = await rm.attachments.upload({ file: blob, filename: "trace.zip" });
await rm.issues.update({ issue_id: 42, notes: "ack", uploads: [upload] }, { as: "jsmith" });

try {
  await rm.issues.update({ issue_id: 42, subject: "" });
} catch (e) {
  if (RedmineError.is(e, "validation")) show(e.data.messages); // raw and localized: display, never match
}

// @ts-expect-error removeUsers exists since Redmine 7.0; this client declared 6.1
await rm.groups.removeUsers({ group_id: 3, user_ids: [1, 2] });
