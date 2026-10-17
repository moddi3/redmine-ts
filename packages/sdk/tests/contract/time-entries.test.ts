import { beforeAll, expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import {
  clientFor,
  cleanups,
  describeServers,
  freshProject,
  ids,
  isoDay,
  unique,
  sorted,
} from "./helpers.ts";

describeServers("time entries", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();

  let activity_id: number;
  beforeAll(async () => {
    const [first] = await admin.enumerations.listTimeEntryActivities().all();
    if (!first) throw new Error("the seeded server has no time entry activity");
    activity_id = first.id;
  });

  async function projectWithIssue() {
    const project = await freshProject(admin, cleanup);
    const issue = await admin.issues.create({ project_id: project.id, subject: unique("timed") });
    return { project, issue };
  }

  it("creates 1.5 hours on an issue and reads the number 1.5 back", async () => {
    const { project, issue } = await projectWithIssue();

    const created = await admin.timeEntries.create({
      issue_id: issue.id,
      activity_id,
      hours: 1.5,
      spent_on: isoDay(),
      comments: "contract",
    });

    expect(created.hours).toBe(1.5);
    const read = await admin.timeEntries.get({ time_entry_id: created.id });
    expect(read).toMatchObject({
      id: created.id,
      hours: 1.5,
      spent_on: isoDay(),
      comments: "contract",
      issue: { id: issue.id },
      project: { id: project.id },
      user: { name: "Redmine Admin" },
    });
    expect(read.hours).toBeTypeOf("number");
  });

  it("lists entries filtered by issue and by project", async () => {
    const { project, issue } = await projectWithIssue();
    const other = await admin.issues.create({ project_id: project.id, subject: unique("other") });
    const a = await admin.timeEntries.create({ issue_id: issue.id, activity_id, hours: 1.5 });
    const b = await admin.timeEntries.create({ issue_id: issue.id, activity_id, hours: 0.25 });
    await admin.timeEntries.create({ issue_id: other.id, activity_id, hours: 3 });

    const byIssue = await admin.timeEntries.list({ where: { issue_id: issue.id } }).all();
    const byProject = await admin.timeEntries.list({ where: { project_id: project.id } }).all();

    expect(sorted(ids(byIssue))).toEqual(sorted([a.id, b.id]));
    expect(sorted(byIssue.map((e) => e.hours))).toEqual([0.25, 1.5]);
    expect(byProject).toHaveLength(3);
    expect(await admin.timeEntries.list({ where: { issue_id: issue.id } }).count()).toBe(2);
  });

  it("updates hours and comments", async () => {
    const { issue } = await projectWithIssue();
    const created = await admin.timeEntries.create({ issue_id: issue.id, activity_id, hours: 1.5 });

    await admin.timeEntries.update({ time_entry_id: created.id, hours: 2.75, comments: "revised" });

    expect(await admin.timeEntries.get({ time_entry_id: created.id })).toMatchObject({
      hours: 2.75,
      comments: "revised",
    });
  });

  it("deletes an entry and a get afterwards is not_found", async () => {
    const { issue } = await projectWithIssue();
    const created = await admin.timeEntries.create({ issue_id: issue.id, activity_id, hours: 1.5 });

    await expect(admin.timeEntries.delete({ time_entry_id: created.id })).resolves.toBeUndefined();

    const error = await admin.timeEntries
      .get({ time_entry_id: created.id })
      .catch((e: unknown) => e);
    expect(RedmineError.is(error, "not_found")).toBe(true);
  });

  it("rejects an entry without hours as a validation error", async () => {
    const { issue } = await projectWithIssue();

    const error = await admin.timeEntries
      .create({ issue_id: issue.id, activity_id, hours: undefined as unknown as number })
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "validation")).toBe(true);
    expect(
      (error as RedmineError<{ kind: "validation"; status: 422; messages: string[] }>).data.messages
        .length,
    ).toBeGreaterThan(0);
  });
});
