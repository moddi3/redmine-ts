// Turns merged spec operations into Op descriptors, canonical flat inputs and namespace slots.

import type {
  FilterSpec,
  HttpMethod,
  QueryStyle,
  RequestBody,
  ResponseShape,
  Safety,
  Stability,
} from "../src/core/op.ts";
import type { Merged, MergedOp } from "./merge.ts";
import type { Overlay } from "./overlay.ts";
import { deref, refName, type OpenApi, type Param, type Schema } from "./spec.ts";
import { camel, jsDoc, members, pascal, sinceTag, tsType, type Member } from "./typescript.ts";

/** Params the transport and the pager own. They never appear in an input. */
const TRANSPORT_QUERY = new Set(["offset", "limit", "nometa", "format"]);

/** Keys ListInput contributes to every list input. The spec's own `sort` param is ListInput.sort. */
const LIST_KEYS = ["where", "sort", "pageSize", "paging"];

type Cap = "not" | "range" | "text" | "presence";

const CAPS: Record<Cap, readonly string[]> = {
  not: ["!"],
  range: [">=", "<=", "><"],
  text: ["~", "!~", "^", "$"],
  presence: ["*", "!*"],
};

export interface Filter {
  name: string;
  spec: FilterSpec;
  caps: Cap[];
  doc: string;
  description: string | undefined;
}

export interface Descriptor {
  id: string;
  method: HttpMethod;
  path: string;
  pathParams: string[];
  query: Record<string, QueryStyle>;
  filters: Record<string, FilterSpec>;
  customFieldFilters: boolean;
  body: RequestBody;
  response: ResponseShape;
  includes: string[];
  since: string;
  until: string | null;
  safety: Safety;
  stability: Stability;
}

export interface OpModel {
  descriptor: Descriptor;
  tag: string;
  namespace: string;
  /** Null when hidden from namespaces; the operation stays in the registry. */
  verb: string | null;
  hidden: string | null;
  /** Path params, non-filter query keys and body fields. An `include` field is typed `readonly I[]`. */
  fields: Member[];
  where: Filter[];
  list: boolean;
  /** The spec's `sort` param of a list, which ListInput.sort replaces in `fields`. */
  sort: Member | null;
  /** The returned item, or null for empty and binary responses. */
  item: string | null;
  /** The returned item's schema as the spec writes it (a $ref or inline), or null for empty and binary responses. */
  itemSpec: Schema | null;
  /** Include values that become required on the item when requested. */
  narrows: string[];
  /** A 204 can answer instead of the body. */
  maybeEmpty: boolean;
  summary: string | undefined;
  description: string | undefined;
  docsUrl: string | undefined;
}

export interface Operations {
  ops: OpModel[];
  /** Include values that name no property of the returned item, so they cannot narrow. */
  includeMisses: string[];
}

export function analyzeOperations(merged: Merged, overlay: Overlay): Operations {
  const doc = merged.latest;
  const includeMisses: string[] = [];
  const ops = merged.ops.map((m) => analyze(m, doc, overlay, includeMisses));
  checkOverlay(ops, doc, overlay);
  const slots = new Map<string, string>();
  for (const op of ops) {
    if (!op.verb) continue;
    const slot = `${op.namespace}.${op.verb}`;
    const taken = slots.get(slot);
    if (taken)
      throw new Error(
        `${slot} is both ${taken} and ${op.descriptor.id}; name one in overlay.verbs`,
      );
    slots.set(slot, op.descriptor.id);
  }
  return { ops, includeMisses };
}

function analyze(m: MergedOp, doc: OpenApi, overlay: Overlay, includeMisses: string[]): OpModel {
  const { op } = m;
  const id = op.operationId;
  const fail = (msg: string): never => {
    throw new Error(`${id}: ${msg}`);
  };
  const params = op.parameters as Param[];
  const fields: Member[] = [];
  const field = (p: Param, key: string, type: string, schema: Schema = p.schema) =>
    fields.push({
      key,
      type,
      required: p.required ?? false,
      doc: jsDoc(p.description, sinceTag(p["x-since"])),
      schema,
      description: p.description,
    });

  const pathParams = params.filter((p) => p.in === "path" && p.name !== "format");
  for (const p of pathParams) field(p, p.name, tsType(p.schema));
  const path = m.path.slice(1).replace(".{format}", ".json");
  const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]);
  if (placeholders.join() !== pathParams.map((p) => p.name).join()) fail(`path ${path} vs params`);

  const query: Record<string, QueryStyle> = {};
  const where: Filter[] = [];
  let customFieldFilters = false;
  let includes: string[] = [];
  for (const p of params.filter((q) => q.in === "query" && !TRANSPORT_QUERY.has(q.name))) {
    const operators = /^Operators: (.*)$/m.exec(p.description ?? "")?.[1];
    if (p.name === "cf_x" && p.schema.type === "object") {
      customFieldFilters = true;
    } else if (operators) {
      const codes = [...operators.matchAll(/`([^`]+)`/g)].map((x) => x[1]!);
      const words = Object.fromEntries(
        Object.entries(overlay.filterWords[p.name] ?? {}).filter(([, code]) =>
          codes.includes(code),
        ),
      );
      const caps = (Object.keys(CAPS) as Cap[]).filter((c) =>
        CAPS[c].some((code) => codes.includes(code)),
      );
      where.push({
        name: p.name,
        spec: Object.keys(words).length > 0 ? { ops: codes, words } : { ops: codes },
        caps,
        doc: jsDoc(p.description, sinceTag(p["x-since"])),
        description: p.description,
      });
    } else if (p.name === "include") {
      includes = (p.schema.items?.enum ?? []).map(String);
      query.include = "csv";
      field(p, "include", "readonly I[]", {
        type: "array",
        items: { type: "string", enum: includes },
      });
    } else if (p.name.endsWith("[]")) {
      const key = p.name.slice(0, -2);
      query[key] = "brackets";
      field(p, key, `readonly ${tsType(p.schema.items ?? {})}[]`);
    } else {
      query[p.name] = "scalar";
      field(p, p.name, tsType(p.schema));
    }
  }

  let body: RequestBody = null;
  const content = op.requestBody?.content ?? {};
  if (content["application/octet-stream"]) {
    body = { kind: "binary", key: "file" };
    fields.push({
      key: "file",
      type: "BinarySource",
      required: true,
      doc: "",
      schema: { type: "string", format: "binary" },
      description: undefined,
    });
  } else if (content["application/json"]) {
    const schema = content["application/json"].schema ?? fail("json body without a schema");
    const top = Object.entries(schema.properties ?? {});
    const envelopes = top.filter(([, s]) => s.type === "object" && s.properties);
    if (envelopes.length > 1)
      fail(`ambiguous body envelope ${envelopes.map(([k]) => k).join(", ")}`);
    const envelope = envelopes[0];
    const siblings = top.filter(([k]) => k !== envelope?.[0]).map(([k]) => k);
    body = { kind: "json", envelope: envelope?.[0] ?? null, siblings };
    if (envelope) fields.push(...members(envelope[1]));
    fields.push(...members(schema).filter((f) => siblings.includes(f.key)));
  } else if (Object.keys(content).length > 0) {
    fail(`unsupported request content ${Object.keys(content).join(", ")}`);
  }

  const analyzed = analyzeResponse(m, doc, fail);
  const { item, itemSchema, maybeEmpty } = analyzed;
  const keyset = overlay.keyset[id];
  const response: ResponseShape =
    analyzed.response.kind === "list" && keyset
      ? { ...analyzed.response, keyset: { param: keyset } }
      : analyzed.response;
  const list = response.kind === "list";
  if (itemSchema) {
    for (const inc of includes) {
      if (!itemSchema.properties?.[inc])
        includeMisses.push(`${id}: include=${inc} names no property of ${item}`);
    }
  }

  const keys = fields.map((f) => f.key).filter((k) => !(list && k === "sort"));
  if (list) keys.push(...LIST_KEYS);
  else if (where.length > 0 || customFieldFilters) keys.push("where");
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) fail(`input key collision on "${k}"`);
    seen.add(k);
  }

  const tag = doc.tags.find((t) => t.name === op.tags[0]) ?? fail(`unknown tag ${op.tags[0]}`);
  const method = m.method.toUpperCase() as HttpMethod;
  const hidden = overlay.scopedDuplicates[id]
    ? `scoped duplicate of ${overlay.scopedDuplicates[id].sibling}`
    : overlay.extras.includes(id)
      ? "replaced by a hand-written extra"
      : null;
  const namespace = overlay.namespaces[tag.name] ?? camel(tag.name);

  return {
    descriptor: {
      id,
      method,
      path,
      pathParams: pathParams.map((p) => p.name),
      query,
      filters: Object.fromEntries(where.map((f) => [f.name, f.spec])),
      customFieldFilters,
      body,
      response,
      includes,
      since: m.since,
      until: m.until,
      safety:
        overlay.safety[id] ??
        (method === "GET" ? "read" : method === "DELETE" ? "idempotent" : "write"),
      stability: /Status: Stable\b/.test(tag.description ?? "") ? "stable" : "alpha",
    },
    tag: tag.name,
    namespace,
    verb: hidden ? null : (overlay.verbs[id] ?? deriveVerb(id, method, list, tag.name)),
    hidden,
    fields: fields.filter((f) => !(list && f.key === "sort")),
    where,
    list,
    sort: (list && fields.find((f) => f.key === "sort")) || null,
    item,
    itemSpec: analyzed.raw,
    narrows: includes.filter(
      (inc) => itemSchema?.properties?.[inc] !== undefined && !overlay.sparseIncludes.includes(inc),
    ),
    maybeEmpty,
    summary: op.summary,
    description: op.description,
    docsUrl: op.externalDocs?.url,
  };
}

function analyzeResponse(
  m: MergedOp,
  doc: OpenApi,
  fail: (msg: string) => never,
): {
  response: ResponseShape;
  item: string | null;
  itemSchema: Schema | null;
  raw: Schema | null;
  maybeEmpty: boolean;
} {
  const success = Object.values(m.op.responses).map((r) => deref(doc, r));
  const withBody = success.filter((r) => Object.keys(r.content ?? {}).length > 0);
  const none = { item: null, itemSchema: null, raw: null, maybeEmpty: false };
  if (withBody.length === 0) return { response: { kind: "empty" }, ...none };
  if (withBody.length > 1) fail("several success bodies");
  const content = withBody[0]!.content!;
  const json = content["application/json"];
  if (!json?.schema) return { response: { kind: "binary" }, ...none };
  const maybeEmpty = success.length > withBody.length;

  const wrapper = json.schema.$ref ? refName(json.schema.$ref) : null;
  const root = deref<Schema>(doc, json.schema);
  const props = Object.entries(root.properties ?? {});
  const arrays = props.filter(([, s]) => s.type === "array");
  const resolve = (s: Schema) => (s.$ref ? deref<Schema>(doc, s) : s);
  if (arrays.length === 1) {
    const [key, s] = arrays[0]!;
    const names = new Set(props.map(([k]) => k));
    const paged = names.has("total_count") && names.has("offset") && names.has("limit");
    if (maybeEmpty) fail("a list that may answer 204");
    return {
      response: { kind: "list", items: key, paged },
      item: tsType(s.items ?? {}),
      itemSchema: resolve(s.items ?? {}),
      raw: s.items ?? {},
      maybeEmpty,
    };
  }
  if (props.length === 1) {
    const [key, s] = props[0]!;
    const inner = resolve(s);
    if (inner.type === "object") {
      return {
        response: { kind: "item", unwrap: key },
        item: wrapper ? pascal(wrapper) : tsType(s),
        itemSchema: inner,
        raw: s,
        maybeEmpty,
      };
    }
  }
  return fail(`unrecognized response shape with ${props.map(([k]) => k).join(", ")}`);
}

/** CRUD verbs for get/create/update/delete operations, otherwise the operationId without its resource noun. */
function deriveVerb(id: string, method: HttpMethod, list: boolean, tag: string): string {
  if (/^(get|create|update|delete)[A-Z]/.test(id)) {
    if (method === "GET") return list ? "list" : "get";
    if (method === "POST") return "create";
    if (method === "PUT" || method === "PATCH") return "update";
    return "delete";
  }
  const noun = pascal(tag.split(" ").at(-1)!).replace(/ies$/, "y").replace(/s$/, "");
  return id.replace(new RegExp(`(To|From|Of|For)?${noun}s?$`), "") || id;
}

function checkOverlay(ops: OpModel[], doc: OpenApi, overlay: Overlay): void {
  const byId = new Map(ops.map((o) => [o.descriptor.id, o]));
  const need = (where: string, id: string): OpModel => {
    const op = byId.get(id);
    if (!op) throw new Error(`overlay.${where} names unknown operation ${id}`);
    return op;
  };
  for (const tag of Object.keys(overlay.namespaces)) {
    if (!doc.tags.some((t) => t.name === tag))
      throw new Error(`overlay.namespaces names unknown tag ${tag}`);
  }
  for (const [id, verb] of Object.entries(overlay.verbs)) {
    if (!need("verbs", id).verb) throw new Error(`overlay.verbs names hidden operation ${id}`);
    if (!/^[a-z][A-Za-z]*$/.test(verb))
      throw new Error(`overlay.verbs.${id} is not a camelCase verb`);
  }
  for (const [id, { sibling, key }] of Object.entries(overlay.scopedDuplicates)) {
    need("scopedDuplicates", id);
    const s = need("scopedDuplicates", sibling);
    if (!s.verb)
      throw new Error(`overlay.scopedDuplicates.${id}: sibling ${sibling} is hidden too`);
    if (!s.fields.some((f) => f.key === key) && !s.where.some((f) => f.name === key)) {
      throw new Error(
        `overlay.scopedDuplicates.${id}: ${sibling} takes no "${key}", so hiding ${id} loses it`,
      );
    }
  }
  for (const id of overlay.extras) need("extras", id);
  for (const [id, param] of Object.entries(overlay.keyset)) {
    const op = need("keyset", id);
    if (op.descriptor.response.kind !== "list" || !op.descriptor.response.paged) {
      throw new Error(`overlay.keyset.${id} is not a paged list`);
    }
    if (!op.descriptor.filters[param]) throw new Error(`overlay.keyset.${id}: no filter ${param}`);
  }
  for (const [name, words] of Object.entries(overlay.filterWords)) {
    const specs = ops.flatMap((o) => o.where.filter((f) => f.name === name).map((f) => f.spec));
    if (specs.length === 0) throw new Error(`overlay.filterWords names unknown filter ${name}`);
    for (const [word, code] of Object.entries(words)) {
      if (!specs.some((s) => s.ops.includes(code))) {
        throw new Error(`overlay.filterWords.${name}.${word}: no ${name} filter documents ${code}`);
      }
    }
  }
  for (const id of Object.keys(overlay.safety)) need("safety", id);
  for (const inc of overlay.sparseIncludes) {
    if (!ops.some((o) => o.descriptor.includes.includes(inc)))
      throw new Error(`overlay.sparseIncludes names ${inc}, which no operation includes`);
  }
}
