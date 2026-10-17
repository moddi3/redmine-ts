// The contract between generated/ and the hand-written core.
// The generator emits one OperationDef per spec operationId; core reads only these fields
// and never branches on an operation name.

import type { RedmineVersion } from './generated/versions.ts'
import type { OperatorName } from './filters.ts'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Where one flat-input key goes on the wire. */
export type Route =
  | 'path' // filled into the template, encodeURIComponent
  | 'query' // scalar query param (sort, offset, limit, query_id)
  | 'csv' // explode:false array, comma-joined (include)
  | 'filter' // compiled through filters.ts to Redmine operator syntax
  | 'envelope' // body.<envelope>.<key>
  | 'body' // top-level body sibling of the envelope (send_information, pref)

export type ResponseShape =
  | { readonly kind: 'entity'; readonly key: string } // { issue } -> Issue
  | { readonly kind: 'list'; readonly key: string } // { trackers: [] } -> Tracker[]
  | { readonly kind: 'paged'; readonly key: string } // { issues, total_count, offset, limit } -> Listing
  | { readonly kind: 'empty' } // 204 or empty 200
  | { readonly kind: 'binary' } // attachment download / thumbnail

export type RetryPolicy =
  | 'safe'
  | 'never'
  /** PUT that is idempotent except when these input keys are present (notes adds a journal). */
  | { readonly unlessFields: readonly string[] }

export type Stability = 'stable' | 'beta' | 'alpha' | 'undocumented'

export interface OperationDef {
  readonly id: string
  readonly namespace: string
  readonly verb: string
  readonly method: HttpMethod
  /** Relative to the normalized base URL, `.json` already substituted for `.{format}`. Never starts with `/`. */
  readonly path: string
  readonly route: Readonly<Record<string, Route>>
  /** Allowed operator names per filter key, parsed from the spec's "Operators:" lines. */
  readonly filters: Readonly<Record<string, readonly OperatorName[]>>
  /** Accepts dynamic `cf_<id>` filter keys (routed as 'filter' with every operator allowed). */
  readonly cfFilters: boolean
  readonly envelope: string | null
  readonly bodyType: 'json' | 'octet-stream' | null
  readonly response: ResponseShape
  /** Earliest vendored Redmine version that has this operation. */
  readonly since: RedmineVersion
  readonly retry: RetryPolicy
  readonly readOnly: boolean
  readonly destructive: boolean
  readonly stability: Stability
  readonly summary: string
  /** Filter key whose `>=` over item ids enables drift-proof keyset iteration. */
  readonly keyset?: string
}
