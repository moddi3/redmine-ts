import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { Access } from "@redmine-ts/sdk";
import { describe, expect, it } from "vite-plus/test";
import { portable } from "../../src/portable.ts";
import type { Schema } from "../../src/tools.ts";
import { connect } from "../connect.ts";

// ajv-formats is CommonJS with its plugin on `default`.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

/** One value of every JSON type, and the strings, arrays and objects the cases below tell apart. */
const PROBES: readonly unknown[] = [
  null,
  true,
  0,
  1,
  -1,
  1.5,
  "",
  "a",
  "monospace",
  "2026-10-23",
  [],
  ["a"],
  [1, "a"],
  {},
  { id: 1 },
  { id: "1" },
  { id: 1, extra: true },
];

const CASES: readonly { name: string; schema: Schema; expected: Schema }[] = [
  {
    name: "a nullable string keeps its annotations on the anyOf and its constraints on the string",
    schema: {
      description: "Start date.",
      default: null,
      type: ["string", "null"],
      format: "date",
    },
    expected: {
      description: "Start date.",
      default: null,
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
    },
  },
  {
    name: "a number constraint goes to the integer branch",
    schema: { type: ["integer", "null"], minimum: 0 },
    expected: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
  },
  {
    name: "each branch takes the enum values of its type",
    schema: { type: ["string", "null"], enum: ["monospace", "proportional", null] },
    expected: {
      anyOf: [{ type: "string", enum: ["monospace", "proportional"] }, { type: "null" }],
    },
  },
  {
    name: "a branch no enum value fits is dropped",
    schema: { type: ["string", "number"], enum: ["a"] },
    expected: { anyOf: [{ type: "string", enum: ["a"] }] },
  },
  {
    name: "object keywords go to the object branch",
    schema: {
      type: ["object", "null"],
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    },
    expected: {
      anyOf: [
        {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
  },
  {
    name: "a split nested alone in an anyOf merges into it, and nested schemas are rewritten",
    schema: {
      anyOf: [
        { type: ["string", "number"] },
        { type: "array", items: { type: ["string", "number"] }, minItems: 1 },
      ],
    },
    expected: {
      anyOf: [
        { type: "string" },
        { type: "number" },
        { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] }, minItems: 1 },
      ],
    },
  },
  {
    name: "empty items and additionalProperties schemas are dropped",
    schema: {
      type: "object",
      properties: { id: { type: "integer" }, tags: { type: "array", items: {} } },
      additionalProperties: {},
    },
    expected: {
      type: "object",
      properties: { id: { type: "integer" }, tags: { type: "array" } },
    },
  },
];

describe("portable", () => {
  it.each(CASES)("$name", ({ schema, expected }) => {
    expect(portable(schema)).toEqual(expected);
  });

  it.each(CASES)("accepts exactly what the original accepts: $name", ({ schema }) => {
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const before = ajv.compile(schema);
    const after = ajv.compile(portable(schema));
    for (const probe of PROBES) {
      for (const value of [probe, { value: probe }, [probe]]) {
        expect(after(value), JSON.stringify(value)).toBe(before(value));
      }
    }
  });
});

/** The keywords that describe a schema; a schema with nothing else accepts any value. */
const ANNOTATIONS = new Set(["$schema", "title", "description", "default"]);

/** Every schema in `schema`, with its path, the root first. */
function* schemas(schema: unknown, path: string): Generator<[string, Record<string, unknown>]> {
  if (typeof schema !== "object" || schema === null) return;
  const node = schema as Record<string, unknown>;
  yield [path, node];
  for (const key of ["properties", "patternProperties", "$defs"]) {
    for (const [name, sub] of Object.entries((node[key] ?? {}) as Record<string, unknown>)) {
      yield* schemas(sub, `${path}.${key}.${name}`);
    }
  }
  for (const key of ["anyOf", "allOf", "oneOf", "prefixItems"]) {
    for (const [i, sub] of ((node[key] ?? []) as unknown[]).entries()) {
      yield* schemas(sub, `${path}.${key}[${i}]`);
    }
  }
  for (const key of ["items", "additionalProperties", "propertyNames", "not"]) {
    yield* schemas(node[key], `${path}.${key}`);
  }
}

describe("listed tool schemas", () => {
  const dir = mkdtempSync(join(tmpdir(), "redmine-mcp-portable-"));

  it.each(
    (["full", "no-delete", "read-only"] as const).flatMap((access: Access) => [
      [access, false],
      [access, true],
    ]),
  )(
    "declare one type per schema and no untyped schema, %s access, files directory %s",
    async (access, files) => {
      const client = await connect(
        { baseUrl: "http://redmine.test", auth: { apiKey: "test-key" }, access },
        files ? { filesDir: dir } : {},
      );
      for (const tool of (await client.listTools()).tools) {
        for (const [name, schema] of [
          ["inputSchema", tool.inputSchema],
          ["outputSchema", tool.outputSchema],
        ] as const) {
          for (const [path, node] of schemas(schema, `${tool.name} ${name}`)) {
            expect(node.type, path).not.toBeInstanceOf(Array);
            expect(
              Object.keys(node).some((key) => !ANNOTATIONS.has(key)),
              `${path} accepts any value`,
            ).toBe(true);
          }
        }
      }
    },
  );
});
