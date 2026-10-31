import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import {
  clientFor,
  cleanups,
  describeServers,
  freshProject,
  ids,
  recorder,
  unique,
} from "./helpers.ts";

describeServers("access modes", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();

  it("a read-only client lists issues but refuses issues.create before sending, and nothing is created", async () => {
    const wire = recorder();
    const readOnly = clientFor(server, "admin", { access: "read-only", onEvent: wire.onEvent });
    const subject = unique("read-only");
    const existing = await admin.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("listed"),
    });
    cleanup.add(() => admin.issues.delete({ issue_id: existing.id }));

    const listed = await readOnly.issues.list({ where: { issue_id: existing.id } }).all();
    const error = await readOnly.issues
      .create({ project_id: server.projectIdentifier, subject })
      .catch((e: unknown) => e);

    expect(ids(listed)).toEqual([existing.id]);
    expect(RedmineError.is(error, "access_denied")).toBe(true);
    expect((error as RedmineError).data).toEqual({
      kind: "access_denied",
      access: "read-only",
      method: "POST",
    });
    expect(wire.requests().map((r) => r.method)).toEqual(["GET"]);
    const found = await admin.issues
      .list({ where: { subject: { contains: subject }, status_id: "any" } })
      .all();
    expect(found).toEqual([]);
  });

  it("a no-delete client creates and updates an issue but refuses to delete it", async () => {
    const wire = recorder();
    const noDelete = clientFor(server, "admin", { access: "no-delete", onEvent: wire.onEvent });

    const created = await noDelete.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("no-delete"),
    });
    cleanup.add(() => admin.issues.delete({ issue_id: created.id }));
    await noDelete.issues.update({ issue_id: created.id, notes: "kept" });
    const error = await noDelete.issues.delete({ issue_id: created.id }).catch((e: unknown) => e);

    expect(RedmineError.is(error, "access_denied")).toBe(true);
    expect(wire.requests().map((r) => r.method)).toEqual(["POST", "PUT"]);
    const issue = await admin.issues.get({ issue_id: created.id, include: ["journals"] });
    expect(issue.journals.map((j) => j.notes)).toEqual(["kept"]);
    expect(ids(await admin.issues.list({ where: { issue_id: created.id } }).all())).toEqual([
      created.id,
    ]);
  });

  it("a no-delete client refuses role_ids that keep no current role, and swaps roles in two updates", async () => {
    const project = await freshProject(admin, cleanup, "nd");
    const jsmith = await clientFor(server, "user").users.current();
    const roles = await admin.roles.list().all();
    const [developer, reporter] = ["Developer", "Reporter"].map((name) => {
      const role = roles.find((r) => r.name === name);
      if (!role) throw new Error(`the seeded server has no ${name} role`);
      return role.id;
    }) as [number, number];
    const { id } = await admin.memberships.create({
      project_id: project.id,
      user_id: jsmith.id,
      role_ids: [developer],
    });
    const wire = recorder();
    const noDelete = clientFor(server, "admin", { access: "no-delete", onEvent: wire.onEvent });

    const unknown = await noDelete
      .request({
        method: "PUT",
        path: `memberships/${id}.json`,
        body: { membership: { role_ids: [999999] } },
      })
      .catch((e: unknown) => e);
    const swapped = await noDelete.memberships
      .update({ membership_id: id, role_ids: [reporter] })
      .catch((e: unknown) => e);
    await noDelete.memberships.update({ membership_id: id, role_ids: [developer, reporter] });
    await noDelete.memberships.update({ membership_id: id, role_ids: [reporter] });

    expect(RedmineError.is(unknown, "access_denied")).toBe(true);
    expect(RedmineError.is(swapped, "access_denied")).toBe(true);
    expect((swapped as RedmineError).data).toMatchObject({
      deletes: expect.stringContaining("To swap roles"),
    });
    expect(wire.requests().map((r) => r.method)).toEqual([
      "GET",
      "GET",
      "GET",
      "PUT",
      "GET",
      "PUT",
    ]);
    const membership = await admin.memberships.get({ membership_id: id });
    expect(membership.roles.map((r) => r.id)).toEqual([reporter]);
  });
});
