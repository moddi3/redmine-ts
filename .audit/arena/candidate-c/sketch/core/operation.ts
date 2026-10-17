// src/core/operation.ts — the seam between generated data and hand-written runtime.
import type { RedmineVersion } from '../generated/versions'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * How one query param reaches the wire. Derived from the spec's schema and `explode`.
 * - scalar:   `limit=100`
 * - csv:      array, explode false → `include=journals,watchers`
 * - brackets: array named `x[]`, exploded → `user_ids[]=7&user_ids[]=8`
 * - spread:   object `cf_x` with additionalProperties → `cf_12=S1|S2&cf_3=~foo`
 */
export type QueryEncoding = 'scalar' | 'csv' | 'brackets' | 'spread'

/** Runtime half of a spec operation. Emitted by the generator, never written by hand. */
export interface OperationDescriptor<Id extends string = string> {
  readonly id: Id
  readonly method: HttpMethod
  /** Template without `.{format}`, e.g. `/issues/{issue_id}`. */
  readonly path: string
  /** True when the spec path ends in `.{format}`; the runtime appends `.json`. False for downloads and thumbnails. */
  readonly format: boolean
  readonly pathParams: readonly string[]
  readonly query: readonly { readonly name: string; readonly encoding: QueryEncoding }[]
  readonly body: 'json' | 'binary' | null
  /** Top-level keys of the JSON body. Together with path and query names they partition the flat input. */
  readonly bodyKeys: readonly string[]
  readonly response: 'json' | 'empty' | 'binary'
  /** Present when the 200 response has `total_count` and exactly one array property. */
  readonly list: { readonly itemsKey: string } | null
  readonly since: RedmineVersion | `${number}.${number}`
  readonly stability: 'stable' | 'alpha'
  readonly hints: { readonly readOnly: boolean; readonly destructive: boolean; readonly idempotent: boolean }
  readonly summary: string
}

/** Type half of one operation. `input` is flat: path ∪ query ∪ body top-level keys, minus `format` and headers. */
export interface OperationTypes {
  readonly input: object
  readonly output: unknown
  /** Element type of `output[itemsKey]`, present only on list operations. */
  readonly item?: unknown
}

export type OperationMap = { readonly [id: string]: OperationTypes }

/** Generated registries are declared `satisfies Registry<Operations>`, so keys cannot drift from the type map. */
export type Registry<O extends OperationMap> = { readonly [K in keyof O & string]: OperationDescriptor<K> }

export type ListOperationId<O extends OperationMap> = {
  [K in keyof O & string]: O[K] extends { item: unknown } ? K : never
}[keyof O & string]

declare const phantom: unique symbol
/** A plugin or out-of-spec endpoint, callable through the same `rm.call` as spec operations. */
export interface CustomOperation<I extends object, Out> extends OperationDescriptor {
  readonly [phantom]?: { input: I; output: Out }
}

export function defineOperation<I extends object, Out>(
  descriptor: Omit<OperationDescriptor, 'since' | 'stability' | 'hints'> & Partial<Pick<OperationDescriptor, 'hints'>>,
): CustomOperation<I, Out> {
  // TODO: default hints from method (GET → readOnly+idempotent, PUT → idempotent, DELETE → destructive+idempotent)
  throw new Error('not implemented')
}

/** What the transport sends. Internal; never exported from a public entry. */
export interface WireRequest {
  readonly operation: string
  readonly method: HttpMethod
  /** Relative to the base URL, already including `.json` when `format` is set. */
  readonly path: string
  readonly query: readonly (readonly [string, string])[]
  readonly body: { readonly kind: 'json'; readonly value: object } | { readonly kind: 'binary'; readonly value: Blob | Uint8Array | ReadableStream<Uint8Array> } | null
  readonly response: OperationDescriptor['response']
  readonly idempotent: boolean
}

/**
 * Pure. Partitions the flat input by the descriptor's name lists.
 * Throws a programmer error for a missing path param, which typed callers cannot hit.
 */
export function toWireRequest(op: OperationDescriptor, input: Readonly<Record<string, unknown>>): WireRequest {
  // TODO:
  //   path = op.path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(input[k]))) + (op.format ? '.json' : '')
  //   for q of op.query: encode input[q.name] by q.encoding; skip undefined; 'spread' iterates Object.entries
  //   body: json → pick op.bodyKeys from input (omit when none present); binary → input.body
  //   unknown keys (not in any list) → ignored for typed calls; callUntyped rejects them earlier
  throw new Error('not implemented')
}
