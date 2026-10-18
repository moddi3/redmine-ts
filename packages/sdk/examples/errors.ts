import { createRedmine, RedmineError } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_ADMIN_API_KEY! },
});

try {
  await rm.issues.update({ issue_id: 42, subject: "" });
} catch (error) {
  if (RedmineError.is(error, "validation")) {
    console.error(error.data.messages.join("\n"));
  } else if (RedmineError.is(error, "not_found")) {
    console.error(`Issue 42 is gone or hidden from this user (request ${error.request_id})`);
  } else {
    throw error;
  }
}

try {
  await rm.wiki.update({
    project_id: "web",
    wiki_page_title: "Runbook",
    text: "Restart the worker first.",
    version: 7,
  });
} catch (error) {
  if (!RedmineError.is(error, "conflict")) throw error;
  const latest = await rm.wiki.get({ project_id: "web", wiki_page_title: "Runbook" });
  console.error(`Someone saved version ${latest.version} first, merge your change into it`);
}

await rm.timeEntries.create(
  { issue_id: 42, hours: 1.5, activity_id: 9, comments: "Triage" },
  { as: "jsmith" },
);

const asJsmith = rm.with({ as: "jsmith" });
try {
  await asJsmith.issues.update({ issue_id: 42, notes: "Picked up by jsmith." });
} catch (error) {
  if (!RedmineError.is(error, "switch_user_rejected")) throw error;
  console.error(
    error.data.reason === "not_admin"
      ? "This API key does not belong to an admin, so it cannot act as another user"
      : `Cannot act as ${error.data.login}: no such active user`,
  );
}
