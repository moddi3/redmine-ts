// Applies overlay.optional, then merges the specs. An entry drops one property from the `required` list of
// its schema in every spec that has it. An entry that no longer changes the merged spec, a typo included,
// fails generation.

import { mergeSpecs, type Merged } from "./merge.ts";
import type { OpenApi, Schema, SpecFile } from "./spec.ts";

const PROPERTY = /^(#\/components\/schemas\/[^/]+(?:\/properties\/[^/]+)*)\/properties\/([^/]+)$/;

export function mergeWithOptional(
  specs: SpecFile[],
  optional: Readonly<Record<string, string>>,
  resolved: Readonly<Record<string, string>>,
): Merged {
  const pointers = Object.keys(optional);
  const output = ({ latest, ops }: Merged) => JSON.stringify([latest, ops]);
  const merged = mergeSpecs(relax(specs, pointers), resolved);
  const expected = output(merged);
  const stale = pointers.filter(
    (pointer) =>
      output(
        mergeSpecs(
          relax(
            specs,
            pointers.filter((p) => p !== pointer),
          ),
          resolved,
        ),
      ) === expected,
  );
  if (stale.length > 0) {
    throw new Error(
      `overlay.optional: ${stale.join(", ")} no longer changes the merged spec; remove it`,
    );
  }
  return merged;
}

function relax(specs: SpecFile[], pointers: readonly string[]): SpecFile[] {
  const out = structuredClone(specs);
  for (const pointer of pointers) {
    const [, parent, key] = PROPERTY.exec(pointer) ?? [];
    if (parent === undefined || key === undefined) {
      throw new Error(`overlay.optional: ${pointer} does not name a schema property`);
    }
    for (const { doc } of out) {
      const schema = resolve(doc, parent);
      if (schema?.required) schema.required = schema.required.filter((k) => k !== key);
    }
  }
  return out;
}

function resolve(doc: OpenApi, pointer: string): Schema | undefined {
  let node: unknown = doc;
  for (const segment of pointer.slice(2).split("/")) {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, key)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node as Schema;
}
