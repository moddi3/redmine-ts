// src/core/where.ts — pure compiler from the filter DSL to Redmine operator syntax. Version-neutral.

export type IdRef = number | 'me'

/** Values for `<field>_id` filters. A bare value or array means `=`; arrays join with `|`. */
export type IdFilter<T = number> =
  | T
  | readonly T[]
  | { readonly not: T | readonly T[] }
  | { readonly any: true }
  | { readonly none: true }
  | { readonly ever: T | readonly T[] }

/**
 * Dates as `YYYY-MM-DD` or Redmine relative tokens (`t`, `t-7`, `lw`, …).
 * `{ gte }` → `>=x`, `{ lte }` → `<=x`, `{ between: [a, b] }` → `><a|b`, `{ lt: 't-30' }` → `<t-30`.
 */
export type DateFilter =
  | string
  | { readonly gte: string }
  | { readonly lte: string }
  | { readonly lt: `t-${number}` }
  | { readonly between: readonly [string, string] }
  | { readonly any: true }
  | { readonly none: true }

export type TextFilter = string | { readonly contains: string } | { readonly notContains: string } | { readonly startsWith: string }

/** `cf: { 12: ['S1','S2'] }` → `cf_12=S1|S2`. Named custom fields arrive later via an instance config. */
export type CustomFieldWhere = { readonly [id: number]: string | readonly string[] | TextFilter | DateFilter }

export interface IssueWhere {
  readonly project?: number | string
  readonly status?: 'open' | 'closed' | 'any' | IdFilter
  readonly tracker?: IdFilter
  readonly priority?: IdFilter
  readonly assigned_to?: IdFilter<IdRef>
  readonly author?: IdFilter<IdRef>
  readonly fixed_version?: IdFilter
  readonly parent?: number | { readonly descendantOf: number } | { readonly any: true } | { readonly none: true }
  readonly subject?: TextFilter
  readonly created_on?: DateFilter
  readonly updated_on?: DateFilter
  readonly closed_on?: DateFilter
  readonly cf?: CustomFieldWhere
}

export interface TimeEntryWhere {
  readonly project?: number | string
  readonly user?: IdFilter<IdRef>
  readonly issue?: number
  readonly activity?: IdFilter
  readonly spent_on?: DateFilter
}

/**
 * Returns flat query entries the generated input types accept (`status_id`, `cf_x` spread object).
 * Field-to-param mapping is a table here, not branches: `{ status: 'status_id', assigned_to: 'assigned_to_id', … }`.
 */
export function compileIssueWhere(where: IssueWhere): Readonly<Record<string, string | Readonly<Record<string, string>>>> {
  // TODO: per key, PARAM[key] ← encode(value); status 'open' → 'o', 'closed' → 'c', 'any' → '*';
  //       { none } → '!*', { any } → '*', { not } → '!a|b', { ever } → 'ev' prefix; cf → { cf_x: { cf_12: 'S1|S2' } }
  throw new Error('not implemented')
}

export function compileTimeEntryWhere(where: TimeEntryWhere): Readonly<Record<string, string>> {
  throw new Error('not implemented')
}
