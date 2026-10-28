// Applies overlay.corrections to copies of the vendored specs, before the merge. A correction only adds
// properties to a `required` list, and one that no spec needs any more fails generation.

import type { Correction } from "./overlay.ts";
import type { OpenApi, Schema, SpecFile } from "./spec.ts";

export function applyCorrections(
  specs: SpecFile[],
  corrections: readonly Correction[],
): SpecFile[] {
  const out = structuredClone(specs);
  for (const { pointer, required } of corrections) {
    const needed = new Set<string>();
    for (const { file, doc } of out) {
      const schema = resolve(doc, pointer);
      if (!schema?.properties) {
        throw new Error(`overlay.corrections: ${pointer} is not an object schema in ${file}`);
      }
      for (const key of required) {
        if (!schema.properties[key]) {
          throw new Error(`overlay.corrections: ${pointer} has no property ${key} in ${file}`);
        }
        if (schema.required?.includes(key)) continue;
        (schema.required ??= []).push(key);
        needed.add(key);
      }
    }
    const fixed = required.filter((key) => !needed.has(key));
    if (fixed.length > 0) {
      throw new Error(
        `overlay.corrections: every vendored spec already requires ${fixed.join(", ")} at ${pointer}; remove them from the correction`,
      );
    }
  }
  return out;
}

function resolve(doc: OpenApi, pointer: string): Schema | undefined {
  if (!pointer.startsWith("#/")) return undefined;
  let node: unknown = doc;
  for (const segment of pointer.slice(2).split("/")) {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, key)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node as Schema;
}
