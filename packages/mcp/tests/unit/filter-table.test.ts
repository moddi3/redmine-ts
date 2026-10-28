import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Tool } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vite-plus/test";
import { catalogTools } from "../../src/catalog-tools.ts";
import type { Schema } from "../../src/tools.ts";
import { connect, texts } from "../connect.ts";

/** Codex strips every description from an input schema over this many bytes of compact JSON. */
const CODEX_LIMIT = 5_000;

const LISTS = ["issues_list", "time_entries_list", "users_list", "projects_list"];

/** Every condition form a filter can take, for checking that the listed condition is looser. */
const FORMS: readonly unknown[] = [
  1,
  "a",
  [1, "a"],
  { not: 1 },
  { not: [1, 2] },
  { gte: "2026-10-01" },
  { lte: 5 },
  { between: [1, 10] },
  { contains: "crash" },
  { not_contains: "crash" },
  { starts_with: "crash" },
  { ends_with: "crash" },
  { any: true },
  { none: true },
  { raw: "<t-30" },
];

async function listed(access: "full" | "no-delete" | "read-only" = "full") {
  const sent: Request[] = [];
  const client = await connect(
    {
      baseUrl: "http://redmine.test",
      auth: { apiKey: "test-key" },
      access,
      fetch: async (input, init) => {
        sent.push(new Request(input, init));
        return Response.json({ issues: [], total_count: 0, offset: 0, limit: 25 });
      },
    },
    { filesDir: mkdtempSync(join(tmpdir(), "redmine-mcp-table-")) },
  );
  return { client, sent, tools: (await client.listTools()).tools };
}

function where(tools: readonly Tool[], name: string): Schema {
  return tools.find((tool) => tool.name === name)?.inputSchema.properties?.where as Schema;
}

/** Each filter in the table with the operators of the heading above it. */
function table(description: string): { legend: string; rows: Map<string, [string, string[]]> } {
  const [legend = "", ...lines] = description.split("\n");
  const rows = new Map<string, [string, string[]]>();
  let operators: string[] = [];
  for (const line of lines) {
    const heading = /^Takes (.+):$/.exec(line);
    if (heading) {
      operators = heading[1]!.split(", ");
      continue;
    }
    const name = line.split(" | ")[0]!;
    expect(rows.has(name), `${name} is listed twice`).toBe(false);
    rows.set(name, [line, operators]);
  }
  return { legend, rows };
}

/** The filters the input schema that checks calls accepts, with their operators besides raw. */
function accepted(name: string): Map<string, string[]> {
  const filters = catalogTools.find((tool) => tool.name === name)!.inputSchema.properties!.where!;
  const patterns = Object.entries(filters.patternProperties ?? {});
  expect(patterns.map(([pattern]) => pattern)).toEqual(patterns.length === 0 ? [] : ["^cf_\\d+$"]);
  return new Map(
    [
      ...Object.entries(filters.properties ?? {}),
      ...patterns.map(([, filter]) => ["cf_<id>", filter] as const),
    ].map(([key, filter]) => {
      const forms = (filter.anyOf ?? []).flatMap((form) => form.required ?? []);
      expect(forms, `${key} takes raw`).toContain("raw");
      return [key, forms.filter((form) => form !== "raw")];
    }),
  );
}

describe("the filter table in where", () => {
  it("replaces the schema per filter in each tool that takes where", async () => {
    const { tools } = await listed();
    const strict = catalogTools.filter((tool) => tool.inputSchema.properties?.where !== undefined);
    expect(strict.map((tool) => tool.name).toSorted()).toEqual(LISTS.toSorted());
    for (const name of LISTS) {
      expect(Object.keys(where(tools, name)).toSorted(), name).toEqual([
        "additionalProperties",
        "description",
        "type",
      ]);
    }
  });

  it.each(LISTS)(
    "lists every filter and operator of %s that calls accept, and nothing else",
    async (name) => {
      const { tools } = await listed();
      const { legend, rows } = table(where(tools, name).description!);
      const strict = accepted(name);
      expect(new Map([...rows].map(([key, [, operators]]) => [key, operators]))).toEqual(strict);
      const used = new Set([...strict.values()].flat());
      const forms = [...legend.matchAll(/\{(\w+):/g)].map((match) => match[1]!);
      expect(forms.toSorted()).toEqual([...used, "raw"].toSorted());
    },
  );

  it("gives each filter's value and what it filters", async () => {
    const { tools } = await listed();
    const { legend, rows } = table(where(tools, "issues_list").description!);
    const row = (name: string) => rows.get(name)?.[0];
    expect(legend).toContain("Dates are YYYY-MM-DD.");
    expect(legend).toContain('{between: [from, to]}, {contains: "text"}');
    expect(row("status_id")).toBe("status_id | id, `open`, `closed`, `any` | issue status");
    expect(row("tracker_id")).toBe("tracker_id | id");
    expect(row("created_on")).toBe("created_on | date | creation date");
    expect(row("estimated_hours")).toBe("estimated_hours | number");
    expect(row("subject")).toBe("subject | text");
    expect(row("is_private")).toBe(
      "is_private | `1` for private, `0` for not private | private flag",
    );
    expect(row("assigned_to_id")).toBe("assigned_to_id | id, `me` for current user | assignee");
    expect(row("duplicated")).toBe('duplicated |  | "duplicated by" relation');
    expect(row("project_id")).toContain(
      "id, `mine` for projects where current user is a member, `bookmarks` for bookmarked projects | project. One id or identifier also matches subprojects",
    );
    expect(row("cf_<id>")).toContain("`cf_12`");
    const users = table(where(tools, "users_list").description!).rows;
    expect(users.get("login")?.[0]).toBe("login | text");
  });

  it("advertises one condition that accepts every form a filter accepts", async () => {
    const { tools } = await listed();
    const ajv = new Ajv2020({ strict: true });
    for (const name of LISTS) {
      const condition = ajv.compile(where(tools, name).additionalProperties as Schema);
      const strictWhere = catalogTools.find((tool) => tool.name === name)!.inputSchema.properties!
        .where!;
      for (const [key, filter] of Object.entries({
        ...strictWhere.properties,
        ...strictWhere.patternProperties,
      })) {
        const strict = ajv.compile(filter);
        const taken = FORMS.filter((form) => strict(form));
        expect(taken.length, key).toBeGreaterThan(2);
        for (const form of taken) expect(condition(form), `${name} ${key}`).toBe(true);
      }
    }
  });
});

describe("listed input schemas", () => {
  it.each(["full", "no-delete", "read-only"] as const)(
    "stay under 5,000 bytes without $ref for every tool in %s access, files directory included",
    async (access) => {
      const { tools } = await listed(access);
      expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(LISTS));
      for (const tool of tools) {
        const json = JSON.stringify(tool.inputSchema);
        expect(new TextEncoder().encode(json).length, tool.name).toBeLessThan(CODEX_LIMIT);
        // Zed inlines $ref again, Codex drops $defs when it compacts, and Gemini may refuse both.
        expect(json, tool.name).not.toMatch(/"\$(ref|defs)"/);
      }
    },
  );
});

describe("calls with where", () => {
  it("are still checked against each filter's own forms, before sending", async () => {
    const { client, sent } = await listed();
    const refuse = async (filters: Record<string, unknown>) =>
      texts(await client.callTool({ name: "issues_list", arguments: { where: filters } }))[0];
    expect(await refuse({ assigned_to_id: { gte: 3 } })).toBe(
      'Invalid arguments for issues_list: where.assigned_to_id does not take that form. Filter by assignee. Accepts a value, an array meaning any of them, or one of {not: value or array}, {any: true} for any value set, {none: true} for no value, {raw: "..."} in Redmine\'s own syntax, such as a relative date. Special values: `me` (current user). Nothing was sent.',
    );
    expect(await refuse({ cf_12: { between: [1] } })).toContain(
      "where.cf_12 does not take that form. Custom field filter by id",
    );
    expect(await refuse({ status_id: [] })).toContain(
      'where.status_id does not take that form. Filter by issue status. Accepts a value, an array meaning any of them, or one of {not: value or array}, {any: true} for any value set, {raw: "..."} in Redmine\'s own syntax, such as a relative date. Also "open", "closed", "any".',
    );
    expect(await refuse({ state: "open" })).toMatch(
      /^Invalid arguments for issues_list: unknown filter "state", known filters: issue_id, project_id, .*, cf_<id>\. Nothing was sent\.$/,
    );
    expect(sent).toEqual([]);
  });

  it("send a filter the table lists, custom fields included", async () => {
    const { client, sent } = await listed();
    const result = await client.callTool({
      name: "issues_list",
      arguments: {
        where: { cf_12: { gte: 5 }, updated_on: { between: ["2026-10-01", "2026-10-31"] } },
      },
    });
    expect(result.isError).toBeFalsy();
    const query = new URL(sent.at(-1)!.url).searchParams;
    expect(query.get("cf_12")).toBe(">=5");
    expect(query.get("updated_on")).toBe("><2026-10-01|2026-10-31");
  });
});
