import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { cleanups, clientFor, describeServers, recorder, unique } from "./helpers.ts";

describeServers("impersonation", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();

  it('{ as: "jsmith" } on a call makes jsmith the issue author', async () => {
    const created = await admin.issues.create(
      { project_id: server.projectIdentifier, subject: unique("as") },
      { as: "jsmith" },
    );
    cleanup.add(() => admin.issues.delete({ issue_id: created.id }));

    const issue = await admin.issues.get({ issue_id: created.id });
    expect(issue.author).toMatchObject({ name: "John Smith" });
  });

  it("rm.with({ as }) derives a client that acts as jsmith while the original stays admin", async () => {
    const jsmith = admin.with({ as: "jsmith" });

    expect((await jsmith.users.current()).login).toBe("jsmith");
    expect((await admin.users.current()).login).toBe("admin");
  });

  it("a notes update through the derived client is attributed to jsmith", async () => {
    const issue = await admin.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("as-note"),
    });
    cleanup.add(() => admin.issues.delete({ issue_id: issue.id }));

    await admin.with({ as: "jsmith" }).issues.update({ issue_id: issue.id, notes: "from jsmith" });

    const read = await admin.issues.get({ issue_id: issue.id, include: ["journals"] });
    expect(read.journals[0]).toMatchObject({ notes: "from jsmith", user: { name: "John Smith" } });
  });

  it("an unknown login is switch_user_rejected and names the login", async () => {
    const error = await admin
      .with({ as: "nobody" })
      .users.current()
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "switch_user_rejected")).toBe(true);
    expect((error as RedmineError).data).toEqual({
      kind: "switch_user_rejected",
      reason: "rejected_by_server",
      status: 412,
      login: "nobody",
    });
  });

  it('a non-admin key with { as: "admin" } is refused as not_admin and nothing is created', async () => {
    const seen = recorder();
    const jsmith = clientFor(server, "user", { onEvent: seen.onEvent });
    const subject = unique("misattributed");
    const control = await jsmith.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("own"),
    });
    cleanup.add(() => admin.issues.delete({ issue_id: control.id }));
    seen.events.length = 0;

    const error = await jsmith.issues
      .create({ project_id: server.projectIdentifier, subject }, { as: "admin" })
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "switch_user_rejected")).toBe(true);
    expect((error as RedmineError).data).toEqual({
      kind: "switch_user_rejected",
      login: "admin",
      reason: "not_admin",
    });
    expect(seen.requests().map((r) => r.method)).toEqual(["GET"]);
    const created = await admin.issues
      .list({ where: { project_id: server.projectIdentifier, status_id: "any", subject } })
      .all();
    expect(created).toEqual([]);
  });

  it("the verdict is cached: a second impersonated call on the non-admin client sends nothing", async () => {
    const seen = recorder();
    const jsmith = clientFor(server, "user", { onEvent: seen.onEvent });

    await jsmith.users.current({}, { as: "admin" }).catch(() => undefined);
    await jsmith.users.current({}, { as: "admin" }).catch(() => undefined);

    expect(seen.requests()).toHaveLength(1);
  });

  it('an admin key with { as: "jsmith" } still acts as jsmith after one extra check request', async () => {
    const seen = recorder();
    const client = clientFor(server, "admin", { onEvent: seen.onEvent });

    expect((await client.users.current({}, { as: "jsmith" })).login).toBe("jsmith");
    expect((await client.users.current({}, { as: "jsmith" })).login).toBe("jsmith");

    expect(seen.requests()).toHaveLength(3);
  });
});
