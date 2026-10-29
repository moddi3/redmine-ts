import { describe, expect, it } from "vite-plus/test";
import { createRedmineMcpServer } from "../../src/index.ts";
import { lastJson } from "../connect.ts";
import { callOk, json, serve } from "./harness.ts";
import type { Route } from "./harness.ts";

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

function issue(id: number, subject: string) {
  return {
    id,
    project: { id: 1, name: "Web" },
    tracker: { id: 1, name: "Bug" },
    status: { id: 1, name: "New", is_closed: false },
    priority: { id: 2, name: "Normal" },
    author: { id: 1, name: "Redmine Admin" },
    subject,
    description: "Steps to reproduce",
    start_date: null,
    due_date: null,
    done_ratio: 0,
    is_private: false,
    estimated_hours: null,
    total_estimated_hours: null,
    created_on: "2026-10-01T10:00:00Z",
    updated_on: "2026-10-02T10:00:00Z",
    closed_on: null,
  };
}

/** GET /issues.json paging `issues` by offset and limit, as Redmine does. */
function issues(list: readonly ReturnType<typeof issue>[]): Record<string, Route> {
  return {
    "GET /issues.json": ({ url }) => {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 25);
      return json({
        issues: list.slice(offset, offset + limit),
        total_count: list.length,
        offset,
        limit,
      });
    },
  };
}

interface Page {
  items: { id: number; subject: string }[];
  total_count: number;
  offset: number;
  limit: number;
  next_offset: number | null;
}

const TWENTY = Array.from({ length: 20 }, (_, n) =>
  issue(n + 1, `Issue ${n + 1} ${"x".repeat(300)}`),
);

describe("a list page under the result budget", () => {
  it("stops before the item that would pass the budget, with next_offset at it, and pages on to the last", async () => {
    const { client } = await serve(issues(TWENTY), {}, { maxResultBytes: 2_000 });
    // The outputSchema is checked once; compiling it for every page takes seconds.
    await callOk(client, "issues_list", { limit: 20 });
    const pages: Page[] = [];
    let offset: number | null = 0;
    // Each page holds an item, so 20 pages reach the end.
    while (offset !== null && pages.length < 20) {
      const result = await client.callTool({
        name: "issues_list",
        arguments: { limit: 20, offset },
      });
      const page = result.structuredContent as unknown as Page;
      // The text block carries the same JSON that is measured.
      expect(lastJson(result)).toEqual(page);
      pages.push(page);
      offset = page.next_offset;
    }
    expect(offset).toBeNull();
    expect(pages.length).toBeGreaterThan(2);
    pages.forEach((page, at) => {
      expect(bytes(page)).toBeLessThanOrEqual(2_000);
      expect(page.items.length).toBeGreaterThan(0);
      const start = at === 0 ? 0 : pages[at - 1]!.next_offset!;
      expect(page).toMatchObject({ total_count: 20, offset: start, limit: 20 });
      const end = start + page.items.length;
      const next = pages[at + 1];
      if (next === undefined) {
        expect(end).toBe(20);
        expect(page.next_offset).toBeNull();
        return;
      }
      expect(page.next_offset).toBe(end);
      // The first item left out would have taken the page over the budget.
      const grown = { ...page, items: [...page.items, next.items[0]], next_offset: end + 1 };
      expect(bytes(grown)).toBeGreaterThan(2_000);
    });
    const seen = pages.flatMap((page) => page.items.map((item) => item.id));
    expect(seen).toEqual(TWENTY.map((item) => item.id));
  });

  it("keeps one item that alone passes the budget, so next_offset still moves on", async () => {
    const list = [issue(1, "Short"), issue(2, "y".repeat(3_000)), issue(3, "Short")];
    const { client } = await serve(issues(list), {}, { maxResultBytes: 1_000 });
    const first = (await callOk(client, "issues_list", {})).structuredContent as unknown as Page;
    expect(first.items.map((item) => item.id)).toEqual([1]);
    expect(first.next_offset).toBe(1);
    const alone = (await callOk(client, "issues_list", { offset: 1 }))
      .structuredContent as unknown as Page;
    expect(alone.items.map((item) => item.id)).toEqual([2]);
    expect(alone.next_offset).toBe(2);
    expect(bytes(alone)).toBeGreaterThan(1_000);
  });

  it("counts UTF-8 bytes, so Cyrillic text fills a page sooner than its characters would", async () => {
    const list = Array.from({ length: 10 }, (_, n) =>
      issue(n + 1, `Задача ${n + 1} ${"ж".repeat(200)}`),
    );
    const { client } = await serve(issues(list), {}, { maxResultBytes: 2_000 });
    const page = (await callOk(client, "issues_list", { limit: 10 }))
      .structuredContent as unknown as Page;
    const next = (await callOk(client, "issues_list", { limit: 1, offset: page.items.length }))
      .structuredContent as unknown as Page;
    const grown = {
      ...page,
      items: [...page.items, ...next.items],
      next_offset: page.items.length + 1,
    };
    expect(bytes(page)).toBeLessThanOrEqual(2_000);
    // One more item would fit in 2,000 characters, but not in 2,000 bytes.
    expect(JSON.stringify(grown).length).toBeLessThanOrEqual(2_000);
    expect(bytes(grown)).toBeGreaterThan(2_000);
  });

  it("measures the page as it is sent, with the API key hidden", async () => {
    const key = "k".repeat(500);
    const list = Array.from({ length: 5 }, (_, n) => issue(n + 1, `Pasted ${key} by mistake`));
    const { client } = await serve(
      issues(list),
      { auth: { apiKey: key } },
      { maxResultBytes: 3_000 },
    );
    const page = (await callOk(client, "issues_list", {})).structuredContent as unknown as Page;
    expect(page.items).toHaveLength(5);
    expect(page.next_offset).toBeNull();
    expect(page.items[0]!.subject).toBe("Pasted [hidden by @redmine-ts/mcp] by mistake");
    const revealed = JSON.stringify(page).replaceAll("[hidden by @redmine-ts/mcp]", key);
    expect(new TextEncoder().encode(revealed).length).toBeGreaterThan(3_000);
  });

  it("cuts lists that Redmine returns whole the same way", async () => {
    const statuses = Array.from({ length: 30 }, (_, n) => ({
      id: n + 1,
      name: `Status ${n + 1} ${"s".repeat(100)}`,
      is_closed: false,
      description: null,
    }));
    const { client } = await serve(
      { "GET /issue_statuses.json": () => json({ issue_statuses: statuses }) },
      {},
      { maxResultBytes: 1_000 },
    );
    const page = (await callOk(client, "issue_statuses_list", { limit: 30, offset: 2 }))
      .structuredContent as unknown as Page;
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThan(28);
    expect(page.items[0]!.id).toBe(3);
    expect(page.next_offset).toBe(2 + page.items.length);
    expect(bytes(page)).toBeLessThanOrEqual(1_000);
  });
});

describe("the result budget setting", () => {
  it("is 32,000 bytes by default, and the instructions say so", async () => {
    const list = Array.from({ length: 100 }, (_, n) => issue(n + 1, "x".repeat(500)));
    const { client } = await serve(issues(list));
    expect(client.getInstructions()).toContain("would pass 32,000 bytes");
    const page = (await callOk(client, "issues_list", { limit: 100 }))
      .structuredContent as unknown as Page;
    expect(page.items.length).toBeLessThan(100);
    expect(bytes(page)).toBeLessThanOrEqual(32_000);
    expect(page.next_offset).toBe(page.items.length);
  });

  it("takes maxResultBytes, and refuses a budget under 1,000 bytes or not a whole number", async () => {
    const { client } = await serve(issues(TWENTY), {}, { maxResultBytes: 60_000 });
    expect(client.getInstructions()).toContain("would pass 60,000 bytes");
    const config = { baseUrl: "http://redmine.test", auth: { apiKey: "test-key" } };
    for (const maxResultBytes of [999, 1_500.5, 0, -1]) {
      expect(() => createRedmineMcpServer(config, { maxResultBytes })).toThrow(
        "maxResultBytes must be an integer of at least 1000",
      );
    }
    expect(() => createRedmineMcpServer(config, { maxResultBytes: 1_000 })).not.toThrow();
  });
});

describe("anthropic/maxResultSizeChars", () => {
  async function meta(maxResultBytes?: number) {
    const { client } = await serve({}, {}, { maxResultBytes });
    const { tools } = await client.listTools();
    const budgeted = tools.filter(
      (tool) =>
        tool.name === "issue_context" ||
        Object.hasOwn(tool.outputSchema?.properties ?? {}, "next_offset"),
    );
    return { tools, budgeted };
  }

  it("is left out while Claude Code keeps a result at the budget inline anyway", async () => {
    for (const maxResultBytes of [undefined, 32_000, 49_000]) {
      const { tools } = await meta(maxResultBytes);
      expect(tools.filter((tool) => tool._meta !== undefined)).toEqual([]);
    }
  });

  it("raises Claude Code's limit to the budget plus 1,000 characters on list tools and issue_context only", async () => {
    for (const [maxResultBytes, chars] of [
      [49_001, 50_001],
      [60_000, 61_000],
      [600_000, 500_000],
    ] as const) {
      const { tools, budgeted } = await meta(maxResultBytes);
      expect(budgeted.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(["issue_context", "issues_list", "time_entries_list"]),
      );
      for (const tool of tools) {
        expect(tool._meta, tool.name).toEqual(
          budgeted.includes(tool) ? { "anthropic/maxResultSizeChars": chars } : undefined,
        );
      }
    }
  });
});
