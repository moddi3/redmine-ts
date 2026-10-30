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
export type CondContains<V> = { contains: V };
export type CondPresence = { any: true } | { none: true };
/**
 * Escape hatch in Redmine's short syntax, sent verbatim after `field=`. For relative dates ("<t-30") and rarer
 * operators. Next to a `project_id` other than one id, it is read into the long form, or refused on a custom field.
 */
export type CondRaw = { raw: string };

/**
 * One condition grammar, narrowed per field by generated Where types. The generator maps documented
 * operators to capabilities: "!" not, ">= <= ><" range, "~ !~ ^ $" text, "* !*" presence, and "~" on an id
 * filter contains.
 */
export type Cond<V, Caps extends "not" | "range" | "text" | "contains" | "presence" = never> =
  | Many<V>
  | CondRaw
  | ("not" extends Caps ? CondNot<V> : never)
  | ("range" extends Caps ? CondRange<V> : never)
  | ("text" extends Caps ? CondText : never)
  | ("contains" extends Caps ? CondContains<V> : never)
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

export interface Compiled {
  readonly code: string | null;
  readonly wire: string;
}

/**
 * Pure: where -> wire query. Throws invalid_input before the network on an unknown key or an operator
 * the server does not document for that field, because Redmine silently ignores both and returns everything.
 */
export function compileWhere(
  op: AnyOp,
  where: Readonly<Record<string, unknown>>,
): Record<string, Compiled> {
  const query: Record<string, Compiled> = {};
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
    query[key] = { code, wire };
  }
  return query;
}

const PROJECT_WORDS: ReadonlySet<string> = new Set(["mine", "bookmarks"]);

/**
 * Redmine reads `project_id` as the one project to scope the request to before it reads any filter, and
 * answers 404 for any other value, such as `1|2`, `!1` or `mine`. The long form (`f[]`, `op[k]`, `v[k][]`)
 * leaves that param unset, and Redmine ignores every short-form filter once `f[]` is present.
 */
export function longForm(
  op: AnyOp,
  where: Readonly<Record<string, Compiled>>,
  query: Readonly<Record<string, string>>,
): [string, string][] | undefined {
  const project = where.project_id?.wire;
  if (project === undefined || isOneProject(project)) return undefined;
  const filters: Record<string, Compiled> = { ...where };
  // The short form of an issue query starts from open issues, the long form from no filter.
  if (own(op.filters, "status_id") && filters.status_id === undefined) {
    filters.status_id = { code: "o", wire: "o" };
  }
  const entries: [string, string][] = [];
  // A filter the client adds itself, such as the keyset bound `issue_id>=N`, moves into the long form with the rest.
  for (const [key, value] of Object.entries(query)) {
    if (own(op.filters, key)) filters[key] = { code: null, wire: value };
    else entries.push([key, value]);
  }
  for (const [key, filter] of Object.entries(filters)) {
    const { operator, values } = longCondition(op, key, filter);
    if (key === "project_id") checkProjects(op, values);
    entries.push(["f[]", key], [`op[${key}]`, operator]);
    for (const value of values) entries.push([`v[${key}][]`, value]);
  }
  return entries;
}

function isOneProject(wire: string): boolean {
  return /^[\w-]+$/.test(wire) && !PROJECT_WORDS.has(wire);
}

export function checkScope(
  op: AnyOp,
  where: Readonly<Record<string, Compiled>>,
  queryId: boolean,
): void {
  const project = where.project_id?.wire;
  const oneProject =
    op.pathParams.includes("project_id") || (project !== undefined && isOneProject(project));
  if (queryId) {
    const other = Object.keys(where).find((key) => key !== "project_id");
    if (other !== undefined) {
      throw invalidInput(
        `query_id on ${op.id} runs the saved query's own filters, and Redmine ignores where.${other}; drop where or drop query_id`,
        op.id,
      );
    }
    if (project !== undefined && !oneProject) {
      throw invalidInput(
        `query_id on ${op.id} works only next to one project_id, because Redmine runs a saved query without reading the long form's filters, project_id included; send one request per project`,
        op.id,
      );
    }
  }
  const scoped = Object.keys(where).find((key) => own(op.filters, key)?.scoped);
  if (scoped !== undefined && !oneProject) {
    throw invalidInput(
      `filter "${scoped}" on ${op.id} works only next to one project_id, because Redmine offers it only inside one project and drops it from any other query; pass one project_id, or send one request per project`,
      op.id,
    );
  }
}

function checkProjects(op: AnyOp, values: readonly string[]): void {
  const stray = values.find((v) => !/^\d+$/.test(v) && !PROJECT_WORDS.has(v));
  if (stray !== undefined) {
    throw invalidInput(
      `with more than one value, {not} or raw, project_id takes ids, "mine" and "bookmarks", not "${stray}"; an identifier works only as the one value`,
      op.id,
    );
  }
}

/**
 * The short form sends a condition as `key=value`, which Redmine reads back with its operator table for the
 * field's type. The spec's operators match that table for every standard filter, so the long form reads the
 * value the same way.
 */
function longCondition(
  op: AnyOp,
  key: string,
  { code, wire }: Compiled,
): { operator: string; values: string[] } {
  const spec = own(op.filters, key);
  if (spec !== undefined) return addShortFilter(spec.ops, wire);
  if (code === null || (code === "=" && /^[<>!*~^$]/.test(wire))) {
    throw invalidInput(
      `filter "${key}" on ${op.id}: next to a project_id other than one id, a custom field takes no raw text and no value that starts with an operator character, because Redmine reads those by the field's format; use an operator object such as {not}, {contains}, {gte} or {any: true}, or one request per project`,
      op.id,
    );
  }
  return addShortFilter([code], wire);
}

/** A port of Redmine's `Query#add_short_filter`, which reads one short-form value. */
function addShortFilter(
  ops: readonly string[],
  wire: string,
): { operator: string; values: string[] } {
  const operator = [...ops]
    .sort()
    .reverse()
    .find((o) => wire.startsWith(o));
  if (operator === undefined) return { operator: "=", values: split(wire) };
  const rest = wire.slice(operator.length);
  return { operator, values: rest.trim() === "" ? [""] : split(rest) };
}

/** Ruby's `split("|")`, which drops trailing empty values. */
function split(text: string): string[] {
  const values = text.split("|");
  while (values.at(-1) === "") values.pop();
  return values;
}

function compileCond(cond: unknown, spec: FilterSpec, at: string): Compiled {
  if (!isRecord(cond)) {
    return (
      compileWord(cond, spec, at, false) ?? { code: "=", wire: joinValues(cond, at, spec.join) }
    );
  }
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
      return (
        compileWord(value, spec, at, true) ?? {
          code: "!",
          wire: `!${joinValues(value, at, spec.join)}`,
        }
      );
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

const OPPOSITE: Readonly<Record<string, string>> = { o: "c", c: "o" };

/** Redmine reads `o|3` as every open issue, and `!closed` as a status id named "closed". */
function compileWord(
  value: unknown,
  { words }: FilterSpec,
  at: string,
  negated: boolean,
): Compiled | undefined {
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];
  const named = values.filter(
    (v): v is string => typeof v === "string" && own(words, v) !== undefined,
  );
  if (named.length === 0) return undefined;
  if (values.length > 1) {
    const listed = Object.keys(words ?? {}).map((word) => `"${word}"`);
    throw invalidInput(
      `${at}: ${listed.join(", ")} are operators and stand alone, not in a list with other values`,
    );
  }
  const [word] = named;
  const code = own(words, word!)!;
  if (!negated) return { code, wire: code };
  const opposite = OPPOSITE[code];
  if (opposite === undefined) throw invalidInput(`${at}: {not: "${word}"} matches no issue`);
  return { code: opposite, wire: opposite };
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
): string {
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];
  if (values.length === 0) throw invalidInput(`${at}: an empty list matches nothing useful`);
  return values.map((v) => scalar(v, at)).join(separator);
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
