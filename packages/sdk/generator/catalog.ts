// The operation catalog: JSON Schema 2020-12 for each namespace method's flat input and returned item.
// Component schemas become shared constants, so the file stays small while each schema is self-contained.

import { CUSTOM_FIELD } from "../src/core/listing.ts";
import { uploadKey, type FilterSpec } from "../src/core/op.ts";
import type { Merged } from "./merge.ts";
import type { OpModel } from "./operations.ts";
import { refName, type Schema } from "./spec.ts";
import { pascal, propertyKey } from "./typescript.ts";

/** A constant declared earlier in the generated file. */
class Ref {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
}

/** `{ ...base, ...extra }`: a shared constant with its own description or `$schema`. */
class Spread {
  readonly base: Ref;
  readonly extra: Readonly<Record<string, Js>>;
  constructor(base: Ref, extra: Readonly<Record<string, Js>>) {
    this.base = base;
    this.extra = extra;
  }
}

type Js = Ref | Spread | string | number | boolean | null | readonly Js[] | JsObject;
interface JsObject {
  readonly [key: string]: Js;
}

type Mode = "input" | "output";

const DRAFT = new Ref("DRAFT");

/** How each `Cond` operator object is written, and the wire code a filter must document to accept it. */
const OPERATORS: readonly { name: string; code: string; value: string }[] = [
  { name: "not", code: "!", value: "many" },
  { name: "gte", code: ">=", value: "scalar" },
  { name: "lte", code: "<=", value: "scalar" },
  { name: "between", code: "><", value: "pair" },
  { name: "contains", code: "~", value: "text" },
  { name: "not_contains", code: "!~", value: "text" },
  { name: "starts_with", code: "^", value: "text" },
  { name: "ends_with", code: "$", value: "text" },
  { name: "any", code: "*", value: "yes" },
  { name: "none", code: "!*", value: "yes" },
];

export function catalogFile(ops: OpModel[], merged: Merged): string {
  const components = merged.latest.components.schemas;
  const decls: string[] = [];
  const declared = new Set<string>();
  const pending = new Set<string>();

  const define = (name: string, js: Js): Ref => {
    decls.push(`const ${name}: JsonSchema = ${code(js)};\n`);
    declared.add(name);
    return new Ref(name);
  };

  /** A recursive schema is inlined one level deep; the nested level is an object whose shape repeats. */
  const component = (name: string, mode: Mode): Ref | JsObject => {
    const id = `${mode === "input" ? "in" : "out"}${pascal(name)}`;
    if (declared.has(id)) return new Ref(id);
    if (pending.has(id))
      return { type: "object", description: `Same shape as the enclosing ${name}.` };
    const schema = components[name];
    if (!schema) throw new Error(`unknown schema ${name}`);
    pending.add(id);
    const js = convert(schema, mode);
    pending.delete(id);
    return define(id, js);
  };

  const convert = (s: Schema, mode: Mode): Js => {
    if (s.$ref) return component(refName(s.$ref), mode);
    const out: Record<string, Js> = {};
    const description = s.description?.trim();
    if (description) out.description = description;
    if (s.oneOf) {
      const alternatives = s.oneOf.map((o) => convert(o, mode));
      out.anyOf = s.nullable ? [...alternatives, { type: "null" }] : alternatives;
      return out;
    }
    const type = s.type ?? (s.properties || s.additionalProperties ? "object" : undefined);
    if (type) out.type = s.nullable ? [type, "null"] : type;
    if (s.enum) out.enum = s.nullable ? [...s.enum, null] : [...s.enum];
    if (s.format && s.format !== "binary") out.format = s.format;
    if (s.minimum !== undefined) out.minimum = s.minimum;
    if (s.maximum !== undefined) out.maximum = s.maximum;
    if (s.items) out.items = convert(s.items, mode);
    if (s.properties) {
      out.properties = Object.fromEntries(
        Object.entries(s.properties).map(([key, p]) => [key, convert(p, mode)]),
      );
      if (s.required?.length) out.required = s.required;
    }
    if (typeof s.additionalProperties === "object") {
      out.additionalProperties = convert(s.additionalProperties, mode);
    } else if (mode === "input" && s.properties) {
      out.additionalProperties = false;
    }
    return out;
  };

  const scalar = define("scalar", { type: ["string", "number"] });
  const scalars = define("scalars", { type: "array", items: scalar, minItems: 1 });
  const values: Record<string, Ref> = {
    scalar,
    many: define("many", { anyOf: [scalar, scalars] }),
    pair: define("pair", {
      type: "array",
      prefixItems: [scalar, scalar],
      minItems: 2,
      maxItems: 2,
    }),
    text: define("text", { type: "string" }),
    yes: define("yes", { const: true }),
  };
  const operatorObject = (name: string, value: Ref): Ref =>
    define(`op${pascal(name)}`, {
      type: "object",
      properties: { [name]: value },
      required: [name],
      additionalProperties: false,
    });
  const raw = operatorObject("raw", values.text!);
  const operators = OPERATORS.map((o) => ({ ...o, ref: operatorObject(o.name, values[o.value]!) }));

  /** The `Cond` forms compileWhere accepts for a filter: equality always, `raw` always, operators as documented. */
  const condition = (spec: FilterSpec, description: string | undefined): Js => ({
    ...(description?.trim() ? { description: description.trim() } : {}),
    anyOf: [
      scalar,
      scalars,
      raw,
      ...operators.filter((o) => spec.ops.includes(o.code)).map((o) => o.ref),
    ],
  });

  const where = (op: OpModel): Js => ({
    description:
      "Filters, keyed by Redmine's filter parameter names. A value or an array of values means equals; an object with one operator picks another.",
    type: "object",
    properties: Object.fromEntries(op.where.map((f) => [f.name, condition(f.spec, f.description)])),
    ...(op.descriptor.customFieldFilters
      ? {
          patternProperties: {
            "^cf_\\d+$": condition(
              CUSTOM_FIELD,
              "Custom field filter by id, e.g. `cf_12`. Operators depend on the field format.",
            ),
          },
        }
      : {}),
    additionalProperties: false,
  });

  const input = (op: OpModel): Js => {
    const properties: Record<string, Js> = {};
    for (const f of op.fields)
      properties[f.key] = describe(convert(f.schema, "input"), f.description);
    if (op.where.length > 0 || op.descriptor.customFieldFilters) properties.where = where(op);
    const { response } = op.descriptor;
    if (response.kind === "list") {
      if (op.sort)
        properties.sort = describe(convert(op.sort.schema, "input"), op.sort.description);
      if (response.paged) {
        properties.pageSize = {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        };
      }
      if (response.keyset) {
        properties.paging = {
          description:
            '"keyset" walks by ascending id, immune to inserts and deletes during the walk. It conflicts with `sort`.',
          enum: ["offset", "keyset"],
        };
      }
    }
    const required = op.fields.filter((f) => f.required).map((f) => f.key);
    return {
      $schema: DRAFT,
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  };

  const output = (op: OpModel): Js => {
    const { kind } = op.descriptor.response;
    if (kind === "empty" || kind === "binary") return { kind };
    if (!op.itemSpec) throw new Error(`${op.descriptor.id}: a ${kind} response without a schema`);
    const schema = withKeys(convert(op.itemSpec, "output"), { $schema: DRAFT });
    return kind === "item" ? { kind, schema, optional: op.maybeEmpty } : { kind, schema };
  };

  const entries = ops
    .filter((op) => op.verb)
    .map((op) => {
      const d = op.descriptor;
      return code({
        id: d.id,
        namespace: op.namespace,
        verb: op.verb!,
        title: op.summary ?? d.id,
        description: op.description?.trim() ?? "",
        docsUrl: op.docsUrl ?? null,
        method: d.method,
        safety: d.safety,
        since: d.since,
        until: d.until,
        stability: d.stability,
        inputSchema: input(op),
        inlineUploads: uploadKey(d) ?? null,
        output: output(op),
      });
    });

  return `import type { CatalogEntry, JsonSchema } from "../core/catalog.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

${decls.join("\n")}
/** One entry per generated namespace method, in spec order. */
export const CATALOG: readonly CatalogEntry[] = [\n${entries.join(",\n")}\n];
`;
}

function describe(js: Js, description: string | undefined): Js {
  const text = description?.trim();
  return text ? withKeys(js, { description: text }) : js;
}

function withKeys(js: Js, extra: Readonly<Record<string, Js>>): Js {
  if (js instanceof Ref) return new Spread(js, extra);
  if (js instanceof Spread) return new Spread(js.base, { ...js.extra, ...extra });
  if (js === null || typeof js !== "object" || Array.isArray(js)) {
    throw new Error("only a schema object takes keys");
  }
  return { ...(js as JsObject), ...extra };
}

function code(js: Js): string {
  if (js instanceof Ref) return js.name;
  if (js instanceof Spread) {
    const extra = Object.entries(js.extra).map(([k, v]) => `, ${propertyKey(k)}: ${code(v)}`);
    return `{ ...${js.base.name}${extra.join("")} }`;
  }
  if (Array.isArray(js)) return `[${js.map(code).join(", ")}]`;
  if (js !== null && typeof js === "object") {
    const fields = Object.entries(js as JsObject).map(([k, v]) => `${propertyKey(k)}: ${code(v)}`);
    return `{ ${fields.join(", ")} }`;
  }
  return JSON.stringify(js);
}
