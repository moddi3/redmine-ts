import { createRedmine, parseRedmineVersion, RedmineError } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: process.env.REDMINE_URL!,
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  version: parseRedmineVersion(process.env.REDMINE_VERSION ?? "7.0"),
});

try {
  await rm.groups.removeUsers({ group_id: 3, user_ids: [7, 9] });
} catch (error) {
  if (!RedmineError.is(error, "unsupported_version")) throw error;
  for (const user_id of [7, 9]) await rm.groups.removeUser({ group_id: 3, user_id });
}

const legacy = createRedmine({
  baseUrl: "https://legacy-tracker.example.com",
  auth: { apiKey: process.env.LEGACY_API_KEY! },
  version: "6.1",
});

// @ts-expect-error removeUsers exists since Redmine 7.0; this client declared 6.1
await legacy.groups.removeUsers({ group_id: 3, user_ids: [7, 9] });
