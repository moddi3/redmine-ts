import { describe, expect, test } from "vite-plus/test";
import { compileWhere, createListing } from "../../src/core/listing.ts";
import type { Page } from "../../src/core/listing.ts";
import type { AnyOp } from "../../src/core/op.ts";
import { failure, json, testEngine } from "./fixtures/fake-fetch.ts";
import type { Responder } from "./fixtures/fake-fetch.ts";
import * as ops from "./fixtures/registry.ts";

describe("compileWhere", () => {
  test.each([
    ["a bare value", { assigned_to_id: 5 }, { assigned_to_id: "5" }],
    ["a word", { status_id: "open" }, { status_id: "o" }],
    ["words and ids mixed", { status_id: ["open", 5] }, { status_id: "o|5" }],
    ["an array", { assigned_to_id: [1, 2] }, { assigned_to_id: "1|2" }],
    ["not", { assigned_to_id: { not: [1, 2] } }, { assigned_to_id: "!1|2" }],
    ["none", { assigned_to_id: { none: true } }, { assigned_to_id: "!*" }],
    ["any", { assigned_to_id: { any: true } }, { assigned_to_id: "*" }],
    ["gte", { updated_on: { gte: "2026-10-01" } }, { updated_on: ">=2026-10-01" }],
    ["lte", { updated_on: { lte: "2026-10-01" } }, { updated_on: "<=2026-10-01" }],
    [
      "between",
      { updated_on: { between: ["2026-01-01", "2026-02-01"] } },
      { updated_on: "><2026-01-01|2026-02-01" },
    ],
    ["contains", { subject: { contains: "fire" } }, { subject: "~fire" }],
    ["not_contains", { subject: { not_contains: "fire" } }, { subject: "!~fire" }],
    ["starts_with", { subject: { starts_with: "Re:" } }, { subject: "^Re:" }],
    ["ends_with", { subject: { ends_with: "?" } }, { subject: "$?" }],
    ["raw, verbatim and unchecked", { updated_on: { raw: "<t-30" } }, { updated_on: "<t-30" }],
    ["a custom field list", { cf_12: ["S1", "S2"] }, { cf_12: "S1|S2" }],
    ["a comma list for a filter that reads one value", { issue_id: [4, 9] }, { issue_id: "4,9" }],
    ["a single value for that filter", { issue_id: 4 }, { issue_id: "4" }],
    ["not with a comma list", { issue_id: { not: [4, 9] } }, { issue_id: "!4,9" }],
    [
      "a range stays pipe-separated",
      { done_ratio: { between: [10, 50] } },
      { done_ratio: "><10|50" },
    ],
    ["a bound for a comma filter", { issue_id: { gte: 4 } }, { issue_id: ">=4" }],
    [
      "a comma filter beside a pipe filter",
      { done_ratio: [30, 40], assigned_to_id: [1, 2] },
      { done_ratio: "30,40", assigned_to_id: "1|2" },
    ],
    ["an operator on a custom field", { cf_7: { contains: "x" } }, { cf_7: "~x" }],
    [
      "an undefined condition",
      { assigned_to_id: undefined, status_id: "closed" },
      { status_id: "c" },
    ],
  ])("compiles %s", (_name, where, wire) => {
    const compiled = Object.entries(compileWhere(ops.getIssues, where));

    expect(Object.fromEntries(compiled.map(([key, c]) => [key, c.wire]))).toEqual(wire);
  });

  test.each([
    ["an unknown key", { bogus: 1 }, "bogus"],
    ["a key that only exists on the prototype", { constructor: 1 }, "constructor"],
    ["a malformed custom field key", { cf_x: 1 }, "cf_x"],
    ["a custom field on an operation without them", { cf_1: 1 }, "cf_1"],
    ["an operator the field does not document", { assigned_to_id: { gte: 3 } }, "assigned_to_id"],
    ["a text operator on a status", { status_id: { contains: "a" } }, "status_id"],
    ["a range on a text field", { subject: { gte: "a" } }, "subject"],
    ["between where only >= is documented", { issue_id: { between: [1, 2] } }, "issue_id"],
    ["an empty list", { assigned_to_id: [] }, "assigned_to_id"],
    ["two operators in one condition", { updated_on: { gte: "a", lte: "b" } }, "updated_on"],
    ["an unknown operator", { assigned_to_id: { nope: 1 } }, "nope"],
    ["an empty condition", { status_id: {} }, "status_id"],
    ["between with the wrong shape", { updated_on: { between: ["a"] } }, "between"],
    ["a nested object value", { subject: { not: { a: 1 } } }, "subject"],
    ["none: false", { assigned_to_id: { none: false } }, "none"],
  ])("rejects %s with invalid_input naming it", (_name, where, mention) => {
    const run = (): unknown =>
      compileWhere("cf_1" in where ? ops.getProjects : ops.getIssues, where);

    expect(run).toThrowError(
      expect.objectContaining({ data: expect.objectContaining({ kind: "invalid_input" }) }),
    );
    expect(run).toThrowError(mention);
  });

  test("an undocumented operator names the legal ones", () => {
    expect(() => compileWhere(ops.getIssues, { assigned_to_id: { gte: 3 } })).toThrowError(
      /= ! \* !\*/,
    );
  });
});

async function sentQuery(op: AnyOp, where: object): Promise<Record<string, string[]>> {
  const { list, requests } = testEngine(() =>
    json({ issues: [], time_entries: [], total_count: 0, offset: 0, limit: 100 }),
  );
  await list(op, { where }).page();
  const query: Record<string, string[]> = {};
  for (const [key, value] of requests[0]?.url.searchParams ?? []) (query[key] ??= []).push(value);
  return query;
}

describe("project_id beyond one id or identifier", () => {
  const page = { offset: ["0"], limit: ["100"] };
  const openIssues = { "op[status_id]": ["o"], "v[status_id][]": [""] };

  test.each([
    ["one id", { project_id: 5 }, "5"],
    ["one identifier", { project_id: "web-app" }, "web-app"],
    ["a list of one id", { project_id: [5] }, "5"],
  ])(
    "sends %s as project_id, the project Redmine scopes the request to",
    async (_name, where, id) => {
      expect(await sentQuery(ops.getIssues, where)).toEqual({ project_id: [id], ...page });
    },
  );

  test.each([
    ["a list of ids", { project_id: [1, 2] }, "=", ["1", "2"]],
    ["{ not }", { project_id: { not: 1 } }, "!", ["1"]],
    ['"mine"', { project_id: "mine" }, "=", ["mine"]],
    ['{ not: "mine" }', { project_id: { not: "mine" } }, "!", ["mine"]],
    ["raw", { project_id: { raw: "!1|2" } }, "!", ["1", "2"]],
  ])(
    "sends %s in the long form, from open issues as the short form starts",
    async (_name, where, op, values) => {
      expect(await sentQuery(ops.getIssues, where)).toEqual({
        "f[]": ["project_id", "status_id"],
        "op[project_id]": [op],
        "v[project_id][]": values,
        ...openIssues,
        ...page,
      });
    },
  );

  test("moves every other filter along, split the way Redmine splits a short one", async () => {
    expect(
      await sentQuery(ops.getIssues, {
        project_id: [1, 2],
        status_id: "any",
        assigned_to_id: { none: true },
        updated_on: { raw: "<t-30" },
        issue_id: [4, 9],
        done_ratio: { between: [50, 10] },
        cf_12: ["S1", "S2"],
      }),
    ).toEqual({
      "f[]": [
        "project_id",
        "status_id",
        "assigned_to_id",
        "updated_on",
        "issue_id",
        "done_ratio",
        "cf_12",
      ],
      "op[project_id]": ["="],
      "v[project_id][]": ["1", "2"],
      "op[status_id]": ["*"],
      "v[status_id][]": [""],
      "op[assigned_to_id]": ["!*"],
      "v[assigned_to_id][]": [""],
      "op[updated_on]": ["<t-"],
      "v[updated_on][]": ["30"],
      "op[issue_id]": ["="],
      "v[issue_id][]": ["4,9"],
      "op[done_ratio]": ["><"],
      "v[done_ratio][]": ["50", "10"],
      "op[cf_12]": ["="],
      "v[cf_12][]": ["S1", "S2"],
      ...page,
    });
  });

  test("reads a plain value on a standard filter the way Redmine reads its short form", async () => {
    expect(
      await sentQuery(ops.getIssues, {
        project_id: [1, 2],
        status_id: "*",
        assigned_to_id: "!*",
        updated_on: ">=2026-10-01",
      }),
    ).toEqual({
      "f[]": ["project_id", "status_id", "assigned_to_id", "updated_on"],
      "op[project_id]": ["="],
      "v[project_id][]": ["1", "2"],
      "op[status_id]": ["*"],
      "v[status_id][]": [""],
      "op[assigned_to_id]": ["!*"],
      "v[assigned_to_id][]": [""],
      "op[updated_on]": [">="],
      "v[updated_on][]": ["2026-10-01"],
      ...page,
    });
  });

  test("sends a custom field condition with its own operator, its values split as Redmine splits", async () => {
    expect(
      await sentQuery(ops.getIssues, {
        project_id: [1, 2],
        cf_3: "medium",
        cf_4: { gte: "2026-01-01" },
        cf_5: { contains: "a|b" },
        cf_6: ["S1", "S2|S3"],
      }),
    ).toEqual({
      "f[]": ["project_id", "cf_3", "cf_4", "cf_5", "cf_6", "status_id"],
      "op[project_id]": ["="],
      "v[project_id][]": ["1", "2"],
      "op[cf_3]": ["="],
      "v[cf_3][]": ["medium"],
      "op[cf_4]": [">="],
      "v[cf_4][]": ["2026-01-01"],
      "op[cf_5]": ["~"],
      "v[cf_5][]": ["a", "b"],
      "op[cf_6]": ["="],
      "v[cf_6][]": ["S1", "S2", "S3"],
      ...openIssues,
      ...page,
    });
  });

  test.each([
    ["raw next to a list", { project_id: [1, 2], cf_3: { raw: "*~alpha" } }],
    ["raw next to { not }", { project_id: { not: 1 }, cf_4: { raw: ">t-7" } }],
    ["a value that starts with an operator", { project_id: [1, 2], cf_3: "*~alpha" }],
    ["a list that starts with one", { project_id: "mine", cf_4: ["!S2", "S3"] }],
  ])(
    "refuses %s on a custom field, since Redmine reads it by the field's format",
    async (_name, where) => {
      const { list, requests } = testEngine(issueServer(5));
      const error = await failure(list(ops.getIssues, { where }).all());

      expect(error.kind).toBe("invalid_input");
      expect(error.message).toMatch(/cf_[34]/);
      expect(requests).toHaveLength(0);
    },
  );

  test("refuses a filter Redmine offers only inside one project, since it would drop it", async () => {
    const { list, requests } = testEngine(issueServer(5));
    const error = await failure(
      list(ops.getIssues, { where: { project_id: [1, 2], category_id: 4 } }).all(),
    );

    expect(error.kind).toBe("invalid_input");
    expect(error.message).toMatch(/category_id/);
    expect(requests).toHaveLength(0);
  });

  test("drops the empty values after a trailing pipe in raw, as Redmine's split does", async () => {
    expect(await sentQuery(ops.getIssues, { project_id: { raw: "1|2|" } })).toEqual({
      "f[]": ["project_id", "status_id"],
      "op[project_id]": ["="],
      "v[project_id][]": ["1", "2"],
      ...openIssues,
      ...page,
    });
  });

  test("adds no status filter to time entries, whose default matches every entry", async () => {
    expect(await sentQuery(ops.getTimeEntries, { project_id: [1, 2] })).toEqual({
      "f[]": ["project_id"],
      "op[project_id]": ["="],
      "v[project_id][]": ["1", "2"],
      ...page,
    });
  });

  test("keyset paging sends its id bound in the long form too", async () => {
    const { list, requests } = testEngine((request) => {
      const from = Number(request.url.searchParams.get("v[issue_id][]") ?? 0);
      const matching = [3, 8, 12].filter((id) => id >= from);
      const issues = matching.slice(0, 2).map((id) => ({ id }));
      return json({ issues, total_count: matching.length, offset: 0, limit: 2 });
    });
    const all = await list(ops.getIssues, {
      where: { project_id: [1, 2] },
      paging: "keyset",
      pageSize: 2,
    }).all();

    expect(all).toEqual([{ id: 3 }, { id: 8 }, { id: 12 }]);
    expect(requests.map((r) => r.url.searchParams.get("v[issue_id][]"))).toEqual([null, "9"]);
    expect(requests.map((r) => r.url.searchParams.get("op[issue_id]"))).toEqual([null, ">="]);
  });

  test.each([
    ["identifiers in a list", { project_id: ["web-app", "api"] }],
    ["an identifier under { not }", { project_id: { not: "web-app" } }],
  ])("refuses %s before any request, since Redmine would match nothing", async (_name, where) => {
    const { list, requests } = testEngine(issueServer(5));
    const error = await failure(list(ops.getIssues, { where }).all());

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });
});

/** A server over `total` issues with ids 1..total. `cap` is the most it will return per page. */
function issueServer(
  total: number,
  cap = 100,
  ids: readonly number[] = Array.from({ length: total }, (_, i) => i + 1),
): Responder {
  return (request) => {
    const params = request.url.searchParams;
    const offset = Number(params.get("offset") ?? 0);
    const limit = Math.min(Number(params.get("limit") ?? 100), cap);
    const from = params.get("issue_id")?.replace(">=", "");
    const matching = ids.filter((id) => from === undefined || from === null || id >= Number(from));
    const issues = matching.slice(offset, offset + limit).map((id) => ({ id }));
    return json({ issues, total_count: matching.length, offset, limit });
  };
}

const offsets = (requests: readonly { url: URL }[]): (string | null)[] =>
  requests.map((r) => r.url.searchParams.get("offset"));

describe("offset paging", () => {
  test("walks every page in order, in pages of 100 by default", async () => {
    const { list, requests } = testEngine(issueServer(250));
    const seen: unknown[] = [];
    for await (const item of list(ops.getIssues)) seen.push(item);

    expect(seen).toEqual(Array.from({ length: 250 }, (_, i) => ({ id: i + 1 })));
    expect(offsets(requests)).toEqual(["0", "100", "200"]);
    expect(requests.every((r) => r.url.searchParams.get("limit") === "100")).toBe(true);
  });

  test("is lazy and not thenable", async () => {
    const { list, requests } = testEngine(issueServer(5));
    const listing = list(ops.getIssues);

    expect("then" in listing).toBe(false);
    expect(await Promise.resolve(listing)).toBe(listing);
    expect(requests).toHaveLength(0);
  });

  test("breaking out of the loop stops fetching", async () => {
    const { list, requests } = testEngine(issueServer(250));
    let taken = 0;
    for await (const _item of list(ops.getIssues, { pageSize: 10 })) {
      if (++taken === 5) break;
    }

    expect(requests).toHaveLength(1);
  });

  test("page() makes exactly one request at the given offset and limit", async () => {
    const { list, requests } = testEngine(issueServer(250));
    const page = await list(ops.getIssues).page({ offset: 20, limit: 5 });

    expect(requests).toHaveLength(1);
    expect(offsets(requests)).toEqual(["20"]);
    expect(requests[0]?.url.searchParams.get("limit")).toBe("5");
    expect(page).toMatchObject({ total_count: 250, offset: 20, limit: 5 });
    expect(page.items).toEqual([21, 22, 23, 24, 25].map((id) => ({ id })));
  });

  test("pages() yields whole pages", async () => {
    const { list } = testEngine(issueServer(25));
    const sizes: number[] = [];
    for await (const page of list(ops.getIssues, { pageSize: 10 }).pages())
      sizes.push(page.items.length);

    expect(sizes).toEqual([10, 10, 5]);
  });

  test("all({ max }) returns exactly max items and throws page_cap for one more instead of truncating", async () => {
    const { list } = testEngine(issueServer(5));

    expect(await list(ops.getIssues).all({ max: 5 })).toHaveLength(5);
    const error = await failure(list(ops.getIssues).all({ max: 4 }));
    expect(error.data).toMatchObject({ kind: "protocol", reason: "page_cap" });
  });

  test("count() is one limit=1 request answered with total_count", async () => {
    const { list, requests } = testEngine(issueServer(250));

    expect(await list(ops.getIssues, { where: { status_id: "open" } }).count()).toBe(250);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.searchParams.get("limit")).toBe("1");
    expect(requests[0]?.url.searchParams.get("status_id")).toBe("o");
  });

  test("advances by the items that arrived when the server over-returns", async () => {
    const overReturning: Responder = (request) => {
      const offset = Number(request.url.searchParams.get("offset"));
      const issues = Array.from({ length: Math.min(150, 300 - offset) }, (_, i) => ({
        id: offset + i + 1,
      }));
      return json({ issues, total_count: 300, offset, limit: 100 });
    };
    const { list, requests } = testEngine(overReturning);
    const all = await list(ops.getIssues).all();

    expect(all).toHaveLength(300);
    expect(new Set(all.map((i) => (i as { id: number }).id)).size).toBe(300);
    expect(offsets(requests)).toEqual(["0", "150"]);
  });

  test("keeps walking when the server caps the page below the requested size", async () => {
    const { list, requests } = testEngine(issueServer(60, 25));

    expect(await list(ops.getIssues).all()).toHaveLength(60);
    expect(offsets(requests)).toEqual(["0", "25", "50"]);
  });

  test("an empty page ends the walk even when total_count promises more", async () => {
    const lying: Responder = (request) => {
      const offset = Number(request.url.searchParams.get("offset"));
      const issues = offset === 0 ? [{ id: 1 }, { id: 2 }] : [];
      return json({ issues, total_count: 1000, offset, limit: 100 });
    };
    const { list, requests } = testEngine(lying);

    expect(await list(ops.getIssues).all()).toHaveLength(2);
    expect(requests).toHaveLength(2);
  });

  test("a server that ignores offset is protocol/pagination_offset_mismatch, not an endless repeat", async () => {
    const ignoring: Responder = () =>
      json({
        issues: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
        total_count: 250,
        offset: 0,
        limit: 100,
      });
    const { list } = testEngine(ignoring);
    const error = await failure(list(ops.getIssues).all());

    expect(error.data).toMatchObject({ kind: "protocol", reason: "pagination_offset_mismatch" });
  });

  test("a repeated page with an honest offset is protocol/pagination_stalled", async () => {
    const repeating: Responder = (request) =>
      json({
        issues: [{ id: 1 }, { id: 2 }],
        total_count: 10,
        offset: Number(request.url.searchParams.get("offset")),
        limit: 2,
      });
    const { list } = testEngine(repeating);
    const error = await failure(list(ops.getIssues, { pageSize: 2 }).all());

    expect(error.data).toMatchObject({ kind: "protocol", reason: "pagination_stalled" });
  });

  test("stops with page_cap after 10000 pages instead of looping forever", async () => {
    let fetched = 0;
    const listing = createListing<Page<unknown>["items"][number]>(
      ops.getIssues,
      { pageSize: 1 },
      async ({ offset }) => {
        fetched++;
        return {
          items: [{ id: offset + 1 }],
          total_count: Number.POSITIVE_INFINITY,
          offset,
          limit: 1,
        };
      },
    );
    const error = await failure(listing.all());

    expect(error.data).toMatchObject({ kind: "protocol", reason: "page_cap" });
    expect(fetched).toBe(10_000);
  });

  test("an unpaged list is one request without offset or limit", async () => {
    const { list, requests } = testEngine(() => json({ issue_statuses: [{ id: 1 }, { id: 2 }] }));
    const listing = list(ops.getIssueStatuses);

    expect(await listing.all()).toEqual([{ id: 1 }, { id: 2 }]);
    expect(await listing.count()).toBe(2);
    expect(requests).toHaveLength(2);
    expect(
      requests.every((r) => !r.url.searchParams.has("offset") && !r.url.searchParams.has("limit")),
    ).toBe(true);
  });

  test("sort and compiled filters ride on every page", async () => {
    const { list, requests } = testEngine(issueServer(30));
    await list(ops.getIssues, {
      where: { status_id: "open", cf_12: ["S1", "S2"] },
      sort: "updated_on:desc",
      pageSize: 20,
      include: ["journals"],
    }).all();

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const params = request.url.searchParams;
      expect(params.get("sort")).toBe("updated_on:desc");
      expect(params.get("status_id")).toBe("o");
      expect(params.get("cf_12")).toBe("S1|S2");
      expect(params.get("include")).toBe("journals");
    }
  });

  test("a bad filter fails when the listing is consumed, before any request", async () => {
    const { list, requests } = testEngine(issueServer(5));
    const listing = list(ops.getIssues, { where: { bogus: 1 } });

    expect((await failure(listing.all())).kind).toBe("invalid_input");
    expect((await failure(listing.count())).kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });
});

describe("keyset paging", () => {
  const ids = [1, 2, 4, 5, 7, 9, 10];

  test("walks by id with gaps, never advancing the offset", async () => {
    const { list, requests } = testEngine(issueServer(0, 100, ids));
    const all = await list(ops.getIssues, { paging: "keyset", pageSize: 3 }).all();

    expect(all.map((i) => (i as { id: number }).id)).toEqual(ids);
    expect(requests.map((r) => r.url.searchParams.get("issue_id"))).toEqual([null, ">=5", ">=10"]);
    expect(requests.every((r) => r.url.searchParams.get("sort") === "id")).toBe(true);
    expect(offsets(requests)).toEqual(["0", "0", "0"]);
  });

  test("keeps going when the server caps the page below the requested size", async () => {
    const { list } = testEngine(issueServer(0, 2, ids));

    expect((await list(ops.getIssues, { paging: "keyset", pageSize: 5 }).all()).length).toBe(
      ids.length,
    );
  });

  test("an empty collection yields nothing", async () => {
    const { list, requests } = testEngine(issueServer(0, 100, []));

    expect(await list(ops.getIssues, { paging: "keyset" }).all()).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  test.each([
    ["a caller sort", ops.getIssues, { paging: "keyset", sort: "updated_on" }],
    [
      "a where that sets the keyset param",
      ops.getIssues,
      { paging: "keyset", where: { issue_id: 5 } },
    ],
    ["an operation without a keyset param", ops.getProjects, { paging: "keyset" }],
    ["an unknown paging mode", ops.getIssues, { paging: "cursor" }],
    ["a page size of zero", ops.getIssues, { pageSize: 0 }],
  ])("refuses %s before any request", async (_name, op, input) => {
    const { list, requests } = testEngine(issueServer(5));
    const error = await failure(list(op, input).all());

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  test("ids that do not advance are protocol/pagination_stalled", async () => {
    const { list } = testEngine(() =>
      json({ issues: [{ id: 5 }, { id: 6 }], total_count: 99, offset: 0, limit: 2 }),
    );
    const error = await failure(list(ops.getIssues, { paging: "keyset", pageSize: 2 }).all());

    expect(error.data).toMatchObject({ kind: "protocol", reason: "pagination_stalled" });
  });
});
