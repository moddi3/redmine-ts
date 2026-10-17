// src/core/client.ts — the one runtime every edition instantiates.
import type { RedmineVersion } from '../generated/versions'
import type { CustomOperation, ListOperationId, OperationMap, Registry } from './operation'
import type { CallOptions, RedmineConfig } from './transport'
import type { AttachmentsFacade, FacadeOps, IssuesFacade, ProjectsFacade, TimeEntriesFacade, UploadsFacade, UsersFacade } from '../facade'

export interface PaginateOptions extends CallOptions {
  /** Default 100, Redmine's max. */
  readonly pageSize?: number
  /**
   * offset: plain offset/limit; can skip or repeat rows when data changes mid-scan.
   * keyset: only for operations whose query has `sort` and `<entity>_id` (issues); sort=id, id>=last+1.
   */
  readonly strategy?: 'offset' | 'keyset'
}

/** Version-neutral core. Every edition's client is assignable to `RedmineCore<RedmineVersion, OperationMap>`. */
export interface RedmineCore<V extends RedmineVersion, O extends OperationMap> {
  readonly version: V
  /** Only the operations this edition has. The tool layer reads this. */
  readonly operations: Registry<O>

  call<K extends keyof O & string>(id: K, input: O[K]['input'], opts?: CallOptions): Promise<O[K]['output']>
  call<I extends object, Out>(op: CustomOperation<I, Out>, input: I, opts?: CallOptions): Promise<Out>

  /**
   * The JSON boundary (MCP, LLM tools, JS callers). Throws `unsupported_in_version` for an id outside
   * `operations`, and rejects input keys outside the descriptor's lists. Schema validation is opt-in.
   */
  callUntyped(id: string, input: Readonly<Record<string, unknown>>, opts?: CallOptions & { validate?: InputValidator }): Promise<unknown>

  paginate<K extends ListOperationId<O>>(
    id: K,
    input: Omit<O[K]['input'], 'offset' | 'limit'>,
    opts?: PaginateOptions,
  ): AsyncIterable<NonNullable<O[K]['item']>>
}

/** Bring your own validator (Standard Schema, Ajv over `inputSchemas`); the SDK ships none. */
export type InputValidator = (operation: string, input: unknown) => readonly string[] | null

export type RedmineClient<V extends RedmineVersion, O extends FacadeOps> = RedmineCore<V, O> & {
  readonly issues: IssuesFacade<O>
  readonly projects: ProjectsFacade<O>
  readonly users: UsersFacade<O>
  readonly timeEntries: TimeEntriesFacade<O>
  readonly uploads: UploadsFacade
  readonly attachments: AttachmentsFacade<O>
}

/**
 * Called only by generated edition entries:
 *   export const createRedmine = (c: RedmineConfig) => createRedmineClient('7.0', registry, c)
 * `O extends FacadeOps` makes the generated entry fail to compile when a new spec breaks a facade assumption.
 */
export function createRedmineClient<V extends RedmineVersion, O extends FacadeOps>(
  version: V,
  operations: Registry<O>,
  config: RedmineConfig,
): RedmineClient<V, O> {
  // TODO:
  //   transport = createTransport(config)
  //   invoke(desc, input, opts) =
  //     transport.send(toWireRequest(desc, input), opts).then(body => normalizers[desc.id]?.(body) ?? body)
  //   call(idOrOp, input, opts) = invoke(typeof idOrOp === 'string' ? operations[idOrOp] : idOrOp, input, opts)
  //   callUntyped(id, input, opts):
  //     desc = operations[id] ?? throw RedmineError({ kind: 'unsupported_in_version', operation: id, version,
  //                                                   availableIn: AVAILABILITY[id] ?? [] })
  //     reject unknown keys; opts.validate?.(id, input) → errors → throw invalid input (programmer error)
  //     return invoke(desc, input, opts)
  //   paginate(id, input, opts) = paginateOperation(operations[id], input, invoke, opts)
  //   facades: createIssuesFacade(core), … each receives the core, not the transport
  throw new Error('not implemented')
}
