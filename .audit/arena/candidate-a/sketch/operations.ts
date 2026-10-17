// Subpath `redmine-ts-sdk/operations`: registry metadata for tool builders (MCP server, agent toolkit).
// Derived from registry.ts at module load; paths, methods, and routing stay private.

import type { OperationId } from './generated/operations.ts'
import type { RedmineVersion } from './generated/versions.ts'
import type { Stability } from './def.ts'

export interface OperationInfo {
  readonly id: OperationId
  readonly namespace: string
  readonly verb: string
  readonly summary: string
  /** Every supported Redmine version that has this operation. */
  readonly versions: readonly RedmineVersion[]
  /** `rm[namespace][verb]` returns a Listing for 'paged'; tool handlers usually call `.page()`. */
  readonly kind: 'entity' | 'list' | 'paged' | 'empty' | 'binary'
  readonly readOnly: boolean
  readonly idempotent: boolean
  readonly destructive: boolean
  readonly stability: Stability
}

export const operations: readonly OperationInfo[] = [] // TODO: Object.values(registry).map(toInfo)

function toInfo(def: import('./def.ts').OperationDef): OperationInfo {
  // TODO: versions = REDMINE_VERSIONS.slice(indexOf(def.since));
  //       idempotent = def.retry !== 'never' (conditional PUTs report false; conservative for tools)
  throw new Error('not implemented')
}
