import { catalog } from "@redmine-ts/sdk/catalog";
import { describe, expect, it } from "vite-plus/test";
import { ADMIN_ONLY, toolName } from "../../src/catalog-tools.ts";
import { texts } from "../connect.ts";
import { callError, json, serve } from "./harness.ts";

const USERS_LIST =
  "Needs an admin key. To find a user's id and login by name without one, call people_find, or memberships_list and then users_get.";

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
    const { client, seen } = await serve({}, { access: "read-only" });
    const tools = (await client.listTools()).tools;
    const description = (name: string) => tools.find((tool) => tool.name === name)?.description;
    expect(description("users_list")).toMatch(/^List users\. Needs an admin key\. /);
    expect(description("users_list")).toContain(USERS_LIST);
    expect(description("groups_list")).toContain(
      "Needs an admin key. memberships_list lists the groups in a project, and groups_get reads one by id.",
    );
    expect(description("custom_fields_list")).toContain("Needs an admin key. reference_data");
    expect(description("users_get")).not.toContain("admin key");
    expect(description("users_get")).toContain("user_id from people_find");
    expect(tools.filter((tool) => tool.description?.includes("Needs an admin key"))).toHaveLength(
      3,
    );
    expect(seen).toEqual([]);
  });

  it("say so in a 403, which other tools keep general", async () => {
    const { client } = await serve({
      "GET /users.json": () => json({}, 403),
      "PUT /projects/web/archive.json": () => json({}, 403),
      "GET /issues/7.json": () => json({}, 403),
    });
    const users = await callError(client, "users_list", {});
    expect(texts(users)[0]).toBe(`Redmine answered 403 for users_list. ${USERS_LIST}`);
    const archive = await callError(client, "projects_archive", { project_id: "web" });
    expect(texts(archive)[0]).toBe(
      "Redmine answered 403 for projects_archive. Needs an admin key.",
    );
    const issue = await callError(client, "issues_get", { issue_id: 7 });
    expect(texts(issue)[0]).toBe(
      "Redmine answered 403 for issues_get: the key's user lacks the permission, or the REST API is disabled.",
    );
  });
});
