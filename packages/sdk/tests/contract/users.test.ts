import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { clientFor, cleanups, describeServers, ids, unique } from "./helpers.ts";

describeServers("users", (server) => {
  const admin = clientFor(server);
  const jsmith = clientFor(server, "user");
  const cleanup = cleanups();

  async function newUser(extra: Partial<Parameters<typeof admin.users.create>[0]> = {}) {
    const login = unique("user");
    const user = await admin.users.create({
      login,
      firstname: "Contract",
      lastname: login,
      mail: `${login}@example.net`,
      password: "contract-pass-1",
      ...extra,
    });
    cleanup.add(() => admin.users.delete({ user_id: user.id }));
    return user;
  }

  it("creates a user and reads it back", async () => {
    const created = await newUser();

    const user = await admin.users.get({ user_id: created.id });

    expect(user).toMatchObject({
      id: created.id,
      login: created.login,
      firstname: "Contract",
      mail: `${created.login}@example.net`,
      admin: false,
    });
  });

  it("updates a user", async () => {
    const created = await newUser();

    await admin.users.update({ user_id: created.id, firstname: "Changed", admin: true });

    expect(await admin.users.get({ user_id: created.id })).toMatchObject({
      firstname: "Changed",
      lastname: created.lastname,
      admin: true,
    });
  });

  it("lists users filtered by name", async () => {
    const created = await newUser();
    await newUser();

    const found = await admin.users.list({ name: created.login }).all();

    expect(ids(found)).toEqual([created.id]);
  });

  it("deletes a user and a get afterwards is not_found", async () => {
    const login = unique("gone");
    const created = await admin.users.create({
      login,
      firstname: "Gone",
      lastname: "Soon",
      mail: `${login}@example.net`,
      password: "contract-pass-1",
    });

    await expect(admin.users.delete({ user_id: created.id })).resolves.toBeUndefined();

    const error = await admin.users.get({ user_id: created.id }).catch((e: unknown) => e);
    expect(RedmineError.is(error, "not_found")).toBe(true);
  });

  it("users.current is the key's owner: admin sees admin rights, jsmith does not", async () => {
    const asAdmin = await admin.users.current();
    const asJsmith = await jsmith.users.current({ include: ["memberships"] });

    expect(asAdmin).toMatchObject({ login: "admin", admin: true });
    expect(asJsmith).toMatchObject({ login: "jsmith", firstname: "John", lastname: "Smith" });
    expect(asJsmith.admin).not.toBe(true);
    expect(
      asJsmith.memberships.map((m) => [m.project.name, m.roles.map((r) => r.name)]),
    ).toContainEqual(["SDK Test", ["Developer"]]);
  });
});
