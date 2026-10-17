import { expect, it } from "vite-plus/test";
import { createRedmine, RedmineError } from "../../src/index.ts";
import { cleanups, clientFor, describeServers, ids, recorder, unique, sorted } from "./helpers.ts";
import type { ContractServer } from "./helpers.ts";

const is70 = (s: ContractServer) => s.version === "7.0";
const is61 = (s: ContractServer) => s.version === "6.1";

describeServers("version gate on a client declared 6.1", (server) => {
  it("groups.removeUsers rejects with unsupported_version and sends no request", async () => {
    const seen = recorder();
    const rm = createRedmine({
      baseUrl: server.baseUrl,
      version: "6.1",
      auth: { apiKey: server.adminKey },
      onEvent: seen.onEvent,
    });

    // @ts-expect-error removeUsers exists since Redmine 7.0; this client declared 6.1
    const attempt = rm.groups.removeUsers({ group_id: 1, user_ids: [1] });
    const error = await attempt.catch((e: unknown) => e);

    expect(RedmineError.is(error, "unsupported_version")).toBe(true);
    expect((error as RedmineError).data).toMatchObject({
      declared: "6.1",
      since: "7.0",
      until: null,
    });
    expect(seen.requests()).toEqual([]);
  });
});

describeServers(
  "groups.removeUsers on a 7.0 server",
  (server) => {
    const admin = createRedmine({
      baseUrl: server.baseUrl,
      version: "7.0",
      auth: { apiKey: server.adminKey },
    });
    const cleanup = cleanups();

    it("removes the named users from a real group and leaves the others", async () => {
      const jsmith = await clientFor(server, "user").users.current();
      const login = unique("gate");
      const other = await admin.users.create({
        login,
        firstname: "Gate",
        lastname: "Member",
        mail: `${login}@example.net`,
        password: "contract-pass-1",
      });
      cleanup.add(() => admin.users.delete({ user_id: other.id }));
      const group = await admin.groups.create({
        name: unique("grp"),
        user_ids: [jsmith.id, other.id],
      });
      cleanup.add(() => admin.groups.delete({ group_id: group.id }));
      const members = async () =>
        sorted(ids((await admin.groups.get({ group_id: group.id, include: ["users"] })).users));
      expect(await members()).toEqual(sorted([jsmith.id, other.id]));

      await expect(
        admin.groups.removeUsers({ group_id: group.id, user_ids: [jsmith.id] }),
      ).resolves.toBeUndefined();

      expect(await members()).toEqual([other.id]);
    });

    it("an undeclared-version client reaches the same operation", async () => {
      const undeclared = clientFor(server, "admin", { version: undefined });
      const jsmith = await clientFor(server, "user").users.current();
      const group = await admin.groups.create({ name: unique("grp"), user_ids: [jsmith.id] });
      cleanup.add(() => admin.groups.delete({ group_id: group.id }));

      await undeclared.groups.removeUsers({ group_id: group.id, user_ids: [jsmith.id] });

      expect((await admin.groups.get({ group_id: group.id, include: ["users"] })).users).toEqual(
        [],
      );
    });
  },
  is70,
);

describeServers(
  "groups.removeUsers on the 6.1 server",
  (server) => {
    const cleanup = cleanups();

    it("an undeclared-version client gets not_found with a hint naming 7.0, and nothing is removed", async () => {
      const admin = clientFor(server, "admin", { version: undefined });
      const jsmith = await clientFor(server, "user").users.current();
      const group = await admin.groups.create({ name: unique("grp"), user_ids: [jsmith.id] });
      cleanup.add(() => admin.groups.delete({ group_id: group.id }));

      const error = await admin.groups
        .removeUsers({ group_id: group.id, user_ids: [jsmith.id] })
        .catch((e: unknown) => e);

      expect(RedmineError.is(error, "not_found")).toBe(true);
      expect((error as RedmineError).data).toMatchObject({
        kind: "not_found",
        hint: expect.stringContaining("7.0"),
      });
      expect(
        ids((await admin.groups.get({ group_id: group.id, include: ["users"] })).users),
      ).toEqual([jsmith.id]);
    });
  },
  is61,
);
