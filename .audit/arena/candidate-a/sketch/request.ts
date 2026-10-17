// Pure: flat input + OperationDef -> what goes on the wire. No I/O, table-tested.

import type { OperationDef } from './def.ts'

export interface EncodedRequest {
  readonly method: string
  readonly url: URL
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | undefined
}

/**
 * Routes every input key by `def.route`:
 *   path     -> template, encodeURIComponent (project identifiers, wiki titles with spaces)
 *   query    -> String(value)
 *   csv      -> values.join(',')
 *   filter   -> compileFilter(value, def.filters[key])   (cf_<id> when def.cfFilters)
 *   envelope -> body[def.envelope][key]
 *   body     -> body[key]
 * `undefined` values are dropped; `null` in an envelope is sent (clears a field).
 * Unknown keys throw invalid_input: a typo must not silently become an ignored server param.
 */
export function encodeRequest(def: OperationDef, input: Record<string, unknown>, base: URL, switchUser: string | undefined): EncodedRequest {
  // TODO: headers: Accept: application/json; Content-Type only when a body exists;
  //       X-Redmine-Switch-User when switchUser. Body omitted entirely for GET and for
  //       DELETE without body keys (Redmine rejects some empty JSON bodies).
  throw new Error('not implemented')
}

/**
 * `new URL('/issues.json', 'https://h/redmine/')` drops `/redmine/`. Paths in the registry are
 * relative and `base` always ends with '/', so `new URL(path, base)` keeps the prefix.
 */
export function joinUrl(base: URL, relativePath: string, query: URLSearchParams): URL {
  throw new Error('not implemented')
}
