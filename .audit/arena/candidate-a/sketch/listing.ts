import type { CallOptions } from './client.ts'
import type { OperationDef } from './def.ts'
import type { Executor } from './execute.ts'

export interface Page<T> {
  readonly items: readonly T[]
  readonly total_count: number | null
  readonly offset: number
  readonly limit: number
}

/**
 * Lazy and deliberately not thenable: nothing is sent until one of these is used, and
 * `await listing` is a type error instead of an ambiguous "first page or everything".
 */
export interface Listing<T> extends AsyncIterable<T> {
  /** One request honoring the caller's offset/limit. */
  page(): Promise<Page<T>>
  /** Every page, 100 items each, with the drift and limit-ignored guards. */
  pages(): AsyncIterable<Page<T>>
  /** Collects iteration, stopping after `max` items. */
  toArray(opts?: { readonly max?: number }): Promise<T[]>
  /** limit=1 request, returns total_count. */
  count(): Promise<number>
}

export const PAGE_SIZE = 100

export function createListing<T>(exec: Executor, def: OperationDef, input: Record<string, unknown>, opts: CallOptions | undefined): Listing<T> {
  // TODO pages():
  //   const keyset = def.keyset && input.sort === undefined && input[def.keyset] === undefined
  //   seen = new Set<id>()
  //   keyset mode:
  //     loop: page = exec.page(def, { ...input, sort: 'id', [def.keyset]: { gte: nextId }, limit: 100, offset: 0 })
  //           yield unseen; if page.items.length < 100 stop; nextId = lastId + 1
  //   offset mode:
  //     loop: page = exec.page(def, { ...input, limit: 100, offset })
  //           ignored = items.length > 100 || page.offset !== offset || firstId === previousFirstId
  //           yield items not in seen (dedupe covers offset drift duplicates)
  //           if ignored or items.length < 100 or offset + 100 >= total_count: stop
  //           offset += 100
  //   Items without an `id` (search results) skip dedupe and the repeat check uses a JSON hash.
  throw new Error('not implemented')
}
