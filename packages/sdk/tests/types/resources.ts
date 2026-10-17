// Typechecked by `vp check`, never executed.

import {
  createRedmine,
  type Issue,
  type IssueSummary,
  type Listing,
  type Redmine,
  type RedmineVersion,
  type UploadRef,
  type User,
} from "../../src/index.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const equal = <A, B>(proof: Equal<A, B>) => proof;

declare const rm61: Redmine<"6.1">;
declare const rm70: Redmine<"7.0">;
declare const rmAny: Redmine<RedmineVersion>;
const rm = createRedmine({ baseUrl: "https://tracker.example.com/redmine" });

export async function versionGating() {
  // @ts-expect-error removeUsers exists since Redmine 7.0; this client declared 6.1
  await rm61.groups.removeUsers({ group_id: 3, user_ids: [1, 2] });
  await rm70.groups.removeUsers({ group_id: 3, user_ids: [1, 2] });
  await rm.groups.removeUsers({ group_id: 3, user_ids: [1, 2] });
  await rmAny.groups.removeUsers({ group_id: 3, user_ids: [1, 2] });
  await rm61.groups.addUser({ group_id: 3, user_id: 1 });
}

export async function includeNarrowing() {
  const plain = await rm.issues.get({ issue_id: 1 });
  equal<typeof plain, Issue>(true);
  // @ts-expect-error journals is optional unless included
  const missing: NonNullable<Issue["journals"]> = plain.journals;

  const full = await rm.issues.get({ issue_id: 1, include: ["journals", "allowed_statuses"] });
  const journals: NonNullable<Issue["journals"]> = full.journals;
  const statuses: NonNullable<Issue["allowed_statuses"]> = full.allowed_statuses;
  // @ts-expect-error watchers was not included
  const watchers: NonNullable<Issue["watchers"]> = full.watchers;

  // @ts-expect-error getIssue documents no "time_entries" include
  await rm.issues.get({ issue_id: 1, include: ["time_entries"] });

  const sparse = await rm.issues.get({ issue_id: 1, include: ["relations", "children"] });
  // @ts-expect-error relations stays optional: the server omits the key when there are none
  const relations: NonNullable<Issue["relations"]> = sparse.relations;

  const me = await rm.users.current({ include: ["groups"] });
  const groups: NonNullable<User["groups"]> = me.groups;
  return [missing, journals, statuses, watchers, relations, groups];
}

export function filters() {
  const issues = rm.issues.list({
    where: {
      project_id: "web",
      status_id: "open",
      assigned_to_id: { none: true },
      updated_on: { gte: "2026-10-01" },
      subject: { contains: "crash" },
      "author.group": { not: [1, 2] },
      cf_12: ["S1", "S2"],
    },
    sort: "updated_on:desc",
    include: ["relations"],
  });
  type Listed = typeof issues extends Listing<infer T> ? T : never;
  // @ts-expect-error relations stays optional: the server omits the key when there are none
  const listedRelations: NonNullable<IssueSummary["relations"]> = ({} as Listed).relations;

  // @ts-expect-error status_id documents no text operators
  rm.issues.list({ where: { status_id: { contains: "x" } } });
  // @ts-expect-error project_id documents no presence operators
  rm.issues.list({ where: { project_id: { any: true } } });
  // @ts-expect-error "nope" is not a filter
  rm.issues.list({ where: { nope: 1 } });
  // @ts-expect-error offset is owned by the pager
  rm.issues.list({ offset: 100 });

  rm.timeEntries.list({
    from: "2026-10-01",
    to: "2026-10-31",
    where: { spent_on: { raw: "<t-30" } },
  });
  return listedRelations;
}

export async function bodies(upload: UploadRef) {
  await rm.issues.update({ issue_id: 42, notes: "ack", uploads: [upload] }, { as: "jsmith" });
  const created = await rm.users.create({
    login: "jsmith",
    firstname: "J",
    lastname: "Smith",
    mail: "j@example.com",
    send_information: true,
    pref: { hide_mail: true },
  });
  equal<typeof created, User>(true);
  // @ts-expect-error hours is required
  await rm.timeEntries.create({ issue_id: 1 });
  const entry = await rm.timeEntries.create({ issue_id: 1, hours: 1.5, comments: "review" });
  await rm.issues.addWatcher({ issue_id: 1, user_id: 2 });
  const statuses = rm.issueStatuses.list();
  return [entry, statuses];
}
