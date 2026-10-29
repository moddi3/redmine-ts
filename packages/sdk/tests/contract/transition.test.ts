import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { cleanups, clientFor, describeServers, ids, recorder, unique } from "./helpers.ts";

describeServers("issues.transition", (server) => {
  const seen = recorder();
  const admin = clientFor(server, "admin", { onEvent: seen.onEvent });
  const jsmith = clientFor(server, "user", { onEvent: seen.onEvent });
  const cleanup = cleanups();

  async function newIssue(client: typeof admin) {
    const issue = await client.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("transition"),
    });
    cleanup.add(() => admin.issues.delete({ issue_id: issue.id }));
    return issue;
  }

  const writes = (from: number) =>
    seen
      .requests()
      .slice(from)
      .filter((r) => r.method !== "GET");

  it("moves an issue to an allowed status and the notes land in a journal", async () => {
    const issue = await newIssue(admin);
    const { allowed_statuses, status } = await admin.issues.get({
      issue_id: issue.id,
      include: ["allowed_statuses"],
    });
    const target = allowed_statuses.find((s) => s.id !== status?.id);
    if (!target) throw new Error("admin has no status to move to");

    await admin.issues.transition({ issue_id: issue.id, status_id: target.id, notes: "moved" });

    const read = await admin.issues.get({ issue_id: issue.id, include: ["journals"] });
    expect(read.status?.id).toBe(target.id);
    expect(read.journals).toHaveLength(1);
    expect(read.journals[0]).toMatchObject({ notes: "moved" });
  });

  it("refuses a status the user's role may not reach, sends no PUT and changes nothing", async () => {
    const issue = await newIssue(jsmith);
    const { allowed_statuses, status } = await jsmith.issues.get({
      issue_id: issue.id,
      include: ["allowed_statuses"],
    });
    const everything = await jsmith.issueStatuses.list().all();
    const forbidden = everything.find((s) => !ids(allowed_statuses).includes(s.id));
    if (!forbidden) {
      throw new Error(
        `jsmith (Developer) is allowed every status from ${status?.name}; the workflow fixture changed`,
      );
    }
    const before = seen.requests().length;

    const error = await jsmith.issues
      .transition({ issue_id: issue.id, status_id: forbidden.id, notes: "should not land" })
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "transition_not_allowed")).toBe(true);
    expect((error as RedmineError).data).toMatchObject({
      wanted: forbidden.id,
      allowed: expect.arrayContaining(ids(allowed_statuses)),
    });
    expect(writes(before)).toEqual([]);
    const read = await jsmith.issues.get({ issue_id: issue.id, include: ["journals"] });
    expect(read.status?.id).toBe(status?.id);
    expect(read.journals).toEqual([]);
  });

  it("is a no-op, with no PUT, when the issue is already in the target status", async () => {
    const issue = await newIssue(admin);
    const { status } = await admin.issues.get({ issue_id: issue.id });
    const before = seen.requests().length;

    await admin.issues.transition({ issue_id: issue.id, status_id: status.id });

    expect(writes(before)).toEqual([]);
    expect(
      (await admin.issues.get({ issue_id: issue.id, include: ["journals"] })).journals,
    ).toEqual([]);
  });
});
