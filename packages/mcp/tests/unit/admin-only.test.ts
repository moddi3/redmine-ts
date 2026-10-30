import { catalog } from "@redmine-ts/sdk/catalog";
import { describe, expect, it } from "vite-plus/test";
import { ADMIN_ONLY, toolName } from "../../src/catalog-tools.ts";
import { texts } from "../connect.ts";
import { callError, json, serve } from "./harness.ts";

const USERS_LIST =
  "To find a user's id and login by name without one, call people_find, or memberships_list and then users_get.";

describe("tools that need an admin key", () => {
  it("are the catalog's users, groups, custom fields, archive and unarchive operations", () => {
    const ids = new Set(catalog.map((entry) => entry.id));
    expect(Object.keys(ADMIN_ONLY).filter((id) => !ids.has(id))).toEqual([]);
    const names = catalog.filter((entry) => entry.id in ADMIN_ONLY).map(toolName);
    expect(names.toSorted()).toEqual([
      "custom_fields_list",
      "groups_add_user",
      "groups_create",
      "groups_delete",
      "groups_list",
      "groups_remove_user",
      "groups_remove_users",
      "groups_update",
      "projects_archive",
      "projects_unarchive",
      "users_create",
      "users_delete",
      "users_list",
      "users_update",
    ]);
  });

  it("say so after their title, with what works without one, and are listed for any key", async () => {
    const { client, seen } = await serve({});
    const tools = (await client.listTools()).tools;
    const description = (name: string) => tools.find((tool) => tool.name === name)?.description;
    expect(description("users_list")).toMatch(/^List users\. Needs an admin key\. /);
    expect(description("users_list")).toContain(`Needs an admin key. ${USERS_LIST}`);
    expect(description("groups_list")).toContain(
      "Needs an admin key. memberships_list lists the groups in a project, and groups_get reads one by id.",
    );
    expect(description("custom_fields_list")).toContain("Needs an admin key. reference_data");
    expect(description("users_get")).not.toContain("admin key");
    expect(
      tools
        .filter((tool) => tool.description?.includes("user_id from people_find"))
        .map((tool) => tool.name)
        .toSorted(),
    ).toEqual([
      "issues_add_watcher",
      "issues_remove_watcher",
      "time_entries_create",
      "time_entries_list",
      "time_entries_update",
      "users_get",
    ]);
    expect(
      tools
        .filter((tool) => tool.description?.includes("user_id from users_list"))
        .map((tool) => tool.name)
        .toSorted(),
    ).toEqual([
      "groups_add_user",
      "groups_remove_user",
      "memberships_create",
      "users_delete",
      "users_update",
    ]);
    expect(description("memberships_create")).toContain(
      "user_id from users_list with an admin key, role_ids from roles_list. people_find searches only a project's members and an issue's people, so it does not find a user who is not a member yet.",
    );
    expect(tools.filter((tool) => tool.description?.includes("Needs an admin key"))).toHaveLength(
      14,
    );
    expect(seen).toEqual([]);
  });

  it.each([
    [true, 93],
    [undefined, 93],
    [false, 79],
  ])(
    "are listed with admin %s in %i tools, and the instructions mention them only then",
    async (admin, count) => {
      const { client } = await serve({}, {}, { admin });
      const tools = (await client.listTools()).tools;
      expect(tools).toHaveLength(count);
      const hidden = admin === false;
      expect(tools.some((tool) => tool.description?.includes("Needs an admin key"))).toBe(!hidden);
      expect(client.getInstructions()).toContain(
        "people_find returns the id and login of people by name in a project or an issue, for any key.",
      );
      expect(client.getInstructions()?.includes('"Needs an admin key"')).toBe(!hidden);
    },
  );

  it("answer a call with admin false, with Redmine's 403 and what works without an admin key", async () => {
    const { client } = await serve(
      { "GET /users.json": () => json({}, 403) },
      {},
      { admin: false },
    );
    const users = await callError(client, "users_list", {});
    expect(texts(users)[0]).toBe(
      `Redmine answered 403 for users_list: it needs an admin key, or the REST API is disabled. ${USERS_LIST}`,
    );
  });

  it("say so in a 403, with the REST API that may be off, and other tools keep it general", async () => {
    const { client } = await serve({
      "GET /users.json": () => json({}, 403),
      "PUT /projects/web/archive.json": () => json({}, 403),
      "GET /issues/7.json": () => json({}, 403),
    });
    const users = await callError(client, "users_list", {});
    expect(texts(users)[0]).toBe(
      `Redmine answered 403 for users_list: it needs an admin key, or the REST API is disabled. ${USERS_LIST}`,
    );
    const archive = await callError(client, "projects_archive", { project_id: "web" });
    expect(texts(archive)[0]).toBe(
      "Redmine answered 403 for projects_archive: it needs an admin key, or the REST API is disabled.",
    );
    const issue = await callError(client, "issues_get", { issue_id: 7 });
    expect(texts(issue)[0]).toBe(
      "Redmine answered 403 for issues_get: the key's user lacks the permission, or the REST API is disabled.",
    );
  });
});
