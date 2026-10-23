// The shape of `@redmine-ts/sdk/catalog`: one entry per callable operation, as data a tool layer (an MCP
// server, an agent toolkit) turns into tools without reading the spec. The generated catalog imports these.

import type { RedmineVersion } from "../generated/versions.ts";
import type { HttpMethod, Safety, Stability } from "./op.ts";

export type JsonType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";

/** The subset of JSON Schema draft 2020-12 the catalog emits. Every schema is self-contained, with no `$ref`. */
export interface JsonSchema {
  readonly $schema?: string;
  readonly type?: JsonType | readonly JsonType[];
  readonly description?: string;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly format?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly patternProperties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | JsonSchema;
  readonly items?: JsonSchema;
  readonly prefixItems?: readonly JsonSchema[];
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly anyOf?: readonly JsonSchema[];
}

/**
 * What a call resolves to. `schema` describes one returned item: the record for "item", one element of the
 * listing for "list". Output schemas allow properties they do not name and require only what the SDK's
 * types require, so they accept anything a supported server sends.
 */
export type CatalogOutput =
  | { readonly kind: "item" | "list"; readonly schema: JsonSchema }
  | { readonly kind: "empty" | "binary" };

export interface CatalogEntry {
  /** The spec's operationId, or a stable id for a hand-written method. Unique. */
  readonly id: string;
  /** `rm[namespace][verb](input, options)` is the method this entry describes. */
  readonly namespace: string;
  readonly verb: string;
  /** The spec's summary. */
  readonly title: string;
  /** The spec's description, possibly empty. */
  readonly description: string;
  readonly docsUrl: string | null;
  /** The HTTP method that decides `access`. For a method that reads before it writes, the write. */
  readonly method: HttpMethod;
  readonly safety: Safety;
  readonly since: RedmineVersion;
  readonly until: RedmineVersion | null;
  readonly stability: Stability;
  /** The method's flat input object, exactly: unknown keys are refused, `required` matches the TypeScript input. */
  readonly inputSchema: JsonSchema;
  readonly output: CatalogOutput;
}
