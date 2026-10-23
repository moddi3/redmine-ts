import { refName, type Schema } from "./spec.ts";

export function pascal(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
}

export function camel(name: string): string {
  const p = pascal(name);
  return p[0]!.toLowerCase() + p.slice(1);
}

export function propertyKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

export function jsDoc(text: string | undefined, tags: readonly string[] = []): string {
  const lines = [...(text?.trim().split("\n") ?? []), ...tags].map((l) =>
    l.trimEnd().replaceAll("*/", "*\\/"),
  );
  if (lines.length === 0) return "";
  return `/**\n${lines.map((l) => (l ? ` * ${l}` : " *")).join("\n")}\n */\n`;
}

/** The `@since` tag for a property, parameter or operation newer than the oldest vendored version. */
export function sinceTag(since: string | undefined): string[] {
  return since ? [`@since ${since}`] : [];
}

interface Rendered {
  text: string;
  union: boolean;
}

export function tsType(s: Schema): string {
  return render(s).text;
}

function render(s: Schema): Rendered {
  let r: Rendered;
  if (s.$ref) r = { text: pascal(refName(s.$ref)), union: false };
  else if (s.oneOf)
    r = { text: s.oneOf.map((o) => tsType(o)).join(" | "), union: s.oneOf.length > 1 };
  else if (s.enum)
    r = { text: s.enum.map((v) => JSON.stringify(v)).join(" | "), union: s.enum.length > 1 };
  else if (s.type === "string")
    r = { text: s.format === "binary" ? "BinarySource" : "string", union: false };
  else if (s.type === "integer" || s.type === "number") r = { text: "number", union: false };
  else if (s.type === "boolean") r = { text: "boolean", union: false };
  else if (s.type === "array") {
    const item = render(s.items ?? {});
    r = { text: item.union ? `(${item.text})[]` : `${item.text}[]`, union: false };
  } else if (s.properties) r = { text: objectType(s), union: false };
  else if (typeof s.additionalProperties === "object") {
    r = { text: `Record<string, ${tsType(s.additionalProperties)}>`, union: false };
  } else if (s.type === "object") r = { text: "Record<string, unknown>", union: false };
  else r = { text: "unknown", union: false };
  if (s.nullable && !/\bnull\b/.test(r.text)) r = { text: `${r.text} | null`, union: true };
  return r;
}

export interface Member {
  key: string;
  type: string;
  required: boolean;
  doc: string;
  /** The spec schema behind `type`, for the catalog's JSON Schemas. */
  schema: Schema;
  description: string | undefined;
}

export function members(s: Schema): Member[] {
  return Object.entries(s.properties ?? {}).map(([key, p]) => ({
    key,
    type: tsType(p),
    required: s.required?.includes(key) ?? false,
    doc: jsDoc(p.description, sinceTag(p["x-since"])),
    schema: p,
    description: p.description,
  }));
}

export function objectBody(list: readonly Member[]): string {
  return `{\n${list.map((m) => `${m.doc}${propertyKey(m.key)}${m.required ? "" : "?"}: ${m.type};\n`).join("")}}`;
}

function objectType(s: Schema): string {
  return objectBody(members(s));
}
