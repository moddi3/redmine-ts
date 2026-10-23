// Some clients map tool schemas onto a dialect with one `type` per schema, such as Gemini's function
// declarations, and reject or misread `"type": ["string", "null"]`. portable() spells every schema the
// way those dialects read it. The result is still draft 2020-12 and accepts exactly the same instances.

import type { JsonType } from "@redmine-ts/sdk/catalog";
import type { Schema } from "./tools.ts";

type Node = Record<string, unknown>;

/** Keywords that describe a schema rather than constrain it, so they stay beside the anyOf. */
const ANNOTATIONS = new Set(["$schema", "title", "description", "default"]);

/**
 * Keywords that constrain only instances of one type, so only that type's branch takes them. Number
 * keywords apply to integers too. A keyword missing here is copied to every branch, which is still exact.
 */
const ONLY_FOR: Readonly<Record<string, JsonType>> = {
  minLength: "string",
  maxLength: "string",
  pattern: "string",
  format: "string",
  minimum: "number",
  maximum: "number",
  exclusiveMinimum: "number",
  exclusiveMaximum: "number",
  multipleOf: "number",
  items: "array",
  prefixItems: "array",
  minItems: "array",
  maxItems: "array",
  uniqueItems: "array",
  properties: "object",
  patternProperties: "object",
  additionalProperties: "object",
  propertyNames: "object",
  required: "object",
  minProperties: "object",
  maxProperties: "object",
};

/** Where subschemas sit: as the value, as an array of them, or as a map of names to them. */
const ONE = new Set(["items", "additionalProperties", "propertyNames", "not"]);
const MANY = new Set(["anyOf", "allOf", "oneOf", "prefixItems"]);
const NAMED = new Set(["properties", "patternProperties", "$defs"]);

/** Where an empty schema is what an absent keyword means already: any item, any other property. */
const ANY_BY_DEFAULT = new Set(["items", "additionalProperties"]);

/**
 * `type: [a, b]` becomes `anyOf: [{type: a}, {type: b}]`, each branch with the keywords of its type and
 * the enum values of its type, and an anyOf nested alone in an anyOf is merged into it. An empty
 * `items` or `additionalProperties` schema is dropped, because it constrains nothing and clients that
 * require a type cannot read it.
 */
export function portable(schema: Schema): Schema {
  return rewrite(schema as Node) as Schema;
}

function rewrite(node: Node): Node {
  const out: Node = {};
  for (const [key, value] of Object.entries(node)) {
    if (ANY_BY_DEFAULT.has(key) && isEmpty(value)) continue;
    if (ONE.has(key)) out[key] = subschema(value);
    else if (MANY.has(key)) out[key] = (value as unknown[]).map(subschema);
    else if (NAMED.has(key)) {
      out[key] = Object.fromEntries(
        Object.entries(value as Node).map(([name, sub]) => [name, subschema(sub)]),
      );
    } else out[key] = value;
  }
  if (Array.isArray(out.anyOf)) {
    out.anyOf = out.anyOf.flatMap((branch: unknown) =>
      isRecord(branch) && Object.keys(branch).length === 1 && Array.isArray(branch.anyOf)
        ? branch.anyOf
        : [branch],
    );
  }
  return Array.isArray(out.type) ? split(out, out.type as JsonType[]) : out;
}

function split(node: Node, types: readonly JsonType[]): Node {
  const parent: Node = {};
  const branches = types.map((type): Node => ({ type }));
  for (const [key, value] of Object.entries(node)) {
    if (key === "type") continue;
    if (ANNOTATIONS.has(key)) {
      parent[key] = value;
      continue;
    }
    const only = ONLY_FOR[key];
    branches.forEach((branch, i) => {
      const type = types[i]!;
      if (only === undefined || only === type || (only === "number" && type === "integer")) {
        branch[key] = value;
      }
    });
  }
  parent.anyOf = branches.flatMap((branch) => {
    if (!Array.isArray(branch.enum)) return [branch];
    const type = branch.type as JsonType;
    const values = branch.enum.filter((value: unknown) => is(value, type));
    if (values.length === 0) return [];
    // null is the only value of its type, so the enum adds nothing there.
    if (type === "null") return [{ type }];
    return [{ ...branch, enum: values }];
  });
  return parent;
}

/** Boolean schemas pass through unchanged. */
function subschema(value: unknown): unknown {
  return isRecord(value) ? rewrite(value) : value;
}

function is(value: unknown, type: JsonType): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "integer":
      return Number.isInteger(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    default:
      return typeof value === type;
  }
}

function isRecord(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}
