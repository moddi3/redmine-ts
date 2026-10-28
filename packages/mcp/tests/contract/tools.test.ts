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
    expect(names).toHaveLength(server.version === "6.1" ? 91 : 92);
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
    const outputOf = (name: string) => tools.find((tool) => tool.name === name)?.outputSchema;
    expect(outputOf("issues_get")).toMatchObject(issue);
    expect(outputOf("issues_list")).toMatchObject({ properties: { items: { items: issue } } });

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
    const page = await ok("issues_list", { where: { parent_id: parent.id as number } });
    expect(page.items).toEqual([
      expect.objectContaining({ id: child.id, parent: { id: parent.id } }),
    ]);
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
