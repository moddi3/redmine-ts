// packages/sdk/generator/. Build-time only, never shipped, run by `vp run gen` (and `vp run gen:check` in CI).
// Pipeline is four pure functions and one file writer. No network. Output is committed to src/generated/.
//
//   spec/redmine-openapi/*.yaml ──parse──▶ SpecDoc[] ──merge──▶ Merged ──normalize(overlay)──▶ Model ──emit──▶ src/generated/*.ts
//
// Module map:
//   generator/parse.ts     yaml -> typed subset of OpenAPI 3.0.3 (only the features the specs use: nullable, oneOf, enum, binary, additionalProperties)
//   generator/merge.ts     the version strategy, as a pure function (below)
//   generator/overlay.ts   HAND-WRITTEN decisions the spec cannot express (below). Validated: every key must exist in the merged spec.
//   generator/model.ts     Merged + overlay -> Model: naming, slots, canonical inputs, filter tables, keyset, safety
//   generator/emit/*.ts    versions.ts schemas.ts ops.ts slots.ts resources.ts catalog.ts (one function each, string templates)
//   generator/run.ts       writes files via oxfmt; `--check` regenerates in memory and fails on any byte of diff

import type { Op } from "./op.ts";

// ---------- merge: one superset out of N pinned specs ----------

export interface SpecDoc {
  version: string; // "6.1" (x.y from the file name 6.1.3-r1.yaml)
  doc: unknown;
}

/** Facts the merge derives. This is what a maintainer reads in the PR when bumping a spec. */
export interface DriftReport {
  addedOps: { id: string; since: string }[];
  removedOps: { id: string; until: string }[];
  addedProps: { schema: string; prop: string; since: string }[];
  /** Cannot be merged additively. The build FAILS until overlay.resolve says what to do. */
  conflicts: { where: string; versions: Record<string, string> }[];
}

export interface Merged {
  versions: readonly string[];
  schemas: Record<string, MergedSchema>;
  ops: Record<string, MergedOp>;
  drift: DriftReport;
}
export interface MergedSchema {
  /** property -> JSON-schema-ish node; `since` set when absent from the earliest spec */
  props: Record<string, { node: unknown; since: string | null }>;
  /** INTERSECTION across versions: required only if every pinned version requires it ("optional" = not guaranteed everywhere) */
  required: readonly string[];
}
export interface MergedOp {
  doc: unknown; // the newest spec's operation (docs/descriptions come from latest)
  since: string;
  until: string | null;
}

export function merge(specs: readonly SpecDoc[]): Merged {
  throw new Error("not implemented");
  // TODO
  //   ops:     union by operationId; since = first spec containing it; until = last spec containing it if absent from newest
  //   schemas: props = union (since = first spec with it) ; required = intersection ; enum values = union
  //   conflict iff the same prop has incompatible types/nullability across versions, or a prop disappears.
  //            Additive drift is auto-merged. Anything else is a human decision, never a silent pick.
  //   6.1.3 -> 7.0.1 today yields: addedOps [removeUsersFromGroup@7.0], addedProps [wiki_page.summary.project, custom_field.{is_for_all,default_value_mode,projects}@7.0], conflicts []
}

// ---------- overlay: the only hand-written input to generation ----------

export interface Overlay {
  /** Slot naming exceptions. Default rule: tag -> namespace, (method, path shape) -> get|list|create|update|delete, else verb from operationId. */
  rename: Record<string /* operationId */, `${string}.${string}`>;
  /** Present in `ops`/catalog and reachable through rm.call, but given NO namespace method (redundant variants, hand-written replacements). */
  hide: readonly string[]; // createIssueUnderProject, createTimeEntryUnderIssue, uploadAttachmentFile, downloadAttachmentFile, ...
  /** getX + getXByProject collapse into one `list({project_id?, ...})` slot. Derived by shape; this lists only opt-outs. */
  noScopeMerge: readonly string[];
  /** Ops whose safety differs from the method default (e.g. PUT archiveProject is idempotent). Retried like DELETE. */
  safety: Record<string, "read" | "idempotent" | "write">;
  /** Filter value words, e.g. status_id: { open: "o", closed: "c", any: "*" } */
  filterWords: Record<string /* `${opId}.${param}` or param */, Record<string, string>>;
  /** Ops where an id filter makes stable keyset walks possible. */
  keyset: Record<string /* operationId */, { param: string }>;
  /** Resolutions for MergeConflicts, keyed by DriftReport conflict `where`. */
  resolve: Record<string, "latest" | "union" | "earliest">;
}

// ---------- model + emit ----------

export interface Model {
  versions: readonly string[];
  ops: readonly OpModel[];
  slots: readonly SlotModel[];
}
export interface OpModel {
  id: string;
  op: Omit<Op, "__phantom">;
  /** Canonical flat input as a TS type expression AND a JSON Schema (2020-12, nullable lowered to type arrays). Same node, two renderings. */
  input: unknown;
  jsonSchema: unknown;
  summary: string;
  description: string;
}
export interface SlotModel {
  namespace: string; // "issues"
  verb: string; // "get"
  op: string;
  positional: readonly string[];
  since: string;
}

export function buildModel(merged: Merged, overlay: Overlay): Model {
  throw new Error("not implemented");
  // TODO
  //   canonical input per op = path params ++ (query minus offset/limit/nometa/format/headers) ++ where(filters) ++ body-inner keys
  //   ASSERT no key repeats (measured: 0 collisions across 94 ops, both specs) else fail with the op id
  //   ASSERT each `include` enum value names a property of the item schema (drives Included<T, I>)
  //   ASSERT every filter-looking param (description has "Format:") has an "Operators:" line, except overlay-listed (time_entries from/to)
  //   ASSERT each overlay key exists; ASSERT every non-hidden op got exactly one unique slot
  //   x-redmine-switch-user / nometa / format params are transport concerns -> never appear in input
}

export type Emitter = (model: Model, merged: Merged) => { file: string; text: string };
// Emitters (each pure, each tiny):
//   emitVersions   VERSIONS, Version, Latest, Ladder
//   emitSchemas    one exported type per schema; fields with since get `/** @since 7.0 */`; PascalCase names; envelopes/errors NOT emitted (internal)
//   emitOps        `export const ops = { getIssue: {...} as Op<"getIssue", GetIssueInput, Promise<Included<Issue, ...>>> }` metadata only
//   emitSlots      SLOTS: SlotTable
//   emitResources  explicit method signatures per namespace, JSDoc from spec summary + externalDocs link,
//                  `Resources<V>` = Base & (AtLeast<V,"7.0"> extends true ? Additions70 : unknown) & ...
//   emitCatalog    CATALOG: per-op { id, namespace, verb, summary, description, inputSchema, outputSchema, annotations, since, until, stability }
//                  in its own file: only the `catalog` entrypoint imports it, so docs and JSON Schemas cost the client bundle nothing

export function emitAll(model: Model, merged: Merged): { file: string; text: string }[] {
  throw new Error("not implemented");
}
