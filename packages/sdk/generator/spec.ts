import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/** The OpenAPI 3.0 subset the vendored Redmine specs use. */
export interface Schema {
  type?: string;
  format?: string;
  nullable?: boolean;
  enum?: readonly (string | number | boolean)[];
  $ref?: string;
  oneOf?: Schema[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: Schema | boolean;
  description?: string;
  /** Set by the merge: first version whose schema has this property. */
  "x-since"?: string;
}

export interface Param {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  description?: string;
  schema: Schema;
  "x-since"?: string;
}

interface Ref {
  $ref: string;
}

export interface Content {
  schema?: Schema;
}

export interface Response {
  description?: string;
  content?: Record<string, Content>;
}

export interface Operation {
  operationId: string;
  tags: [string];
  summary?: string;
  description?: string;
  externalDocs?: { url: string };
  parameters?: (Param | Ref)[];
  requestBody?: { content: Record<string, Content> };
  responses: Record<string, Response | Ref>;
}

export interface Tag {
  name: string;
  description?: string;
  externalDocs?: { url: string };
}

export interface OpenApi {
  openapi: string;
  tags: Tag[];
  paths: Record<string, Record<string, Operation>>;
  components: {
    parameters: Record<string, Param>;
    responses: Record<string, Response>;
    schemas: Record<string, Schema>;
  };
}

/** One vendored spec: `7.0.1-r1.yaml` is version "7.0". */
export interface SpecFile {
  file: string;
  version: string;
  doc: OpenApi;
}

const FILE = /^(\d+)\.(\d+)\.(\d+)-r(\d+)\.ya?ml$/;

/** Oldest first, one file per x.y: the latest patch and revision wins. */
export function loadSpecs(dir: string): SpecFile[] {
  const newest = new Map<string, { file: string; rank: [number, number] }>();
  for (const file of readdirSync(dir)) {
    const m = FILE.exec(file);
    if (!m) continue;
    const version = `${m[1]}.${m[2]}`;
    const rank: [number, number] = [Number(m[3]), Number(m[4])];
    const seen = newest.get(version);
    if (!seen || rank[0] > seen.rank[0] || (rank[0] === seen.rank[0] && rank[1] > seen.rank[1])) {
      newest.set(version, { file, rank });
    }
  }
  if (newest.size === 0) throw new Error(`no spec files matching x.y.z-rN.yaml in ${dir}`);
  return [...newest.entries()]
    .sort(([a], [b]) => compareVersions(a, b))
    .map(([version, { file }]) => ({
      file,
      version,
      doc: parseSpec(file, readFileSync(join(dir, file), "utf8")),
    }));
}

export function parseSpec(file: string, text: string): OpenApi {
  const doc: unknown = parse(text);
  if (
    typeof doc !== "object" ||
    doc === null ||
    !("openapi" in doc) ||
    !String(doc.openapi).startsWith("3.0") ||
    !("paths" in doc) ||
    !("components" in doc)
  ) {
    throw new Error(`${file}: not an OpenAPI 3.0 document`);
  }
  return doc as OpenApi;
}

export function compareVersions(a: string, b: string): number {
  const [am = 0, an = 0] = a.split(".").map(Number);
  const [bm = 0, bn = 0] = b.split(".").map(Number);
  return am - bm || an - bn;
}

export function isRef(x: object): x is Ref {
  return "$ref" in x && typeof x.$ref === "string";
}

export function refName(ref: string): string {
  return ref.slice(ref.lastIndexOf("/") + 1);
}

/** Resolves `#/components/<kind>/<name>` references. */
export function deref<T>(doc: OpenApi, x: T | Ref): T {
  if (!isRef(x as object)) return x as T;
  const [, , kind, name] = (x as Ref).$ref.split("/");
  const found = (doc.components as Record<string, Record<string, unknown>>)[kind!]?.[name!];
  if (!found) throw new Error(`unresolved $ref ${(x as Ref).$ref}`);
  return found as T;
}

export function escapePointer(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export function* operations(
  doc: OpenApi,
): Generator<{ path: string; method: string; op: Operation }> {
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (op) yield { path, method, op };
    }
  }
}
