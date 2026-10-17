// The one operator table. Generator, compiler, and JSON Schema emitter all derive from it.

/** Operand shape per operator. */
type Arity = 'many' | 'one' | 'pair' | 'flag' | 'days'

export const OPERATORS = {
  is: ['=', 'many'],
  not: ['!', 'many'],
  gte: ['>=', 'one'],
  lte: ['<=', 'one'],
  between: ['><', 'pair'],
  any: ['*', 'flag'],
  none: ['!*', 'flag'],
  contains: ['~', 'one'],
  containsAny: ['*~', 'one'],
  notContains: ['!~', 'one'],
  startsWith: ['^', 'one'],
  endsWith: ['$', 'one'],
  open: ['o', 'flag'],
  closed: ['c', 'flag'],
  everWas: ['ev', 'many'],
  neverWas: ['!ev', 'many'],
  changedFrom: ['cf', 'many'],
  descendantOf: ['~', 'one'],
  ancestorOf: ['~', 'one'],
  today: ['t', 'flag'],
  yesterday: ['ld', 'flag'],
  thisWeek: ['w', 'flag'],
  lastWeek: ['lw', 'flag'],
  thisMonth: ['m', 'flag'],
  lastMonth: ['lm', 'flag'],
  thisYear: ['y', 'flag'],
  daysAgo: ['t-', 'days'],
  withinPastDays: ['>t-', 'days'],
  olderThanDays: ['<t-', 'days'],
  inDays: ['t+', 'days'],
  sameProject: ['=p', 'flag'],
  otherProject: ['=!p', 'flag'],
  notInProject: ['!p', 'flag'],
  relatedOpen: ['*o', 'flag'],
  relatedClosed: ['!o', 'flag'],
  // ... remaining relative-date forms (><t-, nw, l2w, ...)
} as const satisfies Record<string, readonly [symbol: string, arity: Arity]>

export type OperatorName = keyof typeof OPERATORS

type Operand<K extends OperatorName, V> = {
  many: V | readonly V[]
  one: V
  pair: readonly [V, V]
  flag: true
  days: number
}[(typeof OPERATORS)[K][1]]

declare const rawBrand: unique symbol
/** Pre-compiled filter string, sent verbatim. For operators the spec forgot. */
export type RawFilter = string & { readonly [rawBrand]: true }
export function raw(expression: string): RawFilter {
  throw new Error('not implemented')
}

/**
 * A bare value or array means `is` (when allowed). Otherwise exactly one operator key:
 * the union of single-key objects makes `{ gte, lte }` on one field unrepresentable.
 */
export type Filter<V, Ops extends OperatorName> =
  | ('is' extends Ops ? V | readonly V[] : never)
  | { [K in Ops]: { readonly [P in K]: Operand<K, V> } & { readonly [P in Exclude<Ops, K>]?: never } }[Ops]
  | RawFilter

export type IsoDate = `${number}-${number}-${number}`
export type DateFilter = Filter<
  IsoDate,
  'is' | 'gte' | 'lte' | 'between' | 'any' | 'none' | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek'
  | 'thisMonth' | 'lastMonth' | 'thisYear' | 'daysAgo' | 'withinPastDays' | 'olderThanDays' | 'inDays'
>

/**
 * Pure. `{ between: ['2026-01-01', '2026-02-01'] }` -> '><2026-01-01|2026-02-01'.
 * `['S1', 'S2']` -> 'S1|S2'. `{ none: true }` -> '!*'. `{ olderThanDays: 30 }` -> '<t-30'.
 * Throws RedmineError{ kind: 'invalid_input' } for an operator not in `allowed`
 * (only reachable from untyped callers: JS, casts, LLM tool input).
 */
export function compileFilter(value: unknown, allowed: readonly OperatorName[]): string {
  // TODO: RawFilter -> as is; array/scalar -> join('|') with '' prefix ('=' is the server default);
  //       object -> single key k, assert allowed.includes(k), symbol + operand by arity.
  throw new Error('not implemented')
}
