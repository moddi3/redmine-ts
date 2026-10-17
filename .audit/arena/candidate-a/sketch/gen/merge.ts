// Build time only (runs under Node via `vp run gen`; may use node: imports, never shipped).

import type { OperationDef } from '../def.ts'

export interface VendoredSpec {
  /** From the file name: 7.0.1-r1.yaml -> '7.0'. Two vendored patches of one x.y is a generator error. */
  readonly version: string
  readonly doc: OpenApiDocument
}

export type OpenApiDocument = { readonly paths: Record<string, unknown>; readonly components: Record<string, unknown> }

export type DriftChange =
  | { readonly kind: 'operation_added'; readonly id: string; readonly version: string }
  | { readonly kind: 'field_added'; readonly schema: string; readonly field: string; readonly version: string }
  | { readonly kind: 'operation_removed'; readonly id: string; readonly version: string }
  | { readonly kind: 'field_removed'; readonly schema: string; readonly field: string; readonly version: string }
  | { readonly kind: 'response_widened'; readonly schema: string; readonly field: string; readonly from: string; readonly to: string }
  | { readonly kind: 'request_narrowed'; readonly operation: string; readonly field: string }

export interface DriftReport {
  readonly changes: readonly DriftChange[]
  /** 'minor' when every change is *_added; 'major' otherwise. Written to src/generated/DRIFT.md. */
  readonly sdkBump: 'none' | 'minor' | 'major'
}

export interface MergedModel {
  readonly operations: readonly OperationDef[]
  /** Schema name -> merged JSON Schema 2020-12 (nullable -> type arrays), fields annotated with since. */
  readonly schemas: Readonly<Record<string, unknown>>
  readonly report: DriftReport
}

/**
 * Walks versions oldest to newest. An operation's `since` is the first version containing it.
 * A field is required in the superset only if required in every version that has its schema.
 * Union types widen with a `response_widened` change; removal keeps the field optional with
 * `@until`. Fails unless every non-additive change is in surface.acknowledgedDrift.
 */
export function mergeSpecs(specs: readonly VendoredSpec[]): MergedModel {
  // TODO: per op: flatten params (drop format, nometa, X-Redmine-Nometa, X-Redmine-Switch-User),
  //       build route map, assert no key collision across path/query/envelope/body,
  //       parse "Operators:" backtick symbols -> OperatorName via OPERATORS + surface.operatorAliases,
  //       classify response (entity/list/paged/empty/binary), keyset when an `<x>_id` filter
  //       over the item id supports `>=`.
  throw new Error('not implemented')
}
