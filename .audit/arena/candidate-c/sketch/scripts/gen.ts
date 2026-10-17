// packages/sdk/scripts/gen.ts — build-time generator. Node APIs allowed here, never in src/.
// `vp run gen` writes src/generated/** and spec/DRIFT.md. `vp run gen --check` fails on any diff.

/** One parsed, overlaid spec. */
export interface Edition {
  readonly version: `${number}.${number}`
  readonly tag: string // e.g. '7.0.1-r1'
  readonly operations: ReadonlyMap<string, SpecOperation>
  readonly schemas: ReadonlyMap<string, JsonSchema>
}

export interface SpecOperation {
  readonly id: string
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly path: string
  readonly tag: string
  readonly tagStatus: 'stable' | 'alpha'
  readonly tagAvailability: string // '1.4' from "Status: Alpha, Availability: 1.4"
  readonly params: readonly { name: string; in: 'path' | 'query' | 'header'; schema: JsonSchema; required: boolean; explode: boolean }[]
  readonly body: { kind: 'json'; schema: JsonSchema } | { kind: 'binary' } | null
  readonly success: { status: number; schema: JsonSchema | null }
  readonly summary: string
}

export type JsonSchema = Readonly<Record<string, unknown>>

export type DriftEntry =
  | { kind: 'operation_added' | 'operation_removed'; operation: string }
  | { kind: 'field_added' | 'field_removed'; schema: string; field: string; required: boolean }
  | { kind: 'requiredness_changed'; schema: string; field: string; nowRequired: boolean }
  | { kind: 'type_changed'; schema: string; field: string; from: string; to: string }

/** Lists spec/redmine-openapi/*.yaml, keeps the highest revision per x.y. The only source of the version list. */
export function discoverEditions(specDir: string): readonly { version: string; tag: string; file: string }[] {
  throw new Error('not implemented')
}

/** Loads YAML, applies spec/overlays/<x.y>.yaml (OpenAPI Overlay 1.0 actions), resolves $refs. */
export function loadEdition(file: string, overlay: string | null): Edition {
  throw new Error('not implemented')
}

/**
 * Builds the flat input schema: path ∪ query ∪ body top-level keys, minus `format` and header params.
 * Throws when two sources share a name; that is a design decision for a human, not something to auto-rename.
 */
export function flatInputSchema(op: SpecOperation): JsonSchema {
  throw new Error('not implemented')
}

/** Structural diff between consecutive editions. Classifies additive vs breaking for DRIFT.md. */
export function diffEditions(older: Edition, newer: Edition): readonly DriftEntry[] {
  throw new Error('not implemented')
}

/** since = tagAvailability when present in the oldest edition, else the first edition containing it. */
export function computeSince(id: string, editions: readonly Edition[]): string {
  throw new Error('not implemented')
}

export interface EmittedFile {
  readonly path: string
  readonly contents: string
}

/**
 * Emits per edition: types.ts, operations.ts, registry.ts, schemas.ts, index.ts.
 * Shared: versions.ts (VERSIONS, SPEC_TAGS, AVAILABILITY, CommonOperations), versions.ts and
 * versions-schemas.ts entry bodies, spec/DRIFT.md.
 * OpenAPI → TS: nullable → `| null`; oneOf → union; enum → literal union; binary → BinaryBody;
 * additionalProperties → index signature; `required` → non-optional. Field `@since` from diffEditions.
 */
export function emit(editions: readonly Edition[]): readonly EmittedFile[] {
  throw new Error('not implemented')
}

export async function main(argv: readonly string[]): Promise<void> {
  // TODO: editions = discoverEditions().map(loadEdition); files = emit(editions)
  //       --check: compare against disk, print a unified diff, exit 1 on any mismatch
  //       else: write files, run oxfmt on src/generated
  throw new Error('not implemented')
}
