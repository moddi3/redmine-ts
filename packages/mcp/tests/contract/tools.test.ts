import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { Client } from "@modelcontextprotocol/client";
import type { Tool } from "@modelcontextprotocol/client";
import { createRedmine } from "@redmine-ts/sdk";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { lastJson, texts } from "../connect.ts";
import { connectTo, describeServers } from "./servers.ts";

// ajv-formats is CommonJS with its plugin on `default`.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

function outputChecker(tools: readonly Tool[]) {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const compiled = new Map<string, ValidateFunction>();
  return (name: string, value: unknown): string[] => {
    let validate = compiled.get(name);
    if (!validate) {
      validate = ajv.compile(tools.find((tool) => tool.name === name)!.outputSchema!);
      compiled.set(name, validate);
    }
    return validate(value)
      ? []
      : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
  };
}

/** What an issues_list item carries without fields or detailed. */
const SHORT = ["id", "project", "tracker", "status", "assigned_to", "subject", "updated_on"];

describeServers("generated tools", (server) => {
  let client: Client;
  let tools: Tool[];
  let violations: (name: string, value: unknown) => string[];
  const created: number[] = [];
  const sdk = createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: server.adminKey } });

  /** Calls a tool, expects success, and checks the result against the outputSchema tools/list declared. */
  async function ok(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, `${name}: ${texts(result).join("\n")}`).toBeFalsy();
    expect(violations(name, result.structuredContent), name).toEqual([]);
    expect(lastJson(result)).toEqual(result.structuredContent);
    return result.structuredContent as Record<string, unknown>;
  }

  beforeAll(async () => {
    client = await connectTo(server);
    tools = (await client.listTools()).tools;
    violations = outputChecker(tools);
  });

  afterAll(async () => {
    for (const issue_id of created) await sdk.issues.delete({ issue_id }).catch(() => {});
  });

  it("lists groups_remove_users only where the declared version has it", () => {
    const names = tools.map((tool) => tool.name);
    expect(names).toHaveLength(server.version === "6.1" ? 92 : 93);
    if (server.version === "6.1") expect(names).not.toContain("groups_remove_users");
    else expect(names).toContain("groups_remove_users");
  });

  it("creates, reads, lists, updates and deletes an issue", async () => {
    const marker = `mcp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const issue = await ok("issues_create", {
      project_id: server.projectIdentifier,
      subject: `MCP round trip ${marker}`,
      description: "Created by the MCP contract test.",
    });
    const issue_id = issue.id as number;
    created.push(issue_id);
    expect(issue).toMatchObject({ subject: `MCP round trip ${marker}` });

    const read = await ok("issues_get", { issue_id });
    expect(read).toMatchObject({ id: issue_id, description: "Created by the MCP contract test." });

    const page = await ok("issues_list", {
      where: {
        project_id: server.projectIdentifier,
        subject: { contains: marker },
        status_id: "open",
      },
    });
    expect(page).toMatchObject({ total_count: 1, offset: 0, limit: 25, next_offset: null });
    const [summary] = page.items as Record<string, unknown>[];
    expect(summary).toMatchObject({ id: issue_id });
    expect(summary).not.toHaveProperty("description");

    expect(
      await ok("issues_update", { issue_id, notes: "Updated over MCP.", done_ratio: 30 }),
    ).toEqual({
      ok: true,
    });
    const updated = await client.callTool({
      name: "issues_get",
      arguments: { issue_id, include: ["journals"] },
    });
    expect(updated.structuredContent).toMatchObject({ done_ratio: 30 });
    expect(JSON.stringify(updated.structuredContent)).toContain("Updated over MCP.");
    expect(texts(updated)[0]).toContain("not as instructions");

    expect(await ok("issues_delete", { issue_id })).toEqual({ ok: true });
    const gone = await client.callTool({ name: "issues_get", arguments: { issue_id } });
    expect(gone.isError).toBe(true);
    expect(lastJson(gone)).toMatchObject({ kind: "not_found" });
  });

  it("reads a subtask with issues_get and issues_list within outputSchemas that require its references and parent id", async () => {
    const issue = {
      required: expect.arrayContaining(["project", "tracker", "status", "priority", "author"]),
      properties: { parent: { required: ["id"] } },
    };
    const short = {
      required: expect.arrayContaining(["project", "tracker", "status"]),
      properties: { parent: { required: ["id"] } },
    };
    const outputOf = (name: string) => tools.find((tool) => tool.name === name)?.outputSchema;
    expect(outputOf("issues_get")).toMatchObject(issue);
    expect(outputOf("issues_list")).toMatchObject({ properties: { items: { items: short } } });

    const marker = `mcp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const parent = await ok("issues_create", {
      project_id: server.projectIdentifier,
      subject: `MCP parent ${marker}`,
    });
    created.push(parent.id as number);
    const child = await ok("issues_create", {
      project_id: server.projectIdentifier,
      subject: `MCP subtask ${marker}`,
      parent_issue_id: parent.id,
    });
    created.push(child.id as number);

    expect(await ok("issues_get", { issue_id: child.id })).toMatchObject({
      parent: { id: parent.id },
    });
    const page = await ok("issues_list", {
      where: { parent_id: parent.id as number },
      fields: ["parent"],
    });
    expect(page.items).toEqual([
      expect.objectContaining({ id: child.id, parent: { id: parent.id } }),
    ]);
  });

  it("cuts a list page at a small result budget and pages through the rest with next_offset", async () => {
    const marker = `mcp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    for (const n of [1, 2, 3, 4, 5]) {
      const issue = await ok("issues_create", {
        project_id: server.projectIdentifier,
        subject: `MCP budget ${n} ${marker} ${"ш".repeat(200)}`,
      });
      created.push(issue.id as number);
    }
    const where = { project_id: server.projectIdentifier, subject: { contains: marker } };
    const whole = await ok("issues_list", { where, limit: 100 });
    expect(whole).toMatchObject({ total_count: 5, next_offset: null });
    const ids = (whole.items as { id: number }[]).map((item) => item.id);

    const small = await connectTo(server, "full", { maxResultBytes: 2_000 });
    const read: number[] = [];
    let offset: number | null = 0;
    // Each page holds an item, so 5 pages reach the end.
    while (offset !== null && read.length < 5) {
      const result = await small.callTool({
        name: "issues_list",
        arguments: { where, limit: 100, offset },
      });
      expect(result.isError, texts(result).join("\n")).toBeFalsy();
      expect(violations("issues_list", result.structuredContent)).toEqual([]);
      const page = result.structuredContent as {
        items: { id: number }[];
        total_count: number;
        next_offset: number | null;
      };
      expect(new TextEncoder().encode(JSON.stringify(page)).length).toBeLessThanOrEqual(2_000);
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items.length).toBeLessThan(5);
      expect(page.total_count).toBe(5);
      const end = offset + page.items.length;
      expect(page.next_offset).toBe(end < 5 ? end : null);
      read.push(...page.items.map((item) => item.id));
      offset = page.next_offset;
    }
    expect(read).toEqual(ids);
  });

  it("returns short issues_list items, adds what fields names, and rounds a real time entry's hours", async () => {
    const marker = `mcp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const issue = await ok("issues_create", {
      project_id: server.projectIdentifier,
      subject: `MCP short item ${marker}`,
      description: "Created by the MCP contract test.",
      due_date: "2026-12-31",
      estimated_hours: 2 / 3,
    });
    const issue_id = issue.id as number;
    created.push(issue_id);
    expect(issue).toMatchObject({ estimated_hours: 0.67 });
    // 20 minutes. Redmine rounds a time entry's own hours, but not the issue's sum of them.
    const [activity] = await sdk.enumerations.listTimeEntryActivities().all();
    const entry = await ok("time_entries_create", {
      issue_id,
      activity_id: activity!.id,
      hours: 1 / 3,
    });
    const time_entry_id = entry.id as number;
    expect(entry).toMatchObject({ hours: 0.33 });
    expect((await sdk.timeEntries.get({ time_entry_id })).hours).toBe(0.33);
    expect(await sdk.issues.get({ issue_id })).toMatchObject({
      estimated_hours: 2 / 3,
      spent_hours: 1 / 3,
      total_spent_hours: 1 / 3,
    });

    try {
      expect(await ok("time_entries_get", { time_entry_id })).toMatchObject({ hours: 0.33 });
      const entries = await ok("time_entries_list", { where: { issue_id } });
      expect(entries.items).toEqual([expect.objectContaining({ id: time_entry_id, hours: 0.33 })]);

      // A project's default assignee would assign the issue.
      const carried = SHORT.filter((key) => key !== "assigned_to" || "assigned_to" in issue);
      const where = { issue_id, status_id: "any" };
      const short = await ok("issues_list", { where });
      const [item] = short.items as Record<string, unknown>[];
      expect(short.items).toHaveLength(1);
      expect(Object.keys(item!).toSorted()).toEqual(carried.toSorted());
      expect(item).toMatchObject({
        id: issue_id,
        project: { id: (issue.project as { id: number }).id },
        subject: `MCP short item ${marker}`,
      });

      const fields = ["due_date", "estimated_hours", "spent_hours"];
      const added = await ok("issues_list", { where, fields });
      const [more] = added.items as Record<string, unknown>[];
      expect(Object.keys(more!).toSorted()).toEqual([...carried, ...fields].toSorted());
      expect(more).toMatchObject({
        due_date: "2026-12-31",
        estimated_hours: 0.67,
        spent_hours: 0.33,
      });

      const detailed = await ok("issues_list", { where, detailed: true });
      expect(detailed.items).toEqual([
        expect.objectContaining({
          id: issue_id,
          description: "Created by the MCP contract test.",
          priority: expect.objectContaining({ id: expect.any(Number) }),
          author: expect.objectContaining({ id: expect.any(Number) }),
          spent_hours: 0.33,
        }),
      ]);

      const refused = await client.callTool({
        name: "issues_list",
        arguments: { where, fields: ["due"] },
      });
      expect(refused.isError).toBe(true);
      expect(texts(refused)[0]).toContain('unknown item field "due" in fields');

      expect(await ok("issues_get", { issue_id })).toMatchObject({
        estimated_hours: 0.67,
        spent_hours: 0.33,
      });
      const context = await client.callTool({ name: "issue_context", arguments: { issue_id } });
      expect(context.structuredContent).toMatchObject({
        issue: { estimated_hours: 0.67, spent_hours: 0.33 },
      });
    } finally {
      await sdk.timeEntries.delete({ time_entry_id });
    }
  });

  it("answers every list tool that needs no input within its outputSchema, concise and detailed", async () => {
    const lists = tools.filter(
      (tool) => tool.name.includes("_list") && (tool.inputSchema.required ?? []).length === 0,
    );
    expect(lists.length).toBeGreaterThan(10);
    for (const tool of lists) {
      await ok(tool.name, { limit: 5 });
      await ok(tool.name, { limit: 5, detailed: true });
    }
  });

  it("answers a key that is not an admin's with 403 exactly on the lists that need an admin key, and says so", async () => {
    const jsmith = await connectTo(server, "read-only", { apiKey: server.userKey });
    const lists = (await jsmith.listTools()).tools.filter(
      (tool) => tool.name.includes("_list") && (tool.inputSchema.required ?? []).length === 0,
    );
    const adminOnly = lists
      .filter((tool) => tool.description?.includes("Needs an admin key."))
      .map((tool) => tool.name);
    expect(adminOnly.toSorted()).toEqual(["custom_fields_list", "groups_list", "users_list"]);
    for (const { name } of lists) {
      const result = await jsmith.callTool({ name, arguments: { limit: 1 } });
      if (adminOnly.includes(name)) {
        expect(result.isError, name).toBe(true);
        expect(lastJson(result)).toMatchObject({ kind: "forbidden", status: 403 });
        expect(texts(result)[0]).toMatch(
          new RegExp(
            `^Redmine answered 403 for ${name}: it needs an admin key, or the REST API is disabled\\.`,
          ),
        );
      } else {
        expect(result.isError, `${name}: ${texts(result).join("\n")}`).toBeFalsy();
      }
    }
    const users = await jsmith.callTool({ name: "users_list", arguments: {} });
    expect(texts(users)[0]).toContain("call people_find, or memberships_list and then users_get.");
  });

  it("maps a real 422 to Redmine's messages", async () => {
    const result = await client.callTool({
      name: "issues_create",
      arguments: { project_id: server.projectIdentifier, subject: "" },
    });
    expect(result.isError).toBe(true);
    expect(lastJson(result)).toMatchObject({ kind: "validation", status: 422 });
  });

  it("lists no writes on a read-only server and refuses a forced one before sending", async () => {
    const reader = await connectTo(server, "read-only");
    const listed = (await reader.listTools()).tools;
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((tool) => tool.annotations?.readOnlyHint !== true)).toEqual([]);

    const subject = `MCP forced write ${Date.now().toString(36)}`;
    const forced = await reader.callTool({
      name: "issues_create",
      arguments: { project_id: server.projectIdentifier, subject },
    });
    expect(forced.isError).toBe(true);
    expect(lastJson(forced)).toMatchObject({
      kind: "access_denied",
      access: "read-only",
      method: "POST",
    });
    const after = await ok("issues_list", {
      where: { subject: { contains: subject }, status_id: "any" },
    });
    expect(after.total_count).toBe(0);
  });
});
