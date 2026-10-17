import { readFileSync } from "node:fs";
import { createRedmine, RedmineError } from "../../packages/sdk/dist/index.mjs";
const env = JSON.parse(readFileSync(new URL("../../.redmine/env.json", import.meta.url), "utf8"));
for (const name of Object.keys(env)) {
  const e = env[name];
  const rm = createRedmine({
    baseUrl: e.baseUrl,
    auth: { apiKey: e.adminKey },
    version: name.startsWith("6.1") ? "6.1" : "7.0",
  });
  const me = await rm.users.current();
  const created = await rm.issues.create({
    project_id: e.projectIdentifier,
    subject: "dist smoke",
    custom_fields: [{ id: e.customFields.Severity, value: "S1" }],
  });
  const got = await rm.issues.get({
    issue_id: created.id,
    include: ["journals", "allowed_statuses"],
  });
  await rm.issues.update({ issue_id: created.id, notes: "hello" });
  let n = 0;
  for await (const i of rm.issues.list({
    where: { project_id: e.projectIdentifier, status_id: "open" },
    pageSize: 2,
  }))
    n++;
  const count = await rm.issues.list({ where: { project_id: e.projectIdentifier } }).count();
  const up = await rm.attachments.upload({ file: new Blob(["hello file"]), filename: "a.txt" });
  await rm.issues.update({ issue_id: created.id, uploads: [up] });
  const withAtt = await rm.issues.get({ issue_id: created.id, include: ["attachments"] });
  const dl = await rm.attachments.download(withAtt.attachments[0]);
  const text = new TextDecoder().decode(await dl.bytes());
  let kind;
  try {
    await rm.issues.update({ issue_id: created.id, subject: "" });
  } catch (err) {
    kind = err instanceof RedmineError ? err.kind : String(err);
  }
  let sw;
  try {
    await rm.with({ as: "nobody" }).users.current();
  } catch (err) {
    sw = err.kind;
  }
  let gate;
  try {
    await rm.groups.removeUsers({ group_id: 1, user_ids: [1] });
    gate = "sent";
  } catch (err) {
    gate = err.kind;
  }
  await rm.issues.delete({ issue_id: created.id });
  console.log(
    name,
    JSON.stringify({
      me: me.login,
      created: created.id,
      journals: got.journals.length,
      allowed: got.allowed_statuses.length,
      iterated: n,
      count,
      download: text,
      validation: kind,
      switchUser: sw,
      removeUsers: gate,
    }),
  );
}
