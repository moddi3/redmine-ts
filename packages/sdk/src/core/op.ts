// The contract between generated and hand-written code. Generated modules import these types.
// The engine is generic over them and never imports generated operation data, so it is tested
// against a small hand-made registry.

import type { RedmineVersion } from "../generated/versions.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Drives retries. Derived from the method (GET read, DELETE idempotent, others write) unless the overlay overrides it. */
export type Safety = "read" | "idempotent" | "write";

/** From the spec tag descriptions ("Status: Alpha"). */
export type Stability = "stable" | "alpha";

/** Operators the server documents for one filter param, parsed from the spec's `Operators:` lines. */
export interface FilterSpec {
  /** Wire operator codes: "=", "!", ">=", "<=", "><", "~", "!~", "^", "$", "*", "!*", "o", "c", ... */
  readonly ops: readonly string[];
  /** Value words compiled to wire values, e.g. status_id: { open: "o", closed: "c", any: "*" }. */
  readonly words?: Readonly<Record<string, string>>;
  /**
   * Separator for a list under `=` and `!`. Absent means "|", which Redmine's short syntax splits on. A filter
   * that reads only its first value and splits that on commas (issue_id, parent_id, relations) sets ",".
   */
  readonly join?: ",";
  /** Redmine offers the filter only in a query scoped to one project and drops it from any other. */
  readonly scoped?: true;
}

/**
 * How one query input key goes on the wire.
 * scalar: `k=v`. csv: arrays joined with "," (include). brackets: `k[]=a&k[]=b`, the input key has no brackets.
 * repeat: `k=a&k=b`. Only `rm.request` uses it, the generator never emits it.
 */
export type QueryStyle = "scalar" | "csv" | "brackets" | "repeat";

export type RequestBody =
  | null
  /** `{ [envelope]: rest, ...siblings }`. The caller passes the inner fields flat, siblings included. */
  | {
      readonly kind: "json";
      readonly envelope: string | null;
      readonly siblings: readonly string[];
      /** Fields Redmine ignores as `null` but clears as `""`: a `null` input value goes on the wire as `""`. */
      readonly clear?: readonly string[];
      /** The input key of Redmine's attach-by-token list, set on every body that has one. Read it through `uploadKey`. */
      readonly uploads?: string;
    }
  /** Raw application/octet-stream taken from `input[key]`. Any other content type is a 406. */
  | { readonly kind: "binary"; readonly key: string }
  /** Any JSON value taken from `input[key]` and sent verbatim. Only `rm.request` uses it, the generator never emits it. */
  | { readonly kind: "value"; readonly key: string };

export type ResponseShape =
  /** `{ issue: {...} }` unwrapped to the inner object. A 204 or empty body decodes to undefined. */
  | { readonly kind: "item"; readonly unwrap: string | null }
  | {
      readonly kind: "list";
      /** Array key in the response, e.g. "issues". */
      readonly items: string;
      /** The response carries total_count, offset and limit. */
      readonly paged: boolean;
      /** An id filter that allows drift-proof keyset walks (sort=id, param=>=last+1). */
      readonly keyset?: { readonly param: string };
    }
  | { readonly kind: "empty" }
  | { readonly kind: "binary" };

declare const phantom: unique symbol;

/**
 * One Redmine operation as plain data, plus two phantom types.
 * In is the canonical flat input: path params, query keys, body fields (envelope inner fields and siblings),
 * and `where` for filters. The generator proves these never collide.
 * Ret is what the caller gets: Promise<Issue>, Listing<Issue>, Promise<void>, Promise<Download>.
 */
export interface Op<Id extends string = string, In = unknown, Ret = unknown> {
  readonly id: Id;
  readonly method: HttpMethod;
  /** Relative, no leading slash, `.json` baked in: "issues/{issue_id}.json". Joined onto a base ending in "/". */
  readonly path: string;
  readonly pathParams: readonly string[];
  readonly query: Readonly<Record<string, QueryStyle>>;
  /** Keyed by the wire param name, which is also the `where` key. Empty on non-list operations. */
  readonly filters: Readonly<Record<string, FilterSpec>>;
  /** Accepts `cf_<id>` keys in `where`. */
  readonly customFieldFilters: boolean;
  readonly body: RequestBody;
  readonly response: ResponseShape;
  /** Allowed `include` values. Each names a property of the returned item. */
  readonly includes: readonly string[];
  /** Earliest vendored version that has the operation. */
  readonly since: RedmineVersion;
  /** Last vendored version that has it, when a newer one removed it. */
  readonly until: RedmineVersion | null;
  readonly safety: Safety;
  readonly stability: Stability;
  readonly [phantom]?: { readonly in: In; readonly ret: Ret };
}

// oxlint-disable-next-line no-explicit-any -- the registry is heterogeneous; InputOf/ReturnOf recover the types
export type AnyOp = Op<string, any, any>;
export type InputOf<O> = O extends Op<string, infer I, unknown> ? I : never;
export type ReturnOf<O> = O extends Op<string, infer _In, infer R> ? R : never;

/** The input key whose entries may carry `file` bytes for the call to upload first, when the body has one. */
export function uploadKey(op: { readonly body: RequestBody }): string | undefined {
  return op.body?.kind === "json" ? op.body.uploads : undefined;
}

/** Generated namespaces: `rm.issues.get` dispatches `ops.getIssue`. Every method is `(input, options?)`. */
export type SlotTable = Readonly<Record<string, Readonly<Record<string, AnyOp>>>>;

/** `include` narrowing: the included properties become required on the result. */
export type Included<T, I extends string> = T & Required<Pick<T, Extract<I, keyof T>>>;
