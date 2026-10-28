import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { Client, Tool } from "@modelcontextprotocol/client";
import { createRedmine } from "@redmine-ts/sdk";
import type { User } from "@redmine-ts/sdk";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { texts } from "../connect.ts";
import { connectTo, describeServers } from "./servers.ts";

// ajv-formats is CommonJS with its plugin on `default`.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

interface Match {
  id: number;
  name: string;
  login: string | null;
  found_as: string[];
  locked?: true;
}

interface People {
  matches: Match[];
  more: number;
  unavailable?: string[];
}

describeServers("people_find", (server) => {
  const marker = `pf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const sdk = createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: server.adminKey } });
  const asJsmith = createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: server.userKey } });
  const cleanup: (() => Promise<unknown>)[] = [];
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  /** jsmith, a Developer in the project and not an admin. */
  let user: Client;
  let admin: Client;
  let tools: Tool[];
  let adminId: number;
  let semyon: User;
  let grace: User;
  let lena: User;
  let groupId: number;
  let issueId: number;

  async function find(on: Client, args: Record<string, unknown>): Promise<People> {
    const result = await on.callTool({ name: "people_find", arguments: args });
    expect(result.isError, texts(result).join("\n")).toBeFalsy();
    const validate = ajv.compile(tools.find((tool) => tool.name === "people_find")!.outputSchema!);
    expect(validate(result.structuredContent) ? [] : validate.errors).toEqual([]);
    return result.structuredContent as unknown as People;
  }

  async function person(key: string, firstname: string, lastname: string): Promise<User> {
    const login = `${key}-${marker}`;
    const created = await sdk.users.create({
      login,
      firstname,
      lastname,
      mail: `${login}@example.net`,
      password: "people-find-pass-1",
    });
    cleanup.push(() => sdk.users.delete({ user_id: created.id }));
    return created;
  }

  beforeAll(async () => {
    const roles = await sdk.roles.list().all();
    const role = (name: string) => roles.find((candidate) => candidate.name === name)!.id;
    const join = (user_id: number, name: string) =>
      sdk.memberships.create({
        project_id: server.projectIdentifier,
        user_id,
        role_ids: [role(name)],
      });

    adminId = (await sdk.users.current()).id;
    semyon = await person("semyon", "Семён", "Петров");
    await join(semyon.id, "Developer");
    // In the project only through the group, so Redmine gives her a membership with its roles.
    grace = await person("grace", "Grace", "Groupwood");
    const group = await sdk.groups.create({ name: `PF ${marker}`, user_ids: [grace.id] });
    groupId = group.id;
    cleanup.unshift(() => sdk.groups.delete({ group_id: group.id }));
    await join(group.id, "Reporter");
    lena = await person("lena", "Lena", "Lockwood");
    await join(lena.id, "Developer");
    await sdk.users.update({ user_id: lena.id, status: 3 });

    // The admin who writes it is no member of the project.
    const issue = await sdk.issues.create({
      project_id: server.projectIdentifier,
      subject: `People ${marker}`,
    });
    issueId = issue.id;
    cleanup.unshift(() => sdk.issues.delete({ issue_id: issue.id }));
    await sdk.issues.addWatcher({ issue_id: issue.id, user_id: semyon.id });
    await asJsmith.issues.update({ issue_id: issue.id, notes: "Seen by John." });

    user = await connectTo(server, "full", { apiKey: server.userKey });
    admin = await connectTo(server);
    tools = (await user.listTools()).tools;
  });

  afterAll(async () => {
    for (const undo of cleanup) await undo().catch(() => {});
  });

  it("is listed for a key that is not an admin's, in read-only mode too", async () => {
    const reader = await connectTo(server, "read-only", { apiKey: server.userKey });
    expect((await reader.listTools()).tools.map((tool) => tool.name)).toContain("people_find");
    expect(tools.find((tool) => tool.name === "users_list")?.description).toContain(
      "Needs an admin key.",
    );
  });

  it("finds a member by a Cyrillic name in the other word order and without its accent", async () => {
    const found = await find(user, { name: "петров семен", project_id: server.projectIdentifier });
    expect(found.matches).toContainEqual({
      id: semyon.id,
      name: "Семён Петров",
      login: semyon.login,
      found_as: ["member"],
    });
    expect(found.unavailable).toBeUndefined();
  });

  it("finds a user who is a member through a group, and never the group", async () => {
    const found = await find(user, { name: "grace", project_id: server.projectIdentifier });
    expect(found.matches).toContainEqual({
      id: grace.id,
      name: "Grace Groupwood",
      login: grace.login,
      found_as: ["member"],
    });
    expect(
      await find(user, { name: `PF ${marker}`, project_id: server.projectIdentifier }),
    ).toEqual({ matches: [], more: 0 });
    // groups_list needs an admin key; groups_get, which its description points to, does not.
    const group = await user.callTool({ name: "groups_get", arguments: { group_id: groupId } });
    expect(group.isError, texts(group).join("\n")).toBeFalsy();
    expect(group.structuredContent).toMatchObject({ id: groupId, name: `PF ${marker}` });
  });

  it("gives a locked member's login to an admin key only, and marks it locked", async () => {
    const asUser = await find(user, {
      name: "Lena Lockwood",
      project_id: server.projectIdentifier,
    });
    expect(asUser.matches).toContainEqual({
      id: lena.id,
      name: "Lena Lockwood",
      login: null,
      found_as: ["member"],
    });
    expect(asUser.unavailable).toEqual([
      expect.stringMatching(/^login of [\d, ]+: users_get answered 404\. /),
    ]);
    expect(asUser.unavailable![0]).toMatch(new RegExp(`\\b${lena.id}\\b`));

    const asAdmin = await find(admin, {
      name: "Lena Lockwood",
      project_id: server.projectIdentifier,
    });
    expect(asAdmin.matches).toContainEqual({
      id: lena.id,
      name: "Lena Lockwood",
      login: lena.login,
      found_as: ["member"],
      locked: true,
    });
  });

  it("finds an issue's author who is no member, and its watcher and journal user", async () => {
    const author = await find(user, { name: "Redmine Admin", issue_id: issueId });
    // jsmith's role shows only users who share a project with him, and no watchers.
    expect(author).toEqual({
      matches: [{ id: adminId, name: "Redmine Admin", login: null, found_as: ["author"] }],
      more: 0,
      unavailable: [
        "watchers: this key's user may not view the issue's watchers",
        expect.stringMatching(new RegExp(`^login of ${adminId}: users_get answered 404\\. `)),
      ],
    });
    // Redmine may also have made the author a watcher, as its auto-watch preference says.
    expect(await find(admin, { name: "Redmine Admin", issue_id: issueId })).toEqual({
      matches: [
        {
          id: adminId,
          name: "Redmine Admin",
          login: "admin",
          found_as: expect.arrayContaining(["author"]),
        },
      ],
      more: 0,
    });

    const watcher = await find(admin, { name: "Семён Петров", issue_id: issueId });
    expect(watcher.matches).toContainEqual({
      id: semyon.id,
      name: "Семён Петров",
      login: semyon.login,
      found_as: ["member", "watcher"],
    });
    const writer = await find(user, { name: "Smith John", issue_id: issueId });
    expect(writer.matches[0]).toEqual({
      id: expect.any(Number),
      name: "John Smith",
      login: "jsmith",
      found_as: ["member", "journal"],
    });
  });
});
