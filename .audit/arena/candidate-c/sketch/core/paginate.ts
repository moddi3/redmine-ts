// src/core/paginate.ts
import type { OperationDescriptor } from './operation'
import type { CallOptions } from './transport'
import type { PaginateOptions } from './client'

type Invoke = (op: OperationDescriptor, input: Readonly<Record<string, unknown>>, opts?: CallOptions) => Promise<unknown>

/**
 * Lazily yields items page by page. Guards (each throws `pagination_stalled`):
 *  - page longer than requested limit (server ignored `limit`)
 *  - first id of page N+1 equals first id of page N (server ignored `offset`, as 6.0.1 projects did)
 * Stops when offset + items.length >= total_count, or on an empty page.
 */
export async function* paginateOperation(
  op: OperationDescriptor,
  input: Readonly<Record<string, unknown>>,
  invoke: Invoke,
  opts: PaginateOptions = {},
): AsyncGenerator<unknown> {
  // TODO:
  //   if (!op.list) throw programmer error
  //   limit = opts.pageSize ?? 100
  //   offset strategy:
  //     loop: page = await invoke(op, { ...input, offset, limit }, opts)
  //           items = page[op.list.itemsKey]; guard(items, limit, prevFirstId); yield* items
  //           offset += items.length; stop on total_count or empty
  //   keyset strategy (issues): sort='id', issue_id=`>=${lastId + 1}`, offset always 0
  //     refuse when caller already passed issue_id or sort (would be silently overwritten)
  throw new Error('not implemented')
}
