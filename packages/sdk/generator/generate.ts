import { format } from "vite-plus/fmt";
import { uploadKey } from "../src/core/op.ts";
import { catalogFile } from "./catalog.ts";
import { mergeSpecs, type Drift, type Merged } from "./merge.ts";
import { analyzeOperations, type OpModel } from "./operations.ts";
import { overlay as defaultOverlay, type Overlay } from "./overlay.ts";
import {
  deref,
  isRef,
  operations,
  refName,
  type Response,
  type Schema,
  type SpecFile,
} from "./spec.ts";
import {
  jsDoc,
  members,
  objectBody,
  pascal,
  propertyKey,
  sinceTag,
  tsType,
  type Member,
} from "./typescript.ts";

const HEADER = "// Generated from spec/redmine-openapi/*.yaml by `vp run gen`. Do not edit.\n\n";

export interface Report {
  drift: Drift;
  ops: number;
  hidden: { id: string; reason: string }[];
  schemas: number;
  /** namespace -> [verb, operationId] */
  namespaces: Record<string, [string, string][]>;
  includeMisses: string[];
  inlineUploads: string[];
}

export interface Generated {
  /** Paths relative to packages/sdk, formatted. */
  files: Record<string, string>;
  report: Report;
}

export async function generate(
  specs: SpecFile[],
  overlay: Overlay = defaultOverlay,
): Promise<Generated> {
  const merged = mergeSpecs(specs, overlay.resolved);
  const { ops, includeMisses } = analyzeOperations(merged, overlay);
  const schemas = schemaTypes(merged, ops);
  const raw: Record<string, string> = {
    "src/generated/versions.ts": versionsFile(merged.versions),
    "src/generated/schemas.ts": schemasFile(schemas),
    "src/generated/inputs.ts": inputsFile(ops, schemas),
    "src/generated/ops.ts": opsFile(ops, schemas),
    "src/generated/slots.ts": slotsFile(ops),
    "src/generated/resources.ts": resourcesFile(ops, merged, schemas),
    "src/generated/catalog.ts": catalogFile(ops, merged),
  };
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(raw)) {
    const out = await format(path, HEADER + text, {});
    if (out.errors.length > 0)
      throw new Error(`${path} does not parse: ${JSON.stringify(out.errors)}`);
    files[path] = out.code;
  }
  const namespaces: Report["namespaces"] = {};
  for (const op of ops)
    if (op.verb) (namespaces[op.namespace] ??= []).push([op.verb, op.descriptor.id]);
  return {
    files,
    report: {
      drift: merged.drift,
      ops: ops.length,
      hidden: ops.flatMap((o) => (o.hidden ? [{ id: o.descriptor.id, reason: o.hidden }] : [])),
      schemas: schemas.length,
      namespaces,
      includeMisses,
      inlineUploads: ops.flatMap((o) => (uploadKey(o.descriptor) ? [o.descriptor.id] : [])),
    },
  };
}

function versionsFile(versions: string[]): string {
  const ladder = versions.map(
    (v, i) =>
      `${JSON.stringify(v)}: ${versions
        .slice(0, i + 1)
        .map((x) => JSON.stringify(x))
        .join(" | ")};`,
  );
  return `export const VERSIONS = ${JSON.stringify(versions)} as const;

export type RedmineVersion = (typeof VERSIONS)[number];

export type LatestVersion = ${JSON.stringify(versions.at(-1))};

/** For a declared server version, every version whose additions it includes. */
export interface Ladder {
${ladder.join("\n")}
}
`;
}

interface SchemaType {
  name: string;
  text: string;
}

/**
 * One type per component schema. Error bodies stay internal. A response wrapper (`my_account`) is
 * emitted as its inner object, which is what callers receive after unwrapping.
 */
function schemaTypes(merged: Merged, ops: OpModel[]): SchemaType[] {
  const doc = merged.latest;
  const errors = new Set<string>();
  const wrappers = new Set<string>();
  for (const { op } of operations(doc)) {
    for (const [code, r] of Object.entries(op.responses)) {
      for (const c of Object.values(deref<Response>(doc, r).content ?? {})) {
        if (c.schema && isRef(c.schema))
          (code.startsWith("2") ? wrappers : errors).add(refName(c.schema.$ref));
      }
    }
  }
  const added = new Map(merged.drift.addedSchemas.map((s) => [s.name, s.since]));
  const exposedBy = new Map<string, OpModel[]>();
  // A schema new to a later spec can name a shape older servers already send (issue_child in 7.0.2-r1),
  // so its type dates from the first version whose payloads can hold it.
  const reachable = new Map<string, string>();
  for (const m of merged.ops) {
    const reached = new Set<string>();
    const contents = [
      ...Object.values(m.op.responses).map((r) => deref<Response>(doc, r).content),
      m.op.requestBody?.content,
    ];
    for (const c of contents)
      for (const { schema } of Object.values(c ?? {})) {
        refsIn(schema, doc.components.schemas, reached);
        sinceIn(schema, m.since, doc.components.schemas, merged.versions, reachable);
      }
    const op = ops.find((o) => o.descriptor.id === m.op.operationId)!;
    for (const name of reached) exposedBy.set(name, [...(exposedBy.get(name) ?? []), op]);
  }
  return Object.entries(doc.components.schemas).flatMap(([name, schema]) => {
    if (errors.has(name)) return [];
    const s = wrappers.has(name) ? Object.values(schema.properties ?? {})[0] : schema;
    if (!s || s.$ref) throw new Error(`schema ${name}: cannot unwrap`);
    const type = pascal(name);
    const exposing = exposedBy.get(name) ?? [];
    const alpha = exposing.length > 0 && exposing.every((o) => o.descriptor.stability === "alpha");
    const since = added.has(name) ? (reachable.get(name) ?? added.get(name)) : undefined;
    const comment = jsDoc(s.description, [
      ...sinceTag(since === merged.versions[0] ? undefined : since),
      ...(alpha ? ["@stability alpha"] : []),
    ]);
    const text = s.properties
      ? `${comment}export interface ${type} ${objectBody(members(s))}\n`
      : `${comment}export type ${type} = ${tsType(s)};\n`;
    return [{ name: type, text }];
  });
}

/** Component schemas reachable from `s`. */
function refsIn(s: Schema | undefined, components: Record<string, Schema>, acc: Set<string>): void {
  if (!s) return;
  if (s.$ref) {
    const name = refName(s.$ref);
    if (!acc.has(name)) {
      acc.add(name);
      refsIn(components[name], components, acc);
    }
    return;
  }
  for (const p of Object.values(s.properties ?? {})) refsIn(p, components, acc);
  for (const o of s.oneOf ?? []) refsIn(o, components, acc);
  refsIn(s.items, components, acc);
  if (typeof s.additionalProperties === "object") refsIn(s.additionalProperties, components, acc);
}

/** For each component schema reachable from `s`, the earliest version whose payloads can hold it. */
function sinceIn(
  s: Schema | undefined,
  at: string,
  components: Record<string, Schema>,
  versions: string[],
  acc: Map<string, string>,
): void {
  if (!s) return;
  const own = s["x-since"];
  const here = own && versions.indexOf(own) > versions.indexOf(at) ? own : at;
  if (s.$ref) {
    const name = refName(s.$ref);
    const seen = acc.get(name);
    if (seen === undefined || versions.indexOf(here) < versions.indexOf(seen)) {
      acc.set(name, here);
      sinceIn(components[name], here, components, versions, acc);
    }
    return;
  }
  for (const p of Object.values(s.properties ?? {})) sinceIn(p, here, components, versions, acc);
  for (const o of s.oneOf ?? []) sinceIn(o, here, components, versions, acc);
  sinceIn(s.items, here, components, versions, acc);
  if (typeof s.additionalProperties === "object")
    sinceIn(s.additionalProperties, here, components, versions, acc);
}

function schemasFile(schemas: SchemaType[]): string {
  const body = schemas.map((s) => s.text).join("\n");
  return imports(body, [["BinarySource", "../core/files.ts"]]) + body;
}

/** Type-only imports for the names `body` uses. */
function imports(body: string, candidates: [name: string, from: string][]): string {
  const code = body.replace(/\/\*\*[\s\S]*?\*\//g, "");
  const byModule = new Map<string, string[]>();
  for (const [name, from] of candidates) {
    if (new RegExp(`\\b${name}\\b`).test(code))
      byModule.set(from, [...(byModule.get(from) ?? []), name]);
  }
  const lines = [...byModule].map(
    ([from, names]) => `import type { ${names.sort().join(", ")} } from "${from}";`,
  );
  return lines.length > 0 ? `${lines.join("\n")}\n\n` : "";
}

function schemaImports(schemas: SchemaType[]): [string, string][] {
  return schemas.map((s) => [s.name, "./schemas.ts"]);
}

function inputImports(ops: OpModel[]): [string, string][] {
  return ops.flatMap((o) => {
    const n = names(o);
    return [n.input, n.where, n.include].map((x): [string, string] => [x, "./inputs.ts"]);
  });
}

const names = (op: OpModel) => {
  const P = pascal(op.descriptor.id);
  return { input: `${P}Input`, where: `${P}Where`, include: `${P}Include` };
};

function inputTypes(op: OpModel): string {
  const n = names(op);
  const generic = op.descriptor.includes.length > 0;
  const hasWhere = op.where.length > 0 || op.descriptor.customFieldFilters;
  const out: string[] = [];
  if (generic)
    out.push(
      `export type ${n.include} = ${op.descriptor.includes.map((i) => JSON.stringify(i)).join(" | ")};\n`,
    );
  if (hasWhere) {
    const fields = op.where.map(
      (f) =>
        `${f.doc}${propertyKey(f.name)}?: Cond<string | number${f.caps.length > 0 ? `, ${f.caps.map((c) => JSON.stringify(c)).join(" | ")}` : ""}>;\n`,
    );
    if (op.descriptor.customFieldFilters) {
      fields.push(
        `${jsDoc("Custom field filters by id, e.g. `cf_12`. Operators depend on the field format.")}[field: \`cf_\${number}\`]: Cond<string | number, "not" | "range" | "text" | "presence">;\n`,
      );
    }
    out.push(`export interface ${n.where} {\n${fields.join("")}}\n`);
  }
  const fields: Member[] = [...op.fields];
  if (hasWhere && !op.list) {
    fields.push({
      key: "where",
      type: n.where,
      required: false,
      doc: "",
      schema: { type: "object" },
      description: undefined,
    });
  }
  const base = op.list ? `ListInput<${hasWhere ? n.where : "never"}>` : null;
  if (fields.length === 0)
    out.push(`export type ${n.input} = ${base ?? "Record<string, never>"};\n`);
  else {
    const params = generic ? `<I extends ${n.include} = ${n.include}>` : "";
    out.push(
      `export interface ${n.input}${params}${base ? ` extends ${base}` : ""} ${objectBody(fields)}\n`,
    );
  }
  return out.join("\n");
}

function returnType(op: OpModel, narrowed: boolean): string {
  const kind = op.descriptor.response.kind;
  if (kind === "empty") return "Promise<void>";
  if (kind === "binary") return "Promise<Download>";
  const narrows = op.narrows.map((i) => JSON.stringify(i)).join(" | ");
  const item =
    narrowed && narrows
      ? `[I] extends [never] ? ${op.item} : Included<${op.item}, Extract<I, ${narrows}>>`
      : op.item!;
  if (kind === "list") return `Listing<${item}>`;
  return `Promise<${item}${op.maybeEmpty ? " | undefined" : ""}>`;
}

function literal(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(literal).join(", ")}]`;
  if (v !== null && typeof v === "object") {
    return `{ ${Object.entries(v)
      .map(([k, x]) => `${propertyKey(k)}: ${literal(x)}`)
      .join(", ")} }`;
  }
  return JSON.stringify(v);
}

/**
 * Input, where and include types of the callable operations: the part of the operation data callers
 * import. Hidden operations keep theirs in ops.ts, next to the descriptors that stay internal.
 */
function inputsFile(ops: OpModel[], schemas: SchemaType[]): string {
  const body = ops
    .filter((o) => o.verb)
    .map(inputTypes)
    .join("\n");
  return (
    imports(body, [
      ["BinarySource", "../core/files.ts"],
      ["Cond", "../core/listing.ts"],
      ["ListInput", "../core/listing.ts"],
      ...schemaImports(schemas),
    ]) + body
  );
}

function opsFile(ops: OpModel[], schemas: SchemaType[]): string {
  const types = ops
    .filter((o) => !o.verb)
    .map(inputTypes)
    .join("\n");
  const consts = ops.map((op) => {
    const { id } = op.descriptor;
    return `export const ${id}: Op<${JSON.stringify(id)}, ${names(op).input}, ${returnType(op, false)}> = ${literal(op.descriptor)};\n`;
  });
  const registry = `export const ops: {\n${ops.map((o) => `readonly ${o.descriptor.id}: typeof ${o.descriptor.id};\n`).join("")}} = { ${ops.map((o) => o.descriptor.id).join(", ")} };\n`;
  const body = `${types}\n${consts.join("\n")}\n${registry}`;
  return (
    imports(body, [
      ["BinarySource", "../core/files.ts"],
      ["Download", "../core/files.ts"],
      ["Cond", "../core/listing.ts"],
      ["ListInput", "../core/listing.ts"],
      ["Listing", "../core/listing.ts"],
      ["Op", "../core/op.ts"],
      ...inputImports(ops.filter((o) => o.verb)),
      ...schemaImports(schemas),
    ]) + body
  );
}

function slotsFile(ops: OpModel[]): string {
  const byNamespace = new Map<string, OpModel[]>();
  for (const op of ops)
    if (op.verb) byNamespace.set(op.namespace, [...(byNamespace.get(op.namespace) ?? []), op]);
  const entries = [...byNamespace].map(
    ([ns, list]) =>
      `${propertyKey(ns)}: { ${list.map((o) => `${propertyKey(o.verb!)}: ops.${o.descriptor.id}`).join(", ")} },\n`,
  );
  return `import type { SlotTable } from "../core/op.ts";
import { ops } from "./ops.ts";

export const SLOTS: SlotTable = {\n${entries.join("")}};
`;
}

function method(op: OpModel, oldest: string): string {
  const n = names(op);
  const generic = op.descriptor.includes.length > 0;
  const optional = !op.fields.some((f) => f.required);
  const tags = [
    ...(op.docsUrl ? [`@see ${op.docsUrl}`] : []),
    ...sinceTag(op.descriptor.since === oldest ? undefined : op.descriptor.since),
    ...(op.descriptor.stability === "alpha" ? ["@stability alpha"] : []),
  ];
  const text = [op.summary, op.description].filter(Boolean).join("\n\n");
  return `${jsDoc(text, tags)}${op.verb}${generic ? `<const I extends ${n.include} = never>` : ""}(input${optional ? "?" : ""}: ${n.input}${generic ? "<I>" : ""}, options?: CallOptions): ${returnType(op, generic)};\n`;
}

function resourcesFile(ops: OpModel[], merged: Merged, schemas: SchemaType[]): string {
  const oldest = merged.versions[0]!;
  const removed = ops.filter((o) => o.descriptor.until !== null && o.verb);
  if (removed.length > 0) {
    throw new Error(
      `version gating for removed operations is not generated yet: ${removed.map((o) => o.descriptor.id).join(", ")}`,
    );
  }
  const visible = ops.filter((o) => o.verb);
  const tagOrder = merged.latest.tags.map((t) => t.name);
  const namespaces = [...new Set(visible.map((o) => o.namespace))].sort(
    (a, b) =>
      tagOrder.indexOf(visible.find((o) => o.namespace === a)!.tag) -
      tagOrder.indexOf(visible.find((o) => o.namespace === b)!.tag),
  );

  const interfaces: string[] = [];
  const groups = new Map<string, string[]>();
  for (const version of merged.versions) {
    const members: string[] = [];
    for (const ns of namespaces) {
      const list = visible.filter((o) => o.namespace === ns && o.descriptor.since === version);
      if (list.length === 0) continue;
      const tag = merged.latest.tags.find((t) => t.name === list[0]!.tag)!;
      const name =
        version === oldest
          ? `${pascal(ns)}Namespace`
          : `${pascal(ns)}Since${version.replace(".", "")}`;
      const doc = jsDoc(
        `${tag.name}. ${tag.description ?? ""}`.trim(),
        tag.externalDocs ? [`@see ${tag.externalDocs.url}`] : [],
      );
      interfaces.push(
        `${doc}export interface ${name} {\n${list.map((o) => method(o, oldest)).join("\n")}}\n`,
      );
      members.push(`${propertyKey(ns)}: ${name};\n`);
    }
    if (members.length > 0) groups.set(version, members);
  }

  const methods = namespaces.map(
    (ns) =>
      `${propertyKey(ns)}: { ${visible
        .filter((o) => o.namespace === ns)
        .map((o) => `${propertyKey(o.verb!)}: ${JSON.stringify(o.descriptor.method)}`)
        .join("; ")} };\n`,
  );
  const additions = [...groups.keys()].filter((v) => v !== oldest);
  const resources = [
    "BaseResources",
    ...additions.map(
      (v) =>
        `(AtLeast<V, ${JSON.stringify(v)}> extends true ? Additions${v.replace(".", "")} : unknown)`,
    ),
  ].join(" & ");
  const body = `${interfaces.join("\n")}
export interface BaseResources {\n${groups.get(oldest)?.join("") ?? ""}}

${additions.map((v) => `export interface Additions${v.replace(".", "")} {\n${groups.get(v)!.join("")}}\n`).join("\n")}
/** The generated namespaces available on a server declared as V. */
export type Resources<${additions.length > 0 ? "V" : "_V"} extends RedmineVersion> = ${resources};

/** The HTTP method each generated method sends, in every version. \`access\` narrows the client type by it. */
export interface HttpMethods {\n${methods.join("")}}
`;
  return (
    imports(body, [
      ["CallOptions", "../core/config.ts"],
      ["Download", "../core/files.ts"],
      ["Listing", "../core/listing.ts"],
      ["Included", "../core/op.ts"],
      ["AtLeast", "../core/version.ts"],
      ...inputImports(visible),
      ...schemaImports(schemas),
      ["RedmineVersion", "./versions.ts"],
    ]) + body
  );
}
