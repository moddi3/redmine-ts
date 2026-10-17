// Filter DSL and pagination, both generic over Op metadata with no per-resource code. Filter keys are
// wire param names (status_id, assigned_to_id, cf_12), and the legal operators per field come from
// the spec, so a new Redmine filter is a regenerate, not an edit here.

import type { AnyOp } from "./op.ts";

type Many<V> = V | readonly V[];

export type CondNot<V> = { not: Many<V> };
export type CondRange<V> = { gte: V } | { lte: V } | { between: readonly [V, V] };
export type CondText =
  | { contains: string }
  | { not_contains: string }
  | { starts_with: string }
  | { ends_with: string };
export type CondPresence = { any: true } | { none: true };
/** Escape hatch, sent verbatim after `field=`. For relative dates ("<t-30") and rarer operators. */
export type CondRaw = { raw: string };

/**
 * One condition grammar, narrowed per field by generated Where types. The generator maps documented
 * operators to capabilities: "!" not, ">= <= ><" range, "~ !~ ^ $" text, "* !*" presence.
 */
export type Cond<V, Caps extends "not" | "range" | "text" | "presence" = never> =
  | Many<V>
  | CondRaw
  | ("not" extends Caps ? CondNot<V> : never)
  | ("range" extends Caps ? CondRange<V> : never)
  | ("text" extends Caps ? CondText : never)
  | ("presence" extends Caps ? CondPresence : never);

/**
 * Pure: where -> wire query. Throws invalid_input before the network on an unknown key or an operator
 * the server does not document for that field, because Redmine silently ignores both and returns everything.
 */
export function compileWhere(
  _op: AnyOp,
  _where: Readonly<Record<string, unknown>>,
): Record<string, string> {
  throw new Error("not implemented");
  // per [key, cond]: spec = op.filters[key] ?? (cf_<n> && op.customFieldFilters ? CUSTOM_FIELD : invalid_input)
  //   V / V[]          -> words[v] ?? String(v), joined with "|"
  //   {not}            -> "!" + joined     {gte} ">=v"   {lte} "<=v"   {between:[a,b]} "><a|b"
  //   {contains} "~v"  {not_contains} "!~v"  {starts_with} "^v"  {ends_with} "$v"
  //   {any} "*"  {none} "!*"  {raw} v
  //   every operator code must be in spec.ops, else invalid_input naming the field and its legal operators
}

export interface Page<T> {
  readonly items: readonly T[];
  /** Undefined for unpaged lists (statuses, trackers). */
  readonly total_count: number | undefined;
  readonly offset: number;
  readonly limit: number;
}

/**
 * Lazy: creating one sends nothing. Deliberately not thenable, so there is no "first page or everything"
 * ambiguity. Iterating it walks every page.
 */
export interface Listing<T> extends AsyncIterable<T> {
  /** One explicit page, for UIs and for tool adapters that expose limit/offset. */
  page(at?: { offset?: number; limit?: number }): Promise<Page<T>>;
  pages(): AsyncIterable<Page<T>>;
  /** Materializes every item. `max` caps the count and throws protocol/page_cap instead of truncating. */
  all(options?: { max?: number }): Promise<T[]>;
  /** total_count from a single limit=1 request. */
  count(): Promise<number>;
}

export interface ListInput<W> {
  where?: W;
  /** "id:desc", "updated_on", ... */
  sort?: string;
  /** Page size. Default 100, the server maximum. */
  pageSize?: number;
  /**
   * "offset" (default) or "keyset": a full export immune to inserts and deletes during the walk.
   * Keyset needs an operation with a keyset param and conflicts with `sort` (invalid_input).
   */
  paging?: "offset" | "keyset";
}

/** One page request, already compiled by the engine. */
export type FetchPage<T> = (query: {
  offset: number;
  limit: number;
  extra: Record<string, string>;
}) => Promise<Page<T>>;

export function createListing<T>(
  _op: AnyOp,
  _input: ListInput<unknown>,
  _fetchPage: FetchPage<T>,
): Listing<T> {
  throw new Error("not implemented");
  // offset mode: advance by items that ARRIVED (servers may over-return), stop on empty page or offset >= total_count,
  //   one request for unpaged lists, protocol/pagination_offset_mismatch when the echoed offset differs,
  //   protocol/pagination_stalled when a page repeats the previous ids, protocol/page_cap after 10000 pages.
  // keyset mode: offset 0, sort=id, [keyset.param]=>=lastId+1, stop on a short or empty page.
}
