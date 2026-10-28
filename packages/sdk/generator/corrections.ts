// Applies overlay.corrections to copies of the vendored specs, then merges them. A correction only adds
// properties to a `required` list, and a property that no longer changes the merged spec fails generation.

import { mergeSpecs, type Merged } from "./merge.ts";
import type { Correction } from "./overlay.ts";
import type { OpenApi, Schema, SpecFile } from "./spec.ts";

export function mergeCorrected(
  specs: SpecFile[],
  corrections: readonly Correction[],
  resolved: Readonly<Record<string, string>>,
): Merged {
  const listed = new Set<string>();
  for (const { pointer, required } of corrections) {
    if (required.length === 0) throw new Error(`overlay.corrections: ${pointer} lists no property`);
    for (const key of required) {
      if (listed.has(`${pointer} ${key}`)) {
        throw new Error(`overlay.corrections: ${key} at ${pointer} is listed twice`);
      }
      listed.add(`${pointer} ${key}`);
    }
  }
  const merged = mergeSpecs(applyCorrections(specs, corrections), resolved);
  // The merge takes `required` from the latest spec, so a fix there leaves a correction with nothing to do
  // while an older spec still lacks the property. Merging without each property finds that, whatever the
  // merge's rule.
  const output = ({ latest, ops }: Merged) => JSON.stringify([latest, ops]);
  const expected = output(merged);
  const stale = corrections.flatMap(({ pointer, required }, i) =>
    required.flatMap((key) => {
      const without = corrections.map((correction, j) =>
        j === i ? { ...correction, required: required.filter((k) => k !== key) } : correction,
      );
      const unchanged = output(mergeSpecs(applyCorrections(specs, without), resolved)) === expected;
      return unchanged ? [`${key} at ${pointer}`] : [];
    }),
  );
  if (stale.length > 0) {
    throw new Error(
      `overlay.corrections: requiring ${stale.join(", ")} no longer changes the merged spec; remove them from the corrections`,
    );
  }
  return merged;
}

function applyCorrections(specs: SpecFile[], corrections: readonly Correction[]): SpecFile[] {
  const out = structuredClone(specs);
  for (const { pointer, required } of corrections) {
    for (const { file, doc } of out) {
      const schema = resolve(doc, pointer);
      if (!schema?.properties) {
        throw new Error(`overlay.corrections: ${pointer} is not an object schema in ${file}`);
      }
      for (const key of required) {
        if (!Object.hasOwn(schema.properties, key)) {
          throw new Error(`overlay.corrections: ${pointer} has no property ${key} in ${file}`);
        }
        if (!schema.required?.includes(key)) (schema.required ??= []).push(key);
      }
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
