import { describe, expect, it } from "vite-plus/test";
import { lastJson, texts } from "../connect.ts";
import { callError, callOk, json, sent, serve } from "./harness.ts";
import type { Route } from "./harness.ts";

const SHORT = ["id", "project", "tracker", "status", "assigned_to", "subject", "updated_on"];

/** Hours as Redmine sends them from a float column. */
const NOISY = {
  estimated: 2.1600000262260437,
  spent: 1.3300000429153442,
  entry: 0.33000001311302185,
};

const ISSUE = {
  id: 1,
  project: { id: 1, name: "Web" },
  tracker: { id: 1, name: "Bug" },
  status: { id: 2, name: "In Progress", is_closed: false },
  priority: { id: 2, name: "Normal" },
  author: { id: 1, name: "Redmine Admin" },
  assigned_to: { id: 5, name: "Jane Doe" },
  fixed_version: { id: 3, name: "1.0" },
  subject: "Login fails",
  description: "Steps to reproduce",
  start_date: "2026-10-01",
  due_date: "2026-10-31",
  done_ratio: 30,
  is_private: false,
  estimated_hours: NOISY.estimated,
  total_estimated_hours: NOISY.estimated,
  spent_hours: NOISY.spent,
  total_spent_hours: NOISY.spent,
  custom_fields: [{ id: 3, name: "Severity", value: "S1" }],
  created_on: "2026-10-01T10:00:00Z",
  updated_on: "2026-10-02T10:00:00Z",
  closed_on: null,
};

const { assigned_to: _, ...UNASSIGNED } = { ...ISSUE, id: 2, subject: "Logout fails" };

const RELATIONS = [{ id: 10, issue_id: 1, issue_to_id: 2, relation_type: "blocks", delay: null }];

const ENTRY = {
  id: 9,
  project: { id: 1, name: "Web" },
  issue: { id: 1 },
  user: { id: 5, name: "Jane Doe" },
  activity: { id: 9, name: "Development" },
  hours: NOISY.entry,
  comments: "Code review",
  spent_on: "2026-10-02",
  created_on: "2026-10-02T10:00:00Z",
  updated_on: "2026-10-02T10:00:00Z",
};

const ROUTES: Record<string, Route> = {
  "GET /issues.json": ({ url }) => {
    const relations =
      url.searchParams.get("include") === "relations" ? { relations: RELATIONS } : {};
    return json({
      issues: [ISSUE, UNASSIGNED].map((issue) => ({ ...issue, ...relations })),
      total_count: 2,
      offset: 0,
      limit: 25,
    });
  },
  "GET /issues/1.json": () =>
    json({ issue: { ...ISSUE, journals: [], allowed_statuses: [], watchers: [] } }),
  "POST /issues.json": () => json({ issue: ISSUE }, 201),
  "GET /time_entries.json": () =>
    json({ time_entries: [ENTRY], total_count: 1, offset: 0, limit: 25 }),
  "GET /time_entries/9.json": () => json({ time_entry: ENTRY }),
  "POST /time_entries.json": () => json({ time_entry: ENTRY }, 201),
  "GET /projects/1/versions.json": () =>
    json({
      versions: [
        {
          id: 3,
          project: { id: 1, name: "Web" },
          name: "1.0",
          description: "",
          status: "open",
          due_date: null,
          sharing: "none",
          wiki_page_title: null,
          estimated_hours: NOISY.estimated,
          spent_hours: NOISY.spent,
          created_on: "2026-10-01T10:00:00Z",
          updated_on: "2026-10-01T10:00:00Z",
        },
      ],
      total_count: 1,
    }),
};

type Page = { items: Record<string, unknown>[] };

async function items(args: Record<string, unknown> = {}) {
  const { client, seen } = await serve(ROUTES);
  const result = await callOk(client, "issues_list", args);
  return { items: (result.structuredContent as Page).items, client, seen };
}

describe("issues_list items", () => {
  it("carry only id, project, tracker, status, assigned_to, subject and updated_on by default", async () => {
    const {
      items: [assigned, unassigned],
    } = await items();
    expect(Object.keys(assigned!)).toEqual(SHORT);
    expect(assigned).toEqual({
      id: 1,
      project: { id: 1, name: "Web" },
      tracker: { id: 1, name: "Bug" },
      status: { id: 2, name: "In Progress", is_closed: false },
      assigned_to: { id: 5, name: "Jane Doe" },
      subject: "Login fails",
      updated_on: "2026-10-02T10:00:00Z",
    });
    expect(Object.keys(unassigned!)).toEqual(SHORT.filter((key) => key !== "assigned_to"));
  });

  it("meet an outputSchema that requires only what every short item carries", async () => {
    const { client } = await serve(ROUTES);
    const tool = (await client.listTools()).tools.find(
      (candidate) => candidate.name === "issues_list",
    );
    const { items } = tool!.outputSchema!.properties as {
      items: { items: { required: string[] } };
    };
    expect(items.items.required.toSorted()).toEqual(
      SHORT.filter((key) => key !== "assigned_to").toSorted(),
    );
  });

  it("add the fields named in fields, in Redmine's order, with hours rounded", async () => {
    const {
      items: [item],
    } = await items({ fields: ["spent_hours", "due_date"] });
    expect(Object.keys(item!)).toEqual([
      "id",
      "project",
      "tracker",
      "status",
      "assigned_to",
      "subject",
      "due_date",
      "spent_hours",
      "updated_on",
    ]);
    expect(item).toMatchObject({ due_date: "2026-10-31", spent_hours: 1.33 });
  });

  it("add a long field such as description when fields names it", async () => {
    const {
      items: [item],
    } = await items({ fields: ["description"] });
    expect(item).toHaveProperty("description", "Steps to reproduce");
    expect(item).not.toHaveProperty("priority");
  });

  it("always keep id, whether or not fields names it", async () => {
    const {
      items: [named],
    } = await items({ fields: ["id"] });
    expect(Object.keys(named!)).toEqual(SHORT);
    const {
      items: [other],
    } = await items({ fields: ["priority"] });
    expect(other).toMatchObject({ id: 1, priority: { id: 2, name: "Normal" } });
  });

  it("carry what include names", async () => {
    const {
      items: [item],
      seen,
    } = await items({ include: ["relations"] });
    expect(item).toHaveProperty("relations", RELATIONS);
    expect(item).not.toHaveProperty("priority");
    expect(seen[0]!.url.searchParams.get("include")).toBe("relations");
  });

  it("ask Redmine for a field that comes only with include, when fields names it", async () => {
    const {
      items: [item],
      seen,
    } = await items({ fields: ["relations"] });
    expect(item).toHaveProperty("relations", RELATIONS);
    expect(seen[0]!.url.searchParams.get("include")).toBe("relations");
  });

  it("refuse a name in fields that is not an item field, before sending", async () => {
    const { client, seen } = await serve(ROUTES);
    const result = await callError(client, "issues_list", {
      fields: ["due_date", "dueDate", "notes", "dueDate"],
    });
    expect(texts(result)[0]).toBe(
      'Invalid input for issues_list: unknown item fields "dueDate", "notes" in fields, item fields: id, project, tracker, status, priority, author, assigned_to, category, fixed_version, parent, subject, description, start_date, due_date, done_ratio, is_private, estimated_hours, total_estimated_hours, spent_hours, total_spent_hours, custom_fields, created_on, updated_on, closed_on, attachments, relations. Nothing was sent.',
    );
    expect(lastJson(result)).toMatchObject({ kind: "invalid_input" });
    expect(seen).toEqual([]);
  });

  it("refuse fields that is not an array of names, before sending", async () => {
    const { client, seen } = await serve(ROUTES);
    const result = await callError(client, "issues_list", { fields: "due_date" });
    expect(texts(result)[0]).toContain("Invalid arguments for issues_list");
    expect(seen).toEqual([]);
  });

  it("carry every field with detailed: true, description included, with hours rounded", async () => {
    const {
      items: [item],
    } = await items({ detailed: true });
    expect(item).toEqual({
      ...ISSUE,
      estimated_hours: 2.16,
      total_estimated_hours: 2.16,
      spent_hours: 1.33,
      total_spent_hours: 1.33,
    });
  });

  it("are named in the tool description, with every field fields adds", async () => {
    const { client } = await serve(ROUTES);
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === "issues_list")!;
    expect(tool.description).toContain(
      "Items carry only id, project, tracker, status, assigned_to, subject, updated_on, and what include names. fields adds any of priority, author, category, fixed_version, parent, description, start_date, due_date, done_ratio, is_private, estimated_hours, total_estimated_hours, spent_hours, total_spent_hours, custom_fields, created_on, closed_on, attachments, relations. detailed: true returns every field.",
    );
    expect(tool.inputSchema.properties).toHaveProperty("fields", {
      type: "array",
      items: { type: "string" },
      description: expect.stringContaining("The tool description names them."),
    });
  });
});

describe("other list tools", () => {
  it("keep each field but the long ones, and take no fields", async () => {
    const { client, seen } = await serve(ROUTES);
    const result = await callOk(client, "time_entries_list", {});
    const [entry] = (result.structuredContent as Page).items;
    const { comments: _comments, ...rest } = ENTRY;
    expect(entry).toEqual({ ...rest, hours: 0.33 });
    const { tools } = await client.listTools();
    const input = tools.find((tool) => tool.name === "time_entries_list")!.inputSchema;
    expect(input.properties).not.toHaveProperty("fields");
    const refused = await callError(client, "time_entries_list", { fields: ["hours"] });
    expect(texts(refused)[0]).toContain("Invalid arguments for time_entries_list");
    expect(sent(seen)).toEqual(["GET /time_entries.json?offset=0&limit=25"]);
  });
});

describe("hours", () => {
  it("are rounded to two decimals in issues_get and issues_create", async () => {
    const { client } = await serve(ROUTES);
    for (const [name, args] of [
      ["issues_get", { issue_id: 1 }],
      ["issues_create", { project_id: 1, subject: "Login fails" }],
    ] as const) {
      const issue = (await callOk(client, name, args)).structuredContent;
      expect(issue, name).toMatchObject({
        estimated_hours: 2.16,
        total_estimated_hours: 2.16,
        spent_hours: 1.33,
        total_spent_hours: 1.33,
      });
    }
  });

  it("are rounded in issue_context and the issue resource", async () => {
    const { client } = await serve(ROUTES);
    const context = (await callOk(client, "issue_context", { issue_id: 1 })).structuredContent;
    expect(context).toMatchObject({
      issue: { estimated_hours: 2.16, total_estimated_hours: 2.16, spent_hours: 1.33 },
    });
    const { contents } = await client.readResource({ uri: "redmine://issues/1" });
    const [content] = contents as { text: string }[];
    expect(content!.text).toContain("- Estimated hours: 2.16\n- Spent hours: 1.33\n");
  });

  it("are rounded in the time entry tools", async () => {
    const { client } = await serve(ROUTES);
    for (const [name, args] of [
      ["time_entries_get", { time_entry_id: 9 }],
      ["time_entries_create", { issue_id: 1, hours: 0.33 }],
    ] as const) {
      expect((await callOk(client, name, args)).structuredContent, name).toMatchObject({
        hours: 0.33,
      });
    }
    const page = (await callOk(client, "time_entries_list", { detailed: true })).structuredContent;
    expect((page as Page).items).toEqual([{ ...ENTRY, hours: 0.33 }]);
  });

  it("are rounded in a version's estimated_hours and spent_hours", async () => {
    const { client } = await serve(ROUTES);
    const page = (await callOk(client, "versions_list", { project_id: 1 })).structuredContent;
    expect((page as Page).items[0]).toMatchObject({ estimated_hours: 2.16, spent_hours: 1.33 });
  });

  it("reach raw_request as Redmine sends them", async () => {
    const { client } = await serve(ROUTES);
    const result = await callOk(client, "raw_request", {
      method: "GET",
      path: "time_entries/9.json",
    });
    expect(result.structuredContent).toEqual({ response: { time_entry: ENTRY } });
  });
});
