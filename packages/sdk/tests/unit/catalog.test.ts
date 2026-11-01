import { describe, expect, test } from "vite-plus/test";
import { catalog, type CatalogEntry, type CatalogOutput } from "../../src/catalog.ts";
import { compileWhere } from "../../src/core/listing.ts";
import { ops } from "../../src/generated/ops.ts";
import { createRedmine } from "../../src/index.ts";
import { createAjv, schemaChecker } from "../schema-checker.ts";

const check = schemaChecker();
const byMethod = new Map(catalog.map((entry) => [`${entry.namespace}.${entry.verb}`, entry]));
const schemaOf = (output: CatalogOutput) =>
  output.kind === "item" || output.kind === "list" ? output.schema : undefined;
const entry = (method: string): CatalogEntry => {
  const found = byMethod.get(method);
  if (!found) throw new Error(`no catalog entry for ${method}`);
  return found;
};

describe("catalog", () => {
  test("lists exactly the methods of a client", () => {
    const rm = createRedmine({ baseUrl: "https://redmine.test" });
    const methods = Object.entries(rm).flatMap(([namespace, verbs]) =>
      typeof verbs === "object" && verbs !== null
        ? Object.entries(verbs).flatMap(([verb, fn]) =>
            typeof fn === "function" ? [`${namespace}.${verb}`] : [],
          )
        : [],
    );

    expect([...byMethod.keys()].sort()).toEqual(methods.sort());
    expect(catalog).toHaveLength(methods.length);
    expect(catalog).toHaveLength(90);
  });

  test("ids are unique", () => {
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
  });

  test("every input and output schema compiles under Ajv's strict draft 2020-12", () => {
    const ajv = createAjv();
    for (const e of catalog) {
      expect(() => ajv.compile(e.inputSchema), `${e.id} input`).not.toThrow();
      const output = schemaOf(e.output);
      if (output) expect(() => ajv.compile(output), `${e.id} output`).not.toThrow();
    }
  });

  test("generated entries carry the operation's method, safety and versions", () => {
    for (const e of catalog) {
      const op = (ops as Record<string, (typeof ops)[keyof typeof ops] | undefined>)[e.id];
      if (!op) continue;
      expect({ ...e, inputSchema: null, output: null }, e.id).toMatchObject({
        method: op.method,
        safety: op.safety,
        since: op.since,
        until: op.until,
        stability: op.stability,
      });
    }
    expect(entry("groups.removeUsers").since).toBe("7.0");
    expect(entry("issues.get").since).toBe("6.1");
  });

  test("inlineUploads marks the five methods that take files in uploads, whose schema keeps the JSON form", () => {
    const marked = catalog.filter((e) => e.inlineUploads !== null);
    const five = ["issues.create", "issues.update", "news.create", "news.update", "wiki.update"];

    expect(marked.map((e) => `${e.namespace}.${e.verb}`).toSorted()).toEqual(five);
    for (const e of marked) {
      const uploads = e.inputSchema.properties?.[e.inlineUploads!];
      expect(uploads?.type, e.id).toBe("array");
      expect(uploads?.items?.additionalProperties, e.id).toBe(false);
      expect(Object.keys(uploads?.items?.properties ?? {}).toSorted(), e.id).toEqual([
        "content_type",
        "description",
        "filename",
        "token",
      ]);
    }
    expect(entry("attachments.upload").description).toContain(
      "`uploads` of issues.create, issues.update, news.create, news.update or wiki.update.",
    );
  });

  test("issues.list `where.status_id` takes the words and documented operators, not text ones", () => {
    const input = entry("issues.list").inputSchema;
    const accepts = (status_id: unknown) => check(input, { where: { status_id } }).length === 0;

    expect(accepts("open")).toBe(true);
    expect(accepts(2)).toBe(true);
    expect(accepts({ not: [1, 2] })).toBe(true);
    expect(accepts({ any: true })).toBe(true);
    expect(accepts({ contains: "x" })).toBe(false);
    expect(accepts({ none: true })).toBe(false);
    expect(accepts({ not: [1], any: true })).toBe(false);
  });

  test("inputs refuse unknown keys and require what the TypeScript input requires", () => {
    const update = entry("issues.update").inputSchema;

    expect(check(update, { issue_id: 1, notes: "n", status_id: 2 })).toEqual([]);
    expect(check(update, { notes: "n" })).not.toEqual([]);
    expect(check(update, { issue_id: 1, nots: "typo" })).not.toEqual([]);
    expect(check(entry("issues.list").inputSchema, { where: { cf_12: ["a", "b"] } })).toEqual([]);
    expect(check(entry("issues.list").inputSchema, { where: { cf_x: "a" } })).not.toEqual([]);
    expect(check(entry("issues.list").inputSchema, { paging: "keyset", pageSize: 50 })).toEqual([]);
    expect(entry("issueStatuses.list").inputSchema.properties).toEqual({});
  });

  test("output schemas keep unknown properties and require only what the types require", () => {
    const status = schemaOf(entry("issueStatuses.list").output)!;
    const closed = { id: 5, name: "Closed", is_closed: true, description: null };

    expect(check(status, { ...closed, added_by_a_plugin: 1 })).toEqual([]);
    expect(check(status, { id: 5, name: "Closed", description: null })).not.toEqual([]);
    expect(check(status, { ...closed, is_closed: "yes" })).not.toEqual([]);
    expect(entry("issues.list").output.kind).toBe("list");
    expect(entry("issues.update").output).toEqual({ kind: "empty" });
    expect(entry("attachments.download").output).toEqual({ kind: "binary" });
  });

  test("recursive issue children are checked one level deep", () => {
    const issue = schemaOf(entry("issues.get").output) as { properties: Record<string, object> };
    const children = issue.properties.children!;
    const tracker = { id: 1, name: "Bug" };

    expect(
      check(children, [
        { id: 2, tracker, subject: "Child", children: [{ id: 3, tracker, subject: "Grandchild" }] },
      ]),
    ).toEqual([]);
    expect(check(children, [{ id: 2, tracker, children: [] }])).not.toEqual([]);
    expect(
      check(children, [{ id: 2, tracker, subject: "Child", children: [{ from: "a plugin" }] }]),
    ).toEqual([]);
  });
});

describe("where schemas accept exactly the conditions compileWhere accepts", () => {
  const samples: unknown[] = [
    "a",
    7,
    [1, "b"],
    [],
    { not: 1 },
    { not: [1, 2] },
    { not: [] },
    { gte: 1 },
    { lte: "2026-01-01" },
    { gte: [1] },
    { between: [1, 2] },
    { between: [1] },
    { contains: "x" },
    { not_contains: "x" },
    { starts_with: "x" },
    { ends_with: "x" },
    { any: true },
    { none: true },
    { any: false },
    { raw: "<t-3" },
    { raw: 1 },
    { not: 1, gte: 2 },
    { bogus: 1 },
    {},
  ];
  const lists = catalog.filter((e) => e.inputSchema.properties?.where !== undefined);

  test.each(lists.map((e) => [e.id, e] as const))("%s", (id, e) => {
    const op = (ops as Record<string, Parameters<typeof compileWhere>[0]>)[id]!;
    const fields = [
      ...Object.keys(e.inputSchema.properties?.where?.properties ?? {}),
      ...(op.customFieldFilters ? ["cf_12"] : []),
      "not_a_filter",
    ];
    const disagreements = fields.flatMap((field) =>
      samples.flatMap((cond) => {
        const bySchema = check(e.inputSchema, { where: { [field]: cond } }).length === 0;
        let byRuntime = true;
        try {
          compileWhere(op, { [field]: cond });
        } catch {
          byRuntime = false;
        }
        return bySchema === byRuntime
          ? []
          : [`${field}=${JSON.stringify(cond)}: schema ${bySchema}, runtime ${byRuntime}`];
      }),
    );
    expect(disagreements).toEqual([]);
  });
});
