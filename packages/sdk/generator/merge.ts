// Superset merge across vendored versions. Shapes come from the latest spec; older specs only decide
// `since`, `until` and whether a property may be required. Anything that is not an addition is a
// conflict, and an unresolved conflict fails generation.

import {
  deref,
  escapePointer,
  operations,
  type Content,
  type OpenApi,
  type Operation,
  type Param,
  type Response,
  type Schema,
  type SpecFile,
} from "./spec.ts";

export interface Drift {
  addedOps: { id: string; since: string }[];
  removedOps: { id: string; until: string }[];
  addedSchemas: { name: string; since: string }[];
  /** JSON pointers into the latest spec. */
  addedProperties: { pointer: string; since: string }[];
  conflicts: string[];
  resolved: { pointer: string; reason: string }[];
}

export interface MergedOp {
  path: string;
  method: string;
  /** The newest version's operation with parameters dereferenced and `x-since` annotations. */
  op: Operation;
  since: string;
  until: string | null;
}

export interface Merged {
  versions: string[];
  /** The latest document. Component schemas carry `x-since` and requiredness valid for every version. */
  latest: OpenApi;
  ops: MergedOp[];
  drift: Drift;
}

interface At<T> {
  version: string;
  node: T;
}

export function mergeSpecs(specs: SpecFile[], resolved: Readonly<Record<string, string>>): Merged {
  const versions = specs.map((s) => s.version);
  const newest = specs.at(-1)!;
  const drift: Drift = {
    addedOps: [],
    removedOps: [],
    addedSchemas: [],
    addedProperties: [],
    conflicts: [],
    resolved: [],
  };
  const conflicts: { pointer: string; detail: string }[] = [];
  const ctx: Ctx = {
    conflict: (pointer, detail) => conflicts.push({ pointer, detail }),
    added: (pointer, since) => drift.addedProperties.push({ pointer, since }),
  };

  const schemas: Record<string, Schema> = {};
  for (const name of Object.keys(newest.doc.components.schemas)) {
    const having = specs.flatMap((s) => {
      const n = s.doc.components.schemas[name];
      return n ? [{ version: s.version, node: n }] : [];
    });
    if (having.length < specs.length) drift.addedSchemas.push({ name, since: having[0]!.version });
    schemas[name] = mergeSchema(`#/components/schemas/${escapePointer(name)}`, having, ctx);
  }
  for (const s of specs) {
    for (const name of Object.keys(s.doc.components.schemas)) {
      if (!(name in schemas))
        ctx.conflict(
          `#/components/schemas/${escapePointer(name)}`,
          `schema removed after ${s.version}`,
        );
    }
  }

  const byId = new Map<string, At<{ path: string; method: string; op: Operation }>[]>();
  for (const s of specs) {
    for (const entry of operations(s.doc)) {
      const op = {
        ...entry.op,
        parameters: (entry.op.parameters ?? []).map((p) => deref<Param>(s.doc, p)),
      };
      const list = byId.get(op.operationId) ?? [];
      list.push({ version: s.version, node: { ...entry, op } });
      byId.set(op.operationId, list);
    }
  }

  const ops: MergedOp[] = [];
  for (const [id, having] of byId) {
    const since = having[0]!.version;
    const last = having.at(-1)!;
    const until = last.version === newest.version ? null : last.version;
    if (since !== versions[0]) drift.addedOps.push({ id, since });
    if (until) drift.removedOps.push({ id, until });
    for (const [i, h] of having.entries()) {
      if (h.version !== versions[versions.indexOf(since) + i]) {
        ctx.conflict(
          `#/paths/${escapePointer(last.node.path)}/${last.node.method}`,
          `${id} is missing in a version between ${since} and ${last.version}`,
        );
      }
    }
    ops.push({ ...last.node, op: mergeOperation(having, specs, ctx), since, until });
  }

  const order = [...operations(newest.doc)].map((e) => e.op.operationId);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  ops.sort((a, b) => rank(a.op.operationId) - rank(b.op.operationId));

  for (const { pointer, detail } of conflicts) {
    const reason = resolved[pointer];
    if (reason === undefined) drift.conflicts.push(`${pointer}: ${detail}`);
    else if (!drift.resolved.some((r) => r.pointer === pointer))
      drift.resolved.push({ pointer, reason });
  }
  for (const pointer of Object.keys(resolved)) {
    if (!conflicts.some((c) => c.pointer === pointer)) {
      throw new Error(`overlay.resolved names ${pointer}, which is not a conflict`);
    }
  }
  if (drift.conflicts.length > 0) {
    throw new Error(
      `non-additive spec drift; resolve each in generator/overlay.ts#resolved:\n  ${drift.conflicts.join("\n  ")}`,
    );
  }

  return {
    versions,
    latest: { ...newest.doc, components: { ...newest.doc.components, schemas } },
    ops,
    drift,
  };
}

interface Ctx {
  conflict(pointer: string, detail: string): void;
  added(pointer: string, since: string): void;
}

function shape(s: Schema): string {
  const additional =
    typeof s.additionalProperties === "object" ? "schema" : (s.additionalProperties ?? null);
  return JSON.stringify([
    s.$ref,
    s.type,
    s.format,
    Boolean(s.nullable),
    s.enum,
    s.oneOf?.length,
    additional,
  ]);
}

/** `nodes` holds the same logical schema in every version that has it, oldest first. */
function mergeSchema(pointer: string, nodes: At<Schema>[], ctx: Ctx): Schema {
  const latest = nodes.at(-1)!.node;
  for (const { version, node } of nodes.slice(0, -1)) {
    if (shape(node) !== shape(latest))
      ctx.conflict(pointer, `${version} ${shape(node)} became ${shape(latest)}`);
  }
  const out: Schema = { ...latest };
  if (latest.properties) {
    out.properties = {};
    for (const key of Object.keys(latest.properties)) {
      const at = `${pointer}/properties/${escapePointer(key)}`;
      const having = nodes.flatMap(({ version, node }) => {
        const p = node.properties?.[key];
        return p ? [{ version, node: p }] : [];
      });
      const merged = mergeSchema(at, having, ctx);
      if (having.length < nodes.length) {
        const since = having[0]!.version;
        const firstIndex = nodes.findIndex((n) => n.version === since);
        if (nodes.slice(firstIndex).some((n) => !n.node.properties?.[key])) {
          ctx.conflict(at, `property disappears after ${since} and comes back`);
        }
        merged["x-since"] = since;
        ctx.added(at, since);
      }
      out.properties[key] = merged;
    }
    out.required = (latest.required ?? []).filter((key) =>
      nodes.every((n) => n.node.properties?.[key]),
    );
  }
  for (const { version, node } of nodes) {
    for (const key of Object.keys(node.properties ?? {})) {
      if (!latest.properties?.[key]) {
        ctx.conflict(
          `${pointer}/properties/${escapePointer(key)}`,
          `property removed after ${version}`,
        );
      }
    }
  }
  if (latest.items) {
    out.items = mergeSchema(
      `${pointer}/items`,
      present(nodes, (n) => n.items),
      ctx,
    );
  }
  if (latest.oneOf) {
    out.oneOf = latest.oneOf.map((_, i) =>
      mergeSchema(
        `${pointer}/oneOf/${i}`,
        present(nodes, (n) => n.oneOf?.[i]),
        ctx,
      ),
    );
  }
  if (typeof latest.additionalProperties === "object") {
    out.additionalProperties = mergeSchema(
      `${pointer}/additionalProperties`,
      present(nodes, (n) =>
        typeof n.additionalProperties === "object" ? n.additionalProperties : undefined,
      ),
      ctx,
    );
  }
  return out;
}

function present<T>(nodes: At<Schema>[], pick: (s: Schema) => T | undefined): At<T>[] {
  return nodes.flatMap(({ version, node }) => {
    const n = pick(node);
    return n === undefined ? [] : [{ version, node: n }];
  });
}

function mergeOperation(
  having: At<{ path: string; method: string; op: Operation }>[],
  specs: SpecFile[],
  ctx: Ctx,
): Operation {
  const last = having.at(-1)!.node;
  const pointer = `#/paths/${escapePointer(last.path)}/${last.method}`;
  for (const { version, node } of having.slice(0, -1)) {
    if (node.path !== last.path || node.method !== last.method) {
      ctx.conflict(pointer, `${version} served it at ${node.method.toUpperCase()} ${node.path}`);
    }
  }
  const docOf = (version: string) => specs.find((s) => s.version === version)!.doc;

  const params = (last.op.parameters as Param[]).map((param) => {
    const at = `${pointer}/parameters/${escapePointer(param.name)}`;
    const versions = having.flatMap(({ version, node }) => {
      const p = (node.op.parameters as Param[]).find(
        (q) => q.name === param.name && q.in === param.in,
      );
      return p ? [{ version, node: p }] : [];
    });
    const merged: Param = {
      ...param,
      schema: mergeSchema(
        `${at}/schema`,
        versions.map(({ version, node }) => ({ version, node: node.schema })),
        ctx,
      ),
    };
    if (versions.length < having.length) {
      merged["x-since"] = versions[0]!.version;
      merged.required = false;
      ctx.added(at, versions[0]!.version);
    }
    return merged;
  });
  for (const { version, node } of having) {
    for (const p of node.op.parameters as Param[]) {
      if (!params.some((q) => q.name === p.name && q.in === p.in)) {
        ctx.conflict(
          `${pointer}/parameters/${escapePointer(p.name)}`,
          `parameter removed after ${version}`,
        );
      }
    }
  }

  const contents = (
    pick: (op: Operation, doc: OpenApi) => Record<string, Content> | undefined,
    at: string,
  ) => {
    const latestContent = pick(last.op, docOf(having.at(-1)!.version)) ?? {};
    const out: Record<string, Content> = {};
    for (const { version, node } of having) {
      const c = pick(node.op, docOf(version)) ?? {};
      if (Object.keys(c).sort().join() !== Object.keys(latestContent).sort().join()) {
        ctx.conflict(at, `${version} content types ${Object.keys(c).join(", ") || "none"}`);
      }
    }
    for (const [type, { schema }] of Object.entries(latestContent)) {
      if (!schema) {
        out[type] = {};
        continue;
      }
      const versions = having.flatMap(({ version, node }) => {
        const s = pick(node.op, docOf(version))?.[type]?.schema;
        return s ? [{ version, node: s }] : [];
      });
      out[type] = {
        schema: mergeSchema(`${at}/content/${escapePointer(type)}/schema`, versions, ctx),
      };
    }
    return out;
  };

  const success = (op: Operation) => Object.keys(op.responses).filter((c) => c.startsWith("2"));
  const responses: Record<string, Response> = {};
  for (const code of success(last.op)) {
    const at = `${pointer}/responses/${code}`;
    responses[code] = {
      content: contents((op, doc) => {
        const r = op.responses[code];
        return r && deref<Response>(doc, r).content;
      }, at),
    };
  }
  for (const { version, node } of having) {
    if (success(node.op).join() !== success(last.op).join()) {
      ctx.conflict(
        `${pointer}/responses`,
        `${version} success codes ${success(node.op).join(", ")}`,
      );
    }
  }

  const op: Operation = { ...last.op, parameters: params, responses };
  if (last.op.requestBody) {
    op.requestBody = { content: contents((o) => o.requestBody?.content, `${pointer}/requestBody`) };
  } else if (having.some(({ node }) => node.op.requestBody)) {
    ctx.conflict(`${pointer}/requestBody`, "request body removed");
  }
  return op;
}
