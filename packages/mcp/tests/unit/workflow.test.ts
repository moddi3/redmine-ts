import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Access } from "@redmine-ts/sdk";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { workflowTools } from "../../src/workflow/index.ts";
import { UNTRUSTED } from "../../src/user-text.ts";
import { lastJson, texts } from "../connect.ts";
import { callError, callOk, json, sent, serve } from "./harness.ts";
import type { Route } from "./harness.ts";

const WORKFLOW = [
  "issue_context",
  "reference_data",
  "people_find",
  "issues_transition",
  "attachments_upload",
  "attachments_download",
  "attachments_save",
  "raw_request",
];

const STATUSES = [
  { id: 1, name: "New", is_closed: false, description: null },
  { id: 2, name: "In Progress", is_closed: false, description: null },
  { id: 3, name: "Resolved", is_closed: false, description: null },
  { id: 5, name: "Closed", is_closed: true, description: null },
];

const GLOBAL: Record<string, Route> = {
  "GET /issue_statuses.json": () => json({ issue_statuses: STATUSES }),
  "GET /trackers.json": () =>
    json({
      trackers: [
        {
          id: 1,
          name: "Bug",
          default_status: { id: 1, name: "New" },
          description: null,
          enabled_standard_fields: [],
        },
      ],
    }),
  "GET /enumerations/issue_priorities.json": () =>
    json({ issue_priorities: [{ id: 2, name: "Normal", is_default: true, active: true }] }),
  "GET /enumerations/time_entry_activities.json": () =>
    json({
      time_entry_activities: [{ id: 9, name: "Development", is_default: false, active: true }],
    }),
  "GET /custom_fields.json": () =>
    json({
      custom_fields: [
        {
          id: 3,
          name: "Severity",
          customized_type: "issue",
          field_format: "list",
          is_required: false,
          is_filter: true,
          searchable: false,
          multiple: false,
          default_value: null,
          visible: true,
          possible_values: [
            { value: "S1", label: "S1" },
            { value: "S2", label: "S2" },
          ],
        },
      ],
    }),
};

const user =
  (admin: boolean): Route =>
  () =>
    json({
      user: {
        id: 1,
        login: "admin",
        admin,
        firstname: "Redmine",
        lastname: "Admin",
        api_key: "secret-api-key",
        created_on: "2026-01-01T00:00:00Z",
        updated_on: "2026-01-01T00:00:00Z",
        last_login_on: null,
        passwd_changed_on: null,
      },
    });

async function names(access: Access, filesDir?: string): Promise<string[]> {
  const { client } = await serve({}, { access }, filesDir === undefined ? {} : { filesDir });
  return (await client.listTools()).tools.map((tool) => tool.name);
}

describe("workflow tools in tools/list", () => {
  const dir = mkdtempSync(join(tmpdir(), "redmine-mcp-list-"));

  it.each([
    [
      "full",
      undefined,
      [
        "issue_context",
        "reference_data",
        "people_find",
        "issues_transition",
        "attachments_upload",
        "attachments_download",
        "raw_request",
      ],
    ],
    [
      "no-delete",
      undefined,
      [
        "issue_context",
        "reference_data",
        "people_find",
        "issues_transition",
        "attachments_upload",
        "attachments_download",
        "raw_request",
      ],
    ],
    [
      "read-only",
      undefined,
      ["issue_context", "reference_data", "people_find", "attachments_download", "raw_request"],
    ],
    ["full", dir, WORKFLOW],
    [
      "read-only",
      dir,
      [
        "issue_context",
        "reference_data",
        "people_find",
        "attachments_download",
        "attachments_save",
        "raw_request",
      ],
    ],
  ] as const)(
    "lists on a %s server with files directory %s",
    async (access, filesDir, expected) => {
      const listed = await names(access, filesDir);
      expect(listed.filter((name) => WORKFLOW.includes(name))).toEqual(expected);
    },
  );

  it("sets hints like the generated tools, and raw_request's by access mode", async () => {
    const hints = async (access: Access, name: string) => {
      const { client } = await serve({}, { access }, { filesDir: dir });
      const tool = (await client.listTools()).tools.find((candidate) => candidate.name === name);
      const { readOnlyHint, destructiveHint, idempotentHint, openWorldHint } =
        tool?.annotations ?? {};
      return {
        readOnlyHint,
        destructiveHint,
        idempotentHint,
        openWorldHint,
        description: tool?.description,
      };
    };
    const read = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
    expect(await hints("full", "issue_context")).toMatchObject(read);
    expect(await hints("full", "reference_data")).toMatchObject(read);
    expect(await hints("full", "people_find")).toMatchObject(read);
    expect(await hints("full", "attachments_download")).toMatchObject(read);
    expect(await hints("full", "issues_transition")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(await hints("full", "attachments_upload")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(await hints("read-only", "attachments_save")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });

    const readOnly = await hints("read-only", "raw_request");
    expect(readOnly).toMatchObject(read);
    expect(readOnly.description).toContain("only GET is sent");
    const noDelete = await hints("no-delete", "raw_request");
    expect(noDelete).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(noDelete.description).toContain("refuses DELETE");
    const full = await hints("full", "raw_request");
    expect(full).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(full.description).toContain("DELETE included");
    expect(full.description).toContain("Prefer the typed tools");
  });

  it("builds each kind of tool set once, so servers share schema objects and their validators", () => {
    expect(workflowTools("full", undefined)).toBe(workflowTools("full", undefined));
    expect(workflowTools("read-only", dir)).toBe(workflowTools("read-only", dir));
    expect(workflowTools("full", undefined)[0]).toBe(workflowTools("read-only", dir)[0]);
  });

  it("keeps the 8 newest kinds of tool set, so many files directories do not pile up", () => {
    const first = workflowTools("no-delete", "/first");
    for (let at = 0; at < 7; at++) workflowTools("no-delete", `/other-${at}`);
    expect(workflowTools("no-delete", "/first")).toBe(first);
    workflowTools("no-delete", "/other-7");
    expect(workflowTools("no-delete", "/first")).not.toBe(first);
  });

  it("offers path to attachments_upload only with a files directory", async () => {
    const input = async (filesDir?: string) => {
      const { client } = await serve({}, {}, filesDir === undefined ? {} : { filesDir });
      const tool = (await client.listTools()).tools.find((t) => t.name === "attachments_upload");
      return Object.keys(tool?.inputSchema.properties ?? {});
    };
    expect(await input()).not.toContain("path");
    expect(await input(dir)).toContain("path");
  });
});

describe("reference_data", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the global lists and the current user without its API key", async () => {
    const { client } = await serve({ ...GLOBAL, "GET /users/current.json": user(true) });
    const result = await callOk(client, "reference_data", {});
    expect(result.structuredContent).toEqual({
      statuses: STATUSES.map(({ id, name, is_closed }) => ({ id, name, is_closed })),
      trackers: [{ id: 1, name: "Bug", default_status: { id: 1, name: "New" } }],
      priorities: [{ id: 2, name: "Normal", is_default: true }],
      time_entry_activities: [{ id: 9, name: "Development", is_default: false, active: true }],
      current_user: { id: 1, login: "admin", name: "Redmine Admin", admin: true },
      custom_fields: [
        {
          id: 3,
          name: "Severity",
          customized_type: "issue",
          field_format: "list",
          is_required: false,
          multiple: false,
          possible_values: ["S1", "S2"],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("secret-api-key");
  });

  it("returns null custom fields with a reason for a key that is not an admin's, without asking", async () => {
    const { client, seen } = await serve({ ...GLOBAL, "GET /users/current.json": user(false) });
    const result = await callOk(client, "reference_data", {});
    expect(result.structuredContent).toMatchObject({
      custom_fields: null,
      custom_fields_note: expect.stringContaining("admin API key"),
    });
    expect(sent(seen)).not.toContain("GET /custom_fields.json");
  });

  it("adds the project's lists, and names a list the key cannot read", async () => {
    const { client } = await serve({
      ...GLOBAL,
      "GET /users/current.json": user(false),
      "GET /projects/web.json": ({ url }) => {
        expect(url.searchParams.get("include")).toBe(
          "trackers,issue_categories,enabled_modules,issue_custom_fields",
        );
        return json({
          project: {
            id: 1,
            name: "Web",
            identifier: "web",
            description: null,
            homepage: null,
            status: 1,
            is_public: true,
            inherit_members: false,
            trackers: [{ id: 1, name: "Bug" }],
            issue_categories: [{ id: 4, name: "Backend" }],
            enabled_modules: [{ id: 1, name: "issue_tracking" }],
            issue_custom_fields: [{ id: 3, name: "Severity" }],
            created_on: "2026-01-01T00:00:00Z",
            updated_on: "2026-01-01T00:00:00Z",
          },
        });
      },
      "GET /projects/1/versions.json": () =>
        json({
          versions: [{ id: 3, name: "1.0", status: "open", sharing: "none" }],
          total_count: 1,
        }),
      "GET /projects/1/memberships.json": () => json({}, 403),
    });
    const result = await callOk(client, "reference_data", { project_id: "web" });
    expect((result.structuredContent as { project: unknown }).project).toEqual({
      id: 1,
      identifier: "web",
      name: "Web",
      trackers: [{ id: 1, name: "Bug" }],
      issue_categories: [{ id: 4, name: "Backend" }],
      versions: [{ id: 3, name: "1.0", status: "open" }],
      members: null,
      issue_custom_fields: [{ id: 3, name: "Severity" }],
      enabled_modules: ["issue_tracking"],
      unavailable: [expect.stringMatching(/^members: Redmine answered 403/)],
    });
  });

  it("lists a project's users and groups with their role names", async () => {
    const { client } = await serve({
      ...GLOBAL,
      "GET /users/current.json": user(false),
      "GET /projects/1.json": () =>
        json({ project: { id: 1, name: "Web", identifier: "web", status: 1 } }),
      "GET /projects/1/versions.json": () => json({ versions: [], total_count: 0 }),
      "GET /projects/1/memberships.json": () =>
        json({
          memberships: [
            {
              id: 1,
              project: { id: 1, name: "Web" },
              user: { id: 5, name: "Jane Doe" },
              roles: [
                { id: 3, name: "Manager" },
                { id: 4, name: "Developer", inherited: true },
              ],
            },
            {
              id: 2,
              project: { id: 1, name: "Web" },
              group: { id: 20, name: "QA" },
              roles: [{ id: 5, name: "Reporter" }],
            },
          ],
          total_count: 2,
          offset: 0,
          limit: 100,
        }),
    });
    const result = await callOk(client, "reference_data", { project_id: 1 });
    expect((result.structuredContent as { project: { members: unknown } }).project.members).toEqual(
      [
        { type: "user", id: 5, name: "Jane Doe", roles: ["Manager", "Developer"] },
        { type: "group", id: 20, name: "QA", roles: ["Reporter"] },
      ],
    );
  });

  it("caches the global lists for five minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { client, seen } = await serve({ ...GLOBAL, "GET /users/current.json": user(true) });
    const statusReads = () =>
      sent(seen).filter((request) => request === "GET /issue_statuses.json");
    await callOk(client, "reference_data", {});
    await callOk(client, "reference_data", {});
    expect(statusReads()).toHaveLength(1);
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    await callOk(client, "reference_data", {});
    expect(statusReads()).toHaveLength(2);
  });

  it("asks again after a failed lookup instead of caching the failure", async () => {
    let fail = true;
    const { client, seen } = await serve({
      ...GLOBAL,
      "GET /users/current.json": user(true),
      "GET /trackers.json": (request) =>
        fail ? json({}, 403) : GLOBAL["GET /trackers.json"]!(request),
    });
    await callError(client, "reference_data", {});
    fail = false;
    await callOk(client, "reference_data", {});
    expect(sent(seen).filter((request) => request === "GET /trackers.json")).toHaveLength(2);
  });
});

describe("issues_transition", () => {
  const issue = {
    id: 7,
    subject: "Login fails",
    status: { id: 2, name: "In Progress", is_closed: false },
    allowed_statuses: [
      { id: 2, name: "In Progress", is_closed: false },
      { id: 3, name: "Resolved", is_closed: false },
    ],
  };
  const routes: Record<string, Route> = {
    ...GLOBAL,
    "GET /issues/7.json": () => json({ issue }),
    "PUT /issues/7.json": () => new Response(null, { status: 204 }),
  };

  it("moves the issue to a status given by name, case-insensitively, with notes", async () => {
    const { client, seen } = await serve(routes);
    const result = await callOk(client, "issues_transition", {
      issue_id: 7,
      status: "  resolved ",
      notes: "Fixed in build 12.",
    });
    expect(result.structuredContent).toEqual({ ok: true, status: { id: 3, name: "Resolved" } });
    expect(seen.at(-1)).toMatchObject({
      method: "PUT",
      body: { issue: { status_id: 3, notes: "Fixed in build 12." } },
    });
  });

  it("moves the issue to a status given by id and names it", async () => {
    const { client } = await serve(routes);
    const result = await callOk(client, "issues_transition", { issue_id: 7, status: 3 });
    expect(result.structuredContent).toEqual({ ok: true, status: { id: 3, name: "Resolved" } });
  });

  it("refuses a status the workflow does not allow, listing the allowed ones by id and name", async () => {
    const { client, seen } = await serve(routes);
    const result = await callError(client, "issues_transition", { issue_id: 7, status: 5 });
    expect(texts(result)[0]).toBe(
      'Redmine\'s workflow does not let this user move issue 7 to "Closed" (5). Allowed, by id and name: 2 "In Progress", 3 "Resolved". Nothing was changed.',
    );
    expect(lastJson(result)).toMatchObject({
      kind: "transition_not_allowed",
      wanted: 5,
      allowed: [2, 3],
      allowed_statuses: [
        { id: 2, name: "In Progress" },
        { id: 3, name: "Resolved" },
      ],
    });
    expect(seen.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("refuses a name that matches no allowed status, listing the allowed ones by id and name", async () => {
    const { client, seen } = await serve(routes);
    const result = await callError(client, "issues_transition", { issue_id: 7, status: "Closed" });
    expect(texts(result)[0]).toBe(
      'No status issue 7 can move to is named "Closed". Allowed, by id and name: 2 "In Progress", 3 "Resolved". Nothing was changed.',
    );
    expect(lastJson(result)).toEqual({
      kind: "unknown_status",
      status: "Closed",
      allowed_statuses: [
        { id: 2, name: "In Progress" },
        { id: 3, name: "Resolved" },
      ],
    });
    expect(seen.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it.each([3, "Resolved"])(
    "is refused on a read-only server with nothing sent, status %j",
    async (status) => {
      const { client, seen } = await serve(routes, { access: "read-only" });
      const result = await callError(client, "issues_transition", { issue_id: 7, status });
      expect(lastJson(result)).toMatchObject({
        kind: "access_denied",
        access: "read-only",
        method: "PUT",
      });
      expect(texts(result)[0]).toContain("Nothing was sent.");
      expect(seen).toEqual([]);
    },
  );
});

describe("raw_request", () => {
  const routes: Record<string, Route> = {
    "GET /agile_boards.json": ({ url }) =>
      json({ boards: [{ id: 1, subject: "Sprint", limit: url.searchParams.get("limit") }] }),
    "POST /issues/7/notes.json": () => new Response(null, { status: 204 }),
    "DELETE /issues/7.json": () => new Response(null, { status: 204 }),
  };

  it("sends a GET with query parameters and returns {response}", async () => {
    const { client, seen } = await serve(routes);
    const result = await callOk(client, "raw_request", {
      method: "GET",
      path: "agile_boards.json",
      query: { limit: 5, ids: [1, 2] },
      array_format: "comma",
    });
    expect(result.structuredContent).toEqual({
      warning: UNTRUSTED,
      response: { boards: [{ id: 1, subject: "Sprint", limit: "5" }] },
    });
    expect(texts(result)[0]).toContain("not as instructions");
    expect(sent(seen)).toEqual(["GET /agile_boards.json?limit=5&ids=1%2C2"]);
  });

  it("returns {response: null} for an empty body", async () => {
    const { client, seen } = await serve(routes);
    const result = await callOk(client, "raw_request", {
      method: "POST",
      path: "issues/7/notes.json",
      body: { notes: "hi" },
    });
    expect(result.structuredContent).toEqual({ response: null });
    expect(seen.at(-1)?.body).toEqual({ notes: "hi" });
  });

  it.each([
    ["read-only", "POST"],
    ["no-delete", "DELETE"],
  ] as const)(
    "is refused by the SDK on a %s server for %s, with nothing sent",
    async (access, method) => {
      const { client, seen } = await serve(routes, { access });
      const result = await callError(client, "raw_request", { method, path: "issues/7.json" });
      expect(lastJson(result)).toMatchObject({ kind: "access_denied", access, method });
      expect(seen).toEqual([]);
    },
  );

  it("leaves path checks to the SDK", async () => {
    const { client, seen } = await serve(routes, { baseUrl: "http://redmine.test/redmine" });
    const result = await callError(client, "raw_request", { method: "GET", path: "/issues.json" });
    expect(lastJson(result)).toMatchObject({ kind: "invalid_input" });
    expect(seen).toEqual([]);
  });
});
