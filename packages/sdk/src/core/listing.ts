// Filter DSL and pagination, both generic over Op metadata with no per-resource code. Filter keys are
// wire param names (status_id, assigned_to_id, cf_12), and the legal operators per field come from
// the spec, so a new Redmine filter is a regenerate, not an edit here.

import { RedmineError } from "./errors.ts";
import type { AnyOp, FilterSpec } from "./op.ts";
import { invalidInput, isRecord, own } from "./util.ts";

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

export const CUSTOM_FIELD: FilterSpec = {
  ops: ["=", "!", ">=", "<=", "><", "~", "!~", "^", "$", "*", "!*"],
};

const TEXT_AND_RANGE: ReadonlyMap<string, string> = new Map([
  ["gte", ">="],
  ["lte", "<="],
  ["contains", "~"],
  ["not_contains", "!~"],
  ["starts_with", "^"],
  ["ends_with", "$"],
]);

/**
 * Pure: where -> wire query. Throws invalid_input before the network on an unknown key or an operator
 * the server does not document for that field, because Redmine silently ignores both and returns everything.
 */
export function compileWhere(
  op: AnyOp,
  where: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    const spec =
      own(op.filters, key) ??
      (op.customFieldFilters && /^cf_\d+$/.test(key) ? CUSTOM_FIELD : undefined);
    if (!spec) {
      const known = Object.keys(op.filters).join(", ") || "none";
      throw invalidInput(`unknown filter "${key}" on ${op.id}, known: ${known}`, op.id);
    }
    const { code, wire } = compileCond(cond, spec, `${op.id}.${key}`);
    if (code !== "=" && code !== null && !spec.ops.includes(code)) {
      throw invalidInput(
        `filter "${key}" on ${op.id} does not document operator "${code}", legal: ${spec.ops.join(" ")}`,
        op.id,
      );
    }
    query[key] = wire;
  }
  return query;
}

/** `code` is the operator Redmine must document for the field, null for `raw` which is trusted. */
function compileCond(
  cond: unknown,
  spec: FilterSpec,
  at: string,
): { code: string | null; wire: string } {
  if (!isRecord(cond)) return { code: "=", wire: joinValues(cond, at, spec.join, spec.words) };
  const keys = Object.keys(cond).filter((k) => cond[k] !== undefined);
  const [name] = keys;
  if (keys.length !== 1 || name === undefined) {
    throw invalidInput(
      `${at}: a condition takes exactly one operator, got ${keys.join(", ") || "none"}`,
    );
  }
  const value = cond[name];
  switch (name) {
    case "not":
      return { code: "!", wire: `!${joinValues(value, at, spec.join)}` };
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) {
        throw invalidInput(`${at}: between takes a [from, to] pair`);
      }
      return { code: "><", wire: `><${joinValues(value, at)}` };
    }
    case "any":
    case "none":
      if (value !== true) throw invalidInput(`${at}: ${name} takes true`);
      return name === "any" ? { code: "*", wire: "*" } : { code: "!*", wire: "!*" };
    case "raw":
      if (typeof value !== "string") throw invalidInput(`${at}: raw takes a string`);
      return { code: null, wire: value };
  }
  const code = TEXT_AND_RANGE.get(name);
  if (code !== undefined) return { code, wire: `${code}${scalar(value, at)}` };
  throw invalidInput(`${at}: unknown operator "${name}"`);
}

function scalar(value: unknown, at: string): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw invalidInput(`${at}: expected a string, number or boolean, got ${describeType(value)}`);
}

function joinValues(
  value: unknown,
  at: string,
  separator: "|" | NonNullable<FilterSpec["join"]> = "|",
  words?: FilterSpec["words"],
): string {
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];
  if (values.length === 0) throw invalidInput(`${at}: an empty list matches nothing useful`);
  return values
    .map((v) => {
      const text = scalar(v, at);
      return own(words, text) ?? text;
    })
    .join(separator);
}

function describeType(value: unknown): string {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
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

const PAGE_CAP = 10_000;
const DEFAULT_PAGE_SIZE = 100;

export function createListing<T>(
  op: AnyOp,
  input: ListInput<unknown>,
  fetchPage: FetchPage<T>,
): Listing<T> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const keyset = input.paging === "keyset";
  const keysetParam = op.response.kind === "list" ? op.response.keyset?.param : undefined;
  const sortExtra: Record<string, string> = input.sort === undefined ? {} : { sort: input.sort };
  const problem = checkOptions();

  function checkOptions(): RedmineError | undefined {
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      return invalidInput("pageSize must be a positive integer", op.id);
    }
    if (input.sort !== undefined && typeof input.sort !== "string") {
      return invalidInput("sort must be a string", op.id);
    }
    if (input.paging !== undefined && input.paging !== "offset" && !keyset) {
      return invalidInput('paging must be "offset" or "keyset"', op.id);
    }
    if (!keyset) return undefined;
    if (keysetParam === undefined) {
      return invalidInput(`${op.id} does not support keyset paging`, op.id);
    }
    if (input.sort !== undefined) {
      return invalidInput("keyset paging orders by id itself and conflicts with `sort`", op.id);
    }
    if (isRecord(input.where) && input.where[keysetParam] !== undefined) {
      return invalidInput(`keyset paging owns \`${keysetParam}\`; remove it from \`where\``, op.id);
    }
    return undefined;
  }

  const stalled = (hint: string): RedmineError =>
    new RedmineError({ kind: "protocol", reason: "pagination_stalled", hint }, { op: op.id });
  const capped = (hint: string): RedmineError =>
    new RedmineError({ kind: "protocol", reason: "page_cap", hint }, { op: op.id });

  async function* walkOffset(): AsyncGenerator<Page<T>> {
    let offset = 0;
    let previousIds: string | undefined;
    for (let n = 0; ; n++) {
      if (n >= PAGE_CAP) throw capped(`stopped after ${PAGE_CAP} pages`);
      const page = await fetchPage({ offset, limit: pageSize, extra: sortExtra });
      if (page.total_count === undefined) {
        if (page.items.length > 0) yield page;
        return;
      }
      if (page.offset !== offset) {
        throw new RedmineError(
          {
            kind: "protocol",
            reason: "pagination_offset_mismatch",
            hint: `asked for offset ${offset} but the server answered offset ${page.offset}; it may ignore offset on this endpoint`,
          },
          { op: op.id },
        );
      }
      if (page.items.length === 0) return;
      const ids = idsOf(page.items);
      if (ids !== undefined && ids === previousIds) {
        throw stalled(`the page at offset ${offset} repeats the previous page`);
      }
      previousIds = ids;
      yield page;
      offset += page.items.length;
      if (offset >= page.total_count) return;
    }
  }

  async function* walkKeyset(param: string): AsyncGenerator<Page<T>> {
    let after: number | undefined;
    for (let n = 0; ; n++) {
      if (n >= PAGE_CAP) throw capped(`stopped after ${PAGE_CAP} pages`);
      const extra: Record<string, string> = { sort: "id" };
      if (after !== undefined) extra[param] = `>=${after + 1}`;
      const page = await fetchPage({ offset: 0, limit: pageSize, extra });
      if (page.items.length === 0) return;
      const last = idOf(page.items[page.items.length - 1]);
      if (typeof last !== "number" || (after !== undefined && last <= after)) {
        throw stalled("keyset paging needs ascending numeric ids and the last id did not advance");
      }
      yield page;
      after = last;
      // A server may cap `limit` below pageSize, so a short page alone does not mean the end.
      if (
        page.total_count !== undefined
          ? page.items.length >= page.total_count
          : page.items.length < Math.min(pageSize, page.limit)
      ) {
        return;
      }
    }
  }

  async function* pages(): AsyncGenerator<Page<T>> {
    if (problem) throw problem;
    yield* keysetParam !== undefined && keyset ? walkKeyset(keysetParam) : walkOffset();
  }

  async function* items(): AsyncGenerator<T> {
    for await (const page of pages()) yield* page.items;
  }

  return {
    [Symbol.asyncIterator]: items,
    pages,
    async page(at) {
      if (problem) throw problem;
      return fetchPage({
        offset: at?.offset ?? 0,
        limit: at?.limit ?? pageSize,
        extra: sortExtra,
      });
    },
    async all(options) {
      const max = options?.max ?? Infinity;
      const out: T[] = [];
      for await (const item of items()) {
        if (out.length >= max)
          throw capped(`more than max=${max} items; raise \`max\` or iterate instead`);
        out.push(item);
      }
      return out;
    },
    async count() {
      if (problem) throw problem;
      const page = await fetchPage({ offset: 0, limit: 1, extra: {} });
      return page.total_count ?? page.items.length;
    },
  };
}

function idOf(item: unknown): unknown {
  return isRecord(item) ? item.id : undefined;
}

/** Undefined when any item lacks an id, which disables repeat detection. */
function idsOf(items: readonly unknown[]): string | undefined {
  const ids = items.map(idOf);
  return ids.every((id) => id !== undefined) ? JSON.stringify(ids) : undefined;
}
