// src/core/op.ts. The ONLY contract between generated and hand-written code.
// Generated modules import these types; the engine is generic over them and never imports generated data.
// Consequence: engine/pagination/filter tests run against a 3-op hand-made registry, no generator needed.

import type { Version } from "./version.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Drives retry policy. Derived from method (GET read, DELETE idempotent, else write) unless overlay overrides. */
export type Safety = "read" | "idempotent" | "write";
export type Stability = "stable" | "alpha"; // from spec tag descriptions ("Status: Alpha")

/** Operators the server documents per filter param. Parsed from spec descriptions at generation time. */
export interface FilterSpec {
  readonly param: string; // wire name, e.g. "assigned_to_id"
  readonly kind: "id" | "int" | "float" | "string" | "date" | "bool";
  readonly ops: readonly string[]; // wire codes: "=", "!", ">=", "<=", "><", "~", "!~", "^", "$", "*", "!*", ...
  readonly words?: Readonly<Record<string, string>>; // sugar -> wire, e.g. status_id: { open: "o", closed: "c", any: "*" }
}

export type RequestBody =
  | null
  | { readonly kind: "json"; readonly envelope: string | null } // {issue: {...}}: caller passes the inner object
  | { readonly kind: "binary"; readonly key: string }; // raw octet-stream; caller passes it as input[key]

export type ResponseShape =
  | { readonly kind: "item"; readonly unwrap: string | null } // {issue: {...}} -> inner
  | {
      readonly kind: "list";
      readonly items: string; // "issues"
      readonly paged: boolean; // response carries total_count/offset/limit
      readonly keyset?: { readonly param: string }; // id filter usable for stable keyset walks (issues only)
    }
  | { readonly kind: "empty" } // 200/204 with empty body
  | { readonly kind: "binary" };

declare const phantom: unique symbol;

/**
 * One Redmine operation. Plain data plus two phantom types:
 *  In  = canonical flat input (path params + query/body keys + `where` for filters), collision-free by construction
 *  Ret = what the caller gets back: Promise<Issue>, Listing<Issue>, Promise<void>, Promise<Download>
 */
export interface Op<Id extends string = string, In = unknown, Ret = unknown> {
  readonly id: Id;
  readonly method: HttpMethod;
  readonly path: string; // "issues/{issue_id}.json": relative, no leading slash, `.json` baked in
  readonly pathParams: readonly string[];
  readonly query: Readonly<Record<string, "scalar" | "csv">>; // csv = explode:false arrays (include, fields)
  readonly filters: Readonly<Record<string, FilterSpec>>; // keyed by the `where` key; empty on non-list ops
  readonly body: RequestBody;
  readonly response: ResponseShape;
  readonly includes: readonly string[]; // allowed `include` values; each names a property of the item
  readonly since: Version;
  readonly until: Version | null;
  readonly safety: Safety;
  readonly stability: Stability;
  readonly [phantom]?: { readonly in: In; readonly ret: Ret };
}

export type AnyOp = Op<string, any, any>;
export type InputOf<O> = O extends Op<string, infer I, unknown> ? I : never;
export type ReturnOf<O> = O extends Op<string, never, infer R> ? R : never;

/**
 * One generated namespace slot: `rm.issues.get` -> { op: ops.getIssue, positional: ["issue_id"] }.
 * Method shape is always (...positional path params, input?, callOptions?).
 */
export interface Slot {
  readonly op: AnyOp;
  readonly positional: readonly string[];
}
export type SlotTable = Readonly<Record<string, Readonly<Record<string, Slot>>>>;
