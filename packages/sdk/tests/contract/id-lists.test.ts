import { beforeAll, expect, it } from "vite-plus/test";
import { cleanups, clientFor, describeServers, freshProject, ids } from "./helpers.ts";

// Redmine splits `a|b` for most filters, but issue_id, parent_id, child_id, done_ratio and the relation
// filters read only the first value and split that on commas. The SDK joins those with ",".
describeServers("issue filters that read a comma list", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();
  let projectId: number;
  const issue = {} as Record<
    "a" | "b" | "c" | "parentA" | "parentB" | "childA" | "childB" | "targetA" | "targetB",
    number
  >;

  beforeAll(async () => {
    projectId = (await freshProject(admin, cleanup, "idl")).id;
    const make = async (
      subject: string,
      extra: { done_ratio?: number; parent_issue_id?: number },
    ) => (await admin.issues.create({ project_id: projectId, subject, ...extra })).id;
    issue.a = await make("a", { done_ratio: 30 });
    issue.b = await make("b", { done_ratio: 40 });
    issue.c = await make("c", { done_ratio: 10 });
    issue.parentA = await make("parent a", {});
    issue.parentB = await make("parent b", {});
    issue.childA = await make("child a", { parent_issue_id: issue.parentA });
    issue.childB = await make("child b", { parent_issue_id: issue.parentB });
    issue.targetA = await make("target a", {});
    issue.targetB = await make("target b", {});
    for (const [from, to] of [
      [issue.childA, issue.targetA],
      [issue.childB, issue.targetB],
    ] as const) {
      await admin.relations.create({ issue_id: from, issue_to_id: to, relation_type: "blocks" });
    }
  });

  const found = async (
    where: Parameters<typeof admin.issues.list>[0] extends infer I
      ? I extends { where?: infer W }
        ? W
        : never
      : never,
  ) =>
    ids(
      await admin.issues
        .list({ where: { project_id: projectId, status_id: "any", ...where }, sort: "id" })
        .all(),
    );

  it("issue_id: [a, b] returns both issues", async () => {
    expect(await found({ issue_id: [issue.a, issue.c] })).toEqual([issue.a, issue.c]);
    expect(await found({ issue_id: [issue.a] })).toEqual([issue.a]);
    expect(await found({ issue_id: issue.b })).toEqual([issue.b]);
  });

  it("parent_id: [a, b] returns the children of both parents", async () => {
    expect(await found({ parent_id: [issue.parentA, issue.parentB] })).toEqual([
      issue.childA,
      issue.childB,
    ]);
  });

  it("child_id: [a, b] returns the parents of both children", async () => {
    expect(await found({ child_id: [issue.childA, issue.childB] })).toEqual([
      issue.parentA,
      issue.parentB,
    ]);
  });

  it("done_ratio: [a, b] returns the issues at either ratio, and a range still takes a pair", async () => {
    expect(await found({ done_ratio: [30, 40] })).toEqual([issue.a, issue.b]);
    expect(await found({ done_ratio: { between: [30, 40] } })).toEqual([issue.a, issue.b]);
    expect(await found({ done_ratio: { gte: 40 } })).toEqual([issue.b]);
  });

  it("a relation filter takes a list in = and in { not }", async () => {
    expect(await found({ blocks: [issue.targetA, issue.targetB] })).toEqual([
      issue.childA,
      issue.childB,
    ]);
    const others = await found({ blocks: { not: [issue.targetA, issue.targetB] } });
    expect(others).not.toContain(issue.childA);
    expect(others).not.toContain(issue.childB);
    expect(others).toEqual(expect.arrayContaining([issue.a, issue.b, issue.c]));
  });

  it("a filter that reads every value keeps the pipe", async () => {
    expect(await found({ status_id: [1, 2] })).toEqual(await found({ status_id: "open" }));
    expect(await found({ tracker_id: [1, 2, 3] })).toEqual(await found({}));
  });
});

describeServers("time entry filters that read a comma list", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();
  let projectId: number;
  const entries: number[] = [];
  const parents: number[] = [];

  beforeAll(async () => {
    projectId = (await freshProject(admin, cleanup, "idlt")).id;
    const activity = (await admin.enumerations.listTimeEntryActivities().all())[0];
    if (!activity) throw new Error("the seeded server has no time entry activity");
    for (const subject of ["a", "b"]) {
      const parent = await admin.issues.create({
        project_id: projectId,
        subject: `parent ${subject}`,
      });
      const child = await admin.issues.create({
        project_id: projectId,
        subject: `child ${subject}`,
        parent_issue_id: parent.id,
      });
      parents.push(parent.id);
      const entry = await admin.timeEntries.create({
        issue_id: child.id,
        hours: 1,
        activity_id: activity.id,
      });
      entries.push(entry.id);
    }
  });

  it("issue.parent_id: [a, b] returns the entries of both parents' children", async () => {
    const found = await admin.timeEntries
      .list({ where: { project_id: projectId, "issue.parent_id": parents }, sort: "id" })
      .all();

    expect(ids(found)).toEqual(entries);
  });
});
