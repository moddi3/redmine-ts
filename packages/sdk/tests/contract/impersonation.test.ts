import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { cleanups, clientFor, describeServers, unique } from "./helpers.ts";

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
    expect((error as RedmineError).data).toMatchObject({ status: 412, login: "nobody" });
  });

  it("observed: a non-admin key sending { as } is not rejected, the header is ignored and the key's own user answers", async () => {
    const jsmith = clientFor(server, "user");

    expect((await jsmith.users.current({}, { as: "admin" })).login).toBe("jsmith");
    expect((await jsmith.users.current({}, { as: "nobody" })).login).toBe("jsmith");
  });
});
