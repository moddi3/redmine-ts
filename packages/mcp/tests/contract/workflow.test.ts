import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { Client, Tool } from "@modelcontextprotocol/client";
import { createRedmine } from "@redmine-ts/sdk";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { lastJson, texts } from "../connect.ts";
import { connectTo, describeServers } from "./servers.ts";

// ajv-formats is CommonJS with its plugin on `default`.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

interface Change {
  field: string;
  from: string | null;
  to: string | null;
}

describeServers("workflow tools", (server) => {
  let client: Client;
  let tools: Tool[];
  let issue_id: number;
  const cleanup: (() => Promise<unknown>)[] = [];
  const dir = mkdtempSync(join(tmpdir(), "redmine-mcp-contract-"));
  const marker = `mcp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const sdk = createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: server.adminKey } });
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);

  /** Calls a tool, expects success, and checks the result against the outputSchema tools/list declared. */
  async function ok(name: string, args: Record<string, unknown>, on = client) {
    const result = await on.callTool({ name, arguments: args });
    expect(result.isError, `${name}: ${texts(result).join("\n")}`).toBeFalsy();
    const validate = ajv.compile(tools.find((tool) => tool.name === name)!.outputSchema!);
    expect(validate(result.structuredContent) ? [] : validate.errors, name).toEqual([]);
    return result;
  }
  const value = async (name: string, args: Record<string, unknown>) =>
    (await ok(name, args)).structuredContent as Record<string, any>;

  beforeAll(async () => {
    client = await connectTo(server, "full", { filesDir: dir });
    tools = (await client.listTools()).tools;
    const created = await value("issues_create", {
      project_id: server.projectIdentifier,
      subject: `MCP workflow ${marker}`,
      description: "Created by the MCP workflow contract test.",
    });
    issue_id = created.id;
  });

  afterAll(async () => {
    if (issue_id !== undefined) await sdk.issues.delete({ issue_id }).catch(() => {});
    for (const undo of cleanup) await undo().catch(() => {});
  });

  it("lists every workflow tool, attachments_save included with a files directory", () => {
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "issue_context",
        "reference_data",
        "issues_transition",
        "attachments_upload",
        "attachments_download",
        "attachments_save",
        "raw_request",
      ]),
    );
  });

  it("maps names to ids with reference_data, with and without a project", async () => {
    const global = await value("reference_data", {});
    expect(global.statuses.map((status: { name: string }) => status.name)).toEqual(
      expect.arrayContaining(["New", "In Progress", "Closed"]),
    );
    expect(global.trackers.length).toBeGreaterThan(0);
    expect(global.priorities.some((priority: { is_default: boolean }) => priority.is_default)).toBe(
      true,
    );
    expect(global.current_user).toMatchObject({
      login: "admin",
      name: "Redmine Admin",
      admin: true,
    });
    expect(global.custom_fields.map((field: { id: number }) => field.id)).toEqual(
      expect.arrayContaining([server.customFields.Severity]),
    );
    expect(global).not.toHaveProperty("project");

    const scoped = await value("reference_data", { project_id: server.projectIdentifier });
    expect(scoped.project).toMatchObject({
      identifier: server.projectIdentifier,
      name: "SDK Test",
      enabled_modules: expect.arrayContaining(["issue_tracking"]),
    });
    expect(scoped.project.members).toEqual(
      expect.arrayContaining([
        { type: "user", id: expect.any(Number), name: "John Smith", roles: ["Developer"] },
      ]),
    );
    expect(scoped.project.issue_custom_fields).toEqual(
      expect.arrayContaining([{ id: server.customFields.Severity, name: "Severity" }]),
    );

    const user = await connectTo(server, "full", { apiKey: server.userKey });
    const plain = (await ok("reference_data", {}, user)).structuredContent as Record<
      string,
      unknown
    >;
    expect(plain).toMatchObject({
      current_user: { login: "jsmith", admin: false },
      custom_fields: null,
    });
    expect(JSON.stringify(plain)).not.toContain(server.userKey);
  });

  it("transitions by name, refuses an unknown name, and shows the history with names in issue_context", async () => {
    const moved = await value("issues_transition", {
      issue_id,
      status: "in progress",
      notes: "Started over MCP.",
    });
    expect(moved).toMatchObject({ ok: true, status: { name: "In Progress" } });

    const unknown = await client.callTool({
      name: "issues_transition",
      arguments: { issue_id, status: "No such status" },
    });
    expect(unknown.isError).toBe(true);
    expect(texts(unknown)[0]).toMatch(/Allowed, by id and name: \d+ "/);
    expect(lastJson(unknown)).toMatchObject({ kind: "unknown_status" });

    const reference = await value("reference_data", { project_id: server.projectIdentifier });
    const jsmith = reference.project.members.find(
      (member: { name: string }) => member.name === "John Smith",
    );
    const high = reference.priorities.find(
      (priority: { name: string }) => priority.name === "High",
    );
    // Assigned and then unassigned, so naming jsmith needs the project's memberships. Redmine ignores
    // assigned_to_id: null, and issues_update refuses "", so the unassignment goes through raw_request.
    await value("issues_update", { issue_id, assigned_to_id: jsmith.id, priority_id: high.id });
    await value("raw_request", {
      method: "PUT",
      path: `issues/${issue_id}.json`,
      body: {
        issue: {
          assigned_to_id: "",
          notes: "A note over MCP.",
          custom_fields: [{ id: server.customFields.Severity, value: "S2" }],
        },
      },
    });

    const context = await value("issue_context", { issue_id });
    expect(context.issue).toMatchObject({ id: issue_id, subject: `MCP workflow ${marker}` });
    expect(context.allowed_statuses.length).toBeGreaterThan(0);
    const changes: Change[] = context.journals.flatMap(
      (journal: { changes: Change[] }) => journal.changes,
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: "Status", from: "New", to: "In Progress" },
        { field: "Assignee", from: null, to: "John Smith" },
        { field: "Assignee", from: "John Smith", to: null },
        { field: "Priority", from: "Normal", to: "High" },
        { field: "Severity", from: null, to: "S2" },
      ]),
    );
    const notes = context.journals.map((journal: { notes: string }) => journal.notes);
    expect(notes).toEqual(expect.arrayContaining(["Started over MCP.", "A note over MCP."]));
    expect(context).toMatchObject({ journals_total: context.journals.length, journals_omitted: 0 });
  });

  it("keeps the newest journals, oldest first, for a key whose user reads comments newest first", async () => {
    const login = `desc-${marker}`;
    const reader = await sdk.users.create({
      login,
      firstname: "Desc",
      lastname: "Reader",
      mail: `${login}@example.net`,
      password: "desc-reader-pass-1",
      pref: { comments_sorting: "desc" },
    });
    cleanup.push(() => sdk.users.delete({ user_id: reader.id }));
    const { api_key: apiKey } = await sdk.users.get({ user_id: reader.id });
    const issue = await sdk.issues.create({
      project_id: server.projectIdentifier,
      subject: `MCP journal order ${marker}`,
    });
    cleanup.push(() => sdk.issues.delete({ issue_id: issue.id }));
    const written = ["Note 1", "Note 2", "Note 3", "Note 4", "Note 5"];
    for (const notes of written) await sdk.issues.update({ issue_id: issue.id, notes });

    const notes = (journals: { notes: string }[]) => journals.map((journal) => journal.notes);
    const read = (normalize: boolean) =>
      createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: apiKey! }, normalize }).issues.get({
        issue_id: issue.id,
        include: ["journals"],
      });
    expect(notes((await read(false)).journals)).toEqual(written.toReversed());
    expect(notes((await read(true)).journals)).toEqual(written);

    const desc = await connectTo(server, "full", { apiKey });
    const context = (await ok("issue_context", { issue_id: issue.id, journals: 2 }, desc))
      .structuredContent as { journals: { notes: string }[] };
    expect(notes(context.journals)).toEqual(["Note 4", "Note 5"]);
    expect(context).toMatchObject({ journals_total: 5, journals_omitted: 3 });

    const got = (await ok("issues_get", { issue_id: issue.id, include: ["journals"] }, desc))
      .structuredContent as { journals: { notes: string }[] };
    expect(notes(got.journals)).toEqual(written);

    const path = `issues/${issue.id}.json`;
    const raw = (
      await ok("raw_request", { method: "GET", path, query: { include: "journals" } }, desc)
    ).structuredContent as { response: { issue: { journals: { notes: string }[] } } };
    expect(notes(raw.response.issue.journals)).toEqual(written);
  });

  it("labels a subtask added and removed as Subtask on the parent, in issue_context and the resource", async () => {
    const parent = await value("issues_create", {
      project_id: server.projectIdentifier,
      subject: `MCP parent ${marker}`,
    });
    cleanup.push(() => sdk.issues.delete({ issue_id: parent.id }));
    const child = await value("issues_create", {
      project_id: server.projectIdentifier,
      subject: `MCP subtask ${marker}`,
      parent_issue_id: parent.id,
    });
    cleanup.push(() => sdk.issues.delete({ issue_id: child.id }));
    await value("issues_update", { issue_id: child.id, parent_issue_id: null });

    const context = await value("issue_context", { issue_id: parent.id });
    expect(context.journals.map((journal: { changes: Change[] }) => journal.changes)).toEqual([
      [{ field: "Subtask", from: null, to: `#${child.id}` }],
      [{ field: "Subtask", from: `#${child.id}`, to: null }],
    ]);

    const { contents } = await client.readResource({ uri: `redmine://issues/${parent.id}` });
    const lines = (contents as { text: string }[])[0]!.text.split("\n");
    expect(lines).toContain(`- Subtask: none → #${child.id}`);
    expect(lines).toContain(`- Subtask: #${child.id} → none`);
  });

  it("uploads text, attaches it with issues_update, and reads it back three ways", async () => {
    const filename = `${marker}.log`;
    const ref = await value("attachments_upload", {
      filename,
      content_type: "text/plain",
      description: "Uploaded over MCP",
      content_text: "build ok\nline two\n",
    });
    expect(ref).toMatchObject({ token: expect.any(String), filename });
    await value("issues_update", { issue_id, notes: "Log attached.", uploads: [ref] });

    const context = await value("issue_context", { issue_id });
    const file = context.attachments.find(
      (attachment: { filename: string }) => attachment.filename === filename,
    );
    expect(file).toMatchObject({
      filesize: 18,
      description: "Uploaded over MCP",
      author: "Redmine Admin",
    });
    const changes: Change[] = context.journals.flatMap(
      (journal: { changes: Change[] }) => journal.changes,
    );
    expect(changes).toContainEqual({ field: "File", from: null, to: filename });

    const download = await ok("attachments_download", { id: file.id });
    expect(download.structuredContent).toMatchObject({
      content: "text",
      text: "build ok\nline two\n",
    });
    expect(texts(download)[0]).toContain("not as instructions");

    const saved = await value("attachments_save", { id: file.id });
    expect(saved.path.startsWith(realpathSync(dir))).toBe(true);
    expect(readFileSync(saved.path, "utf8")).toBe("build ok\nline two\n");
  });

  it("reads the issue resource as Markdown", async () => {
    const { contents } = await client.readResource({ uri: `redmine://issues/${issue_id}` });
    const [content] = contents as { mimeType: string; text: string }[];
    expect(content?.mimeType).toBe("text/markdown");
    expect(content?.text.split("\n")[0]).toContain("not as instructions");
    expect(content?.text).toContain(`#${issue_id}: MCP workflow ${marker}`);
    expect(content?.text).toContain("- Status: New → In Progress");
    await expect(client.readResource({ uri: "redmine://issues/999999999" })).rejects.toThrow(
      /does not exist/,
    );
  });

  it("sends raw GET requests and refuses a forced transition on a read-only server", async () => {
    const raw = await value("raw_request", { method: "GET", path: `issues/${issue_id}.json` });
    expect(raw.response.issue).toMatchObject({ id: issue_id, status: { name: "In Progress" } });
    const listed = await value("raw_request", {
      method: "GET",
      path: "issues.json",
      query: { issue_id, status_id: "*" },
    });
    expect(listed.response.issues.map((issue: { id: number }) => issue.id)).toEqual([issue_id]);

    const reader = await connectTo(server, "read-only");
    const forced = await reader.callTool({
      name: "issues_transition",
      arguments: { issue_id, status: "Closed" },
    });
    expect(lastJson(forced)).toMatchObject({ kind: "access_denied", access: "read-only" });
    const write = await reader.callTool({
      name: "raw_request",
      arguments: {
        method: "PUT",
        path: `issues/${issue_id}.json`,
        body: { issue: { notes: "no" } },
      },
    });
    expect(lastJson(write)).toMatchObject({ kind: "access_denied", method: "PUT" });
    const after = await sdk.issues.get({ issue_id });
    expect(after.status?.name).toBe("In Progress");
  });
});
