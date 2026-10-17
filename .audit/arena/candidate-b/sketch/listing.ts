// src/core/listing.ts. Filter DSL compiler + pagination. Both are generic over Op metadata:
// no per-resource code. Filter KEYS are the wire param names (status_id, assigned_to_id, cf_12), zero aliasing,
// and their legal operators come from the spec, so a new Redmine filter is a regenerate, not an edit here.

import type { AnyOp, FilterSpec } from "./op.ts";

// ---------- the DSL: one Condition grammar, narrowed per field by the generated Where types ----------

type Many<V> = V | readonly V[];

export type CondNot<V> = { not: Many<V> };
export type CondRange<V> = { gte: V } | { lte: V } | { between: readonly [V, V] };
export type CondText = { contains: string } | { not_contains: string } | { starts_with: string } | { ends_with: string };
export type CondPresence = { any: true } | { none: true };
/** Escape hatch, verbatim after `field=`. For relative-date operators and the long tail ("><t-30", "ev", "cf"). */
export type CondRaw = { raw: string };

/** The generator picks capabilities per field from FilterSpec.ops: "!"->not, ">= <= ><"->range, "~ !~ ^ $"->text, "* !*"->presence. */
export type Cond<V, Caps extends "not" | "range" | "text" | "presence" = never> =
  | Many<V>
  | CondRaw
  | ("not" extends Caps ? CondNot<V> : never)
  | ("range" extends Caps ? CondRange<V> : never)
  | ("text" extends Caps ? CondText : never)
  | ("presence" extends Caps ? CondPresence : never);

// What the generator emits for getIssues (illustrative; see generated-example.ts):
//   interface IssuesWhere {
//     status_id?: Cond<number | "open" | "closed" | "any", "not">;
//     assigned_to_id?: Cond<number | "me", "not" | "presence">;
//     updated_on?: Cond<string, "range" | "presence">;
//     subject?: Cond<string, "text" | "presence">;
//   } & { [K in `cf_${number}`]?: Cond<string | number, "not" | "range" | "text" | "presence"> }

/**
 * Pure. where -> wire query. Throws invalid_input BEFORE the network on unknown keys or an operator the
 * server does not document for that field. Redmine would silently ignore both and return everything.
 */
export function compileWhere(op: AnyOp, where: Readonly<Record<string, unknown>>): Record<string, string> {
  throw new Error("not implemented");
  // TODO per [key, cond]:
  //   spec = op.filters[key] ?? (/^cf_\d+$/.test(key) ? CUSTOM_FIELD_SPEC : undefined) ?? fail(invalid_input)
  //   bare V / V[]            -> words[v] ?? String(v), joined with "|"             (status_id: "open" -> "o")
  //   {not}                   -> "!" + joined ;  {gte}-> ">=v" ; {lte}-> "<=v" ; {between:[a,b]} -> "><a|b"
  //   {contains}-> "~v" ; {not_contains}-> "!~v" ; {starts_with}-> "^v" ; {ends_with}-> "$v"
  //   {any}-> "*" ; {none}-> "!*" ; {raw}-> v
  //   each operator code must be in spec.ops, else invalid_input naming the field and its legal operators
}

// ---------- pagination ----------

export interface Page<T> {
  readonly items: readonly T[];
  readonly total_count: number | undefined; // undefined for unpaged lists (statuses, trackers)
  readonly offset: number;
  readonly limit: number;
}

/**
 * Lazy: building one performs no I/O. Consuming it does. The ONLY way to read a list op, so there is
 * no "first page vs everything" ambiguity (no thenable).
 */
export interface Listing<T> extends AsyncIterable<T> {
  /** One explicit page. For UIs and for tool adapters that expose limit/offset. */
  page(at?: { offset?: number; limit?: number }): Promise<Page<T>>;
  pages(): AsyncIterable<Page<T>>;
  /** Materialize. `max` is a safety cap that throws protocol/page_cap rather than truncating silently. */
  all(opts?: { max?: number }): Promise<T[]>;
}

export interface ListInput<W> {
  where?: W;
  sort?: string; // "id:desc"
  include?: readonly string[];
  /** page size. default 100 (server max). A server that ignores it is tolerated, see guards. */
  pageSize?: number;
  /** "offset" (default) or "keyset": stable full export, immune to inserts/deletes mid-walk. Offered only when op.response.keyset. */
  paging?: "offset" | "keyset";
}

/** What the engine hands in: one request, already compiled. */
export type FetchPage<T> = (q: { offset: number; limit: number; extra: Record<string, string> }) => Promise<Page<T>>;

export function createListing<T extends { id?: number }>(
  op: AnyOp,
  input: ListInput<unknown>,
  fetchPage: FetchPage<T>,
): Listing<T> {
  throw new Error("not implemented");
}

async function* walk<T extends { id?: number }>(
  op: AnyOp,
  input: ListInput<unknown>,
  fetchPage: FetchPage<T>,
): AsyncGenerator<Page<T>> {
  throw new Error("not implemented");
  // TODO offset mode:
  //   offset = 0; limit = pageSize ?? 100; seen = 0
  //   loop:
  //     page = await fetchPage({offset, limit, extra: {}})
  //     if page.offset !== offset -> protocol/pagination_offset_mismatch   (server ignored offset: 6.0.1 /projects bug class)
  //     if page.items.length === 0 -> return
  //     if sameIds(page, prev)     -> protocol/pagination_stalled          (same page twice)
  //     yield page; prev = page
  //     seen += page.items.length;  offset += page.items.length            (advance by what ARRIVED, not by `limit`: servers may over-return)
  //     if page.total_count !== undefined && offset >= page.total_count -> return
  //     if !op.response.paged -> return                                    (unpaged list: one shot)
  //     if ++pages > MAX_PAGES (10_000) -> protocol/page_cap
  // TODO keyset mode (requires op.response.keyset, items with numeric id, caller gave neither `sort` nor the keyset filter):
  //   afterId = 0
  //   loop: page = fetchPage({offset: 0, limit, extra: {sort: "id", [keyset.param]: `>=${afterId + 1}`}})
  //         empty -> return; yield; afterId = last(page.items).id; page shorter than limit -> return
  //   total_count is meaningful only on the first page; later pages report the remainder, which is fine.
}
