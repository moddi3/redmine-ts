// Typechecked by `vp check`, never executed.

import {
  createRedmine,
  type Access,
  type LatestVersion,
  type Redmine,
  type RedmineConfig,
  type RedmineVersion,
} from "../../src/index.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const equal = <A, B>(proof: Equal<A, B>) => proof;

const baseUrl = "https://tracker.example.com/redmine";
const file = new Uint8Array([1]);
declare const fromEnv: Access;
declare const config: RedmineConfig;

const reader = createRedmine({ baseUrl, access: "read-only" });
const writer = createRedmine({ baseUrl, access: "no-delete" });
const full = createRedmine({ baseUrl, access: "full" });
const configured = createRedmine({ baseUrl, access: fromEnv });

export async function readOnly() {
  await reader.issues.list({ where: { status_id: "open" } }).all();
  await reader.issues.get({ issue_id: 42, include: ["journals"] });
  await reader.users.current();
  const download = await reader.attachments.download({ id: 5, filename: "a.png" });
  await reader.attachments.thumbnail({ id: 5 });
  await reader.request({ method: "GET", path: "agile_boards.json" });

  // @ts-expect-error a read-only client sends only GET
  await reader.issues.create({ project_id: "web", subject: "Crash on save" });
  // @ts-expect-error a read-only client sends only GET
  await reader.issues.update({ issue_id: 42, notes: "ack" });
  // @ts-expect-error a read-only client sends only GET
  await reader.issues.delete({ issue_id: 42 });
  // @ts-expect-error transition reads, then updates
  await reader.issues.transition({ issue_id: 42, status_id: 5 });
  // @ts-expect-error upload is a POST
  await reader.attachments.upload({ file, filename: "a.bin" });
  // @ts-expect-error update is a PATCH
  await reader.attachments.update({ attachment_id: 5, description: "d" });
  // @ts-expect-error rm.request takes only GET
  await reader.request({ method: "POST", path: "plugin/things.json", body: {} });
  // @ts-expect-error journals has no read
  await reader.journals.update({ journal_id: 1, notes: "n" });
  return download;
}

export async function noDelete() {
  await writer.issues.list().all();
  await writer.issues.create({ project_id: "web", subject: "Crash on save" });
  await writer.issues.update({ issue_id: 42, notes: "ack" });
  await writer.issues.transition({ issue_id: 42, status_id: 5 });
  await writer.attachments.upload({ file, filename: "a.bin" });
  await writer.attachments.update({ attachment_id: 5, description: "d" });
  await writer.request({ method: "PUT", path: "plugin/things/1.json", body: {} });

  // @ts-expect-error a no-delete client sends no DELETE
  await writer.issues.delete({ issue_id: 42 });
  // @ts-expect-error removeWatcher is a DELETE
  await writer.issues.removeWatcher({ issue_id: 42, user_id: 2 });
  // @ts-expect-error rm.request takes no DELETE
  await writer.request({ method: "DELETE", path: "plugin/things/1.json" });
}

export async function everyMethod() {
  for (const rm of [full, configured, createRedmine({ baseUrl }), createRedmine(config)]) {
    await rm.issues.create({ project_id: "web", subject: "Crash on save" });
    await rm.issues.update({ issue_id: 42, notes: "ack" });
    await rm.issues.delete({ issue_id: 42 });
    await rm.issues.transition({ issue_id: 42, status_id: 5 });
    await rm.attachments.upload({ file, filename: "a.bin" });
    await rm.request({ method: "DELETE", path: "plugin/things/1.json" });
  }
  // The full client type is unchanged, whatever wide access produced it.
  equal<Redmine<LatestVersion, "full">, Redmine>(true);
  const fromConfig: Redmine<RedmineVersion> = createRedmine(config);
  const wide: Redmine = configured;
  return [fromConfig, wide];
}

export async function versionAndAccess() {
  const legacyReader = createRedmine({ baseUrl, version: "6.1", access: "read-only" });
  await legacyReader.groups.list().all();
  await legacyReader.groups.get({ group_id: 3 });
  // @ts-expect-error a read-only client sends only GET
  await legacyReader.groups.addUser({ group_id: 3, user_id: 1 });
  // @ts-expect-error removeUsers exists since Redmine 7.0, and it is a DELETE
  await legacyReader.groups.removeUsers({ group_id: 3, user_ids: [1, 2] });

  // The spec's only 7.0 addition is a DELETE, so the key sets pin what each axis removes.
  type Verbs<V extends RedmineVersion, A extends Access> = keyof Redmine<V, A>["groups"];
  type Reads = "list" | "get";
  type Writes = Reads | "create" | "update" | "addUser";
  equal<Verbs<"6.1", "read-only">, Reads>(true);
  equal<Verbs<"7.0", "read-only">, Reads>(true);
  equal<Verbs<"6.1", "no-delete">, Writes>(true);
  equal<Verbs<"7.0", "no-delete">, Writes>(true);
  equal<Verbs<"6.1", "full">, Writes | "delete" | "removeUser">(true);
  equal<Verbs<"7.0", "full">, Writes | "delete" | "removeUser" | "removeUsers">(true);
}

export async function derived() {
  const legacyReader = createRedmine({ baseUrl, version: "6.1", access: "read-only" });
  const impersonating = legacyReader.with({ as: "jsmith" });
  equal<typeof impersonating, Redmine<"6.1", "read-only">>(true);
  equal<typeof impersonating.version, "6.1" | undefined>(true);
  // @ts-expect-error a derived client keeps its parent's access
  await impersonating.issues.update({ issue_id: 42, notes: "ack" });
  const legacy = createRedmine({ baseUrl, version: "6.1" }).with({});
  // @ts-expect-error and its version
  await legacy.groups.removeUsers({ group_id: 3, user_ids: [1, 2] });
  equal<ReturnType<typeof writer.with>, Redmine<LatestVersion, "no-delete">>(true);
}

export async function assignability() {
  // A function that only reads can ask for a read-only client and take any client.
  const openIssues = (rm: Redmine<LatestVersion, "read-only">) => rm.issues.list().count();
  await openIssues(full);
  await openIssues(writer);
  const admin = (rm: Redmine) => rm.issues.delete({ issue_id: 42 });
  // @ts-expect-error a read-only client is not a full one
  await admin(reader);
}
