import { beforeAll, expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import {
  cleanups,
  clientFor,
  describeServers,
  freshProject,
  ids,
  sorted,
  unique,
} from "./helpers.ts";

describeServers("project_id filters other than one id", (server) => {
  const admin = clientFor(server);
  const severity = `cf_${server.customFields.Severity}`;
  const cleanup = cleanups();
  const needle = unique("pf");
  let member: string;
  let a: { id: number; identifier: string; open: number; closed: number; entry: number };
  let b: typeof a;
  let c: typeof a;
  let child: { id: number; open: number };

  beforeAll(async () => {
    member = unique("pfuser");
    const user = await admin.users.create({
      login: member,
      firstname: "Project",
      lastname: "Filter",
      mail: `${member}@example.net`,
      password: "contract-pass-1",
    });
    cleanup.add(() => admin.users.delete({ user_id: user.id }));
    const developer = (await admin.roles.list().all()).find((r) => r.name === "Developer");
    if (!developer) throw new Error("the seeded server has no Developer role");
    const closed = (await admin.issueStatuses.list().all()).find((s) => s.is_closed);
    if (!closed) throw new Error("the seeded server has no closed status");
    const [activity] = await admin.enumerations.listTimeEntryActivities().all();
    if (!activity) throw new Error("the seeded server has no time entry activity");

    const issue = async (project_id: number) =>
      (await admin.issues.create({ project_id, subject: `${needle} issue` })).id;
    const project = async (joins: boolean) => {
      const { id, identifier } = await freshProject(admin, cleanup, "pf");
      if (joins) {
        await admin.memberships.create({
          project_id: id,
          user_id: user.id,
          role_ids: [developer.id],
        });
      }
      const open = await issue(id);
      const shut = await issue(id);
      await admin.issues.update({ issue_id: shut, status_id: closed.id });
      const entry = await admin.timeEntries.create({
        issue_id: open,
        activity_id: activity.id,
        hours: 1,
      });
      return { id, identifier, open, closed: shut, entry: entry.id };
    };
    a = await project(true);
    await admin.issues.update({
      issue_id: a.open,
      custom_fields: [{ id: server.customFields.Severity, value: "S2" }],
    });
    b = await project(true);
    c = await project(false);
    const sub = await admin.projects.create({
      name: `${a.identifier}-child`,
      identifier: `${a.identifier}-child`,
      parent_id: a.id,
    });
    cleanup.add(() => admin.projects.delete({ project_id: sub.id }));
    child = { id: sub.id, open: await issue(sub.id) };
  });

  type IssueWhere = NonNullable<Parameters<typeof admin.issues.list>[0]>["where"];
  const issues = async (where: IssueWhere, as?: string) =>
    ids(await admin.issues.list({ where, sort: "id" }, as === undefined ? {} : { as }).all());

  it("a list of ids returns the open issues of those projects", async () => {
    expect(await issues({ project_id: [a.id, b.id] })).toEqual([a.open, b.open]);
  });

  it("a list of ids with a status filter keeps that status filter", async () => {
    expect(await issues({ project_id: [a.id, b.id], status_id: "any" })).toEqual([
      a.open,
      a.closed,
      b.open,
      b.closed,
    ]);
    expect(await issues({ project_id: [a.id, b.id], status_id: "closed" })).toEqual([
      a.closed,
      b.closed,
    ]);
    expect(await issues({ project_id: [a.id, b.id], status_id: "c" })).toEqual([
      a.closed,
      b.closed,
    ]);
  });

  it("{ not } excludes the project and keeps the other filters", async () => {
    expect(await issues({ project_id: { not: a.id }, subject: { contains: needle } })).toEqual([
      b.open,
      c.open,
      child.open,
    ]);
  });

  it('"mine" and { not: "mine" } follow the memberships of the user', async () => {
    expect(await issues({ project_id: "mine" }, member)).toEqual([a.open, b.open]);
    expect(
      await issues({ project_id: { not: "mine" }, subject: { contains: needle } }, member),
    ).toEqual([c.open, child.open]);
  });

  it("a raw condition in Redmine's syntax", async () => {
    expect(await issues({ project_id: { raw: `${a.id}|${c.id}` } })).toEqual([a.open, c.open]);
    expect(
      await issues({ project_id: { raw: `!${a.id}` }, subject: { contains: needle } }),
    ).toEqual([b.open, c.open, child.open]);
  });

  it("a raw condition reads as Redmine's split, which drops empty values after a trailing pipe", async () => {
    expect(await issues({ project_id: { raw: `${a.id}|${c.id}|` } })).toEqual([a.open, c.open]);
  });

  it("a custom field condition next to a list of ids", async () => {
    expect(await issues({ project_id: [a.id, b.id], [severity]: "S2" })).toEqual([a.open]);
    expect(await issues({ project_id: [a.id, b.id], [severity]: "S1|S2" })).toEqual([a.open]);
  });

  it("a custom field takes no raw text or operator characters next to a list of ids", async () => {
    for (const cond of [{ raw: "*~alpha" }, { raw: ">t-7" }, "*~alpha", "!S2"]) {
      const error = await admin.issues
        .list({ where: { project_id: [a.id, b.id], [severity]: cond } })
        .all()
        .catch((e: unknown) => e);

      expect(RedmineError.is(error, "invalid_input")).toBe(true);
    }
  });

  it("keyset paging walks every page of a list of ids", async () => {
    const walked = await admin.issues
      .list({ where: { project_id: [a.id, b.id, c.id] }, pageSize: 1, paging: "keyset" })
      .all();

    expect(ids(walked)).toEqual([a.open, b.open, c.open]);
  });

  it("one id or identifier keeps Redmine's project scope, subprojects included", async () => {
    expect(await issues({ project_id: a.id })).toEqual([a.open, child.open]);
    expect(await issues({ project_id: a.identifier })).toEqual([a.open, child.open]);
    expect(await issues({ project_id: [a.id] })).toEqual([a.open, child.open]);
  });

  it("an identifier in a list is refused before the request, since Redmine would match nothing", async () => {
    const error = await admin.issues
      .list({ where: { project_id: [a.identifier, b.identifier] } })
      .all()
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "invalid_input")).toBe(true);
  });

  type EntryWhere = NonNullable<Parameters<typeof admin.timeEntries.list>[0]>["where"];
  const entries = async (where: EntryWhere, as?: string) =>
    sorted(ids(await admin.timeEntries.list({ where }, as === undefined ? {} : { as }).all()));

  it('time entries take a list of ids, { not } and "mine"', async () => {
    expect(await entries({ project_id: [a.id, b.id] })).toEqual([a.entry, b.entry]);
    expect(
      await entries({ project_id: { not: a.id }, "issue.subject": { contains: needle } }),
    ).toEqual([b.entry, c.entry]);
    expect(await entries({ project_id: "mine" }, member)).toEqual([a.entry, b.entry]);
  });
});
