// Two small entrypoints that exist because ops are DATA:
//   redmine-ts-sdk/testing   a fake fetch addressed by operation, with typed fixtures
//   redmine-ts-sdk/catalog   per-op metadata + JSON Schema, the seed for the agent toolkit / MCP

import type { AnyOp, InputOf, ReturnOf } from "./op.ts";
import type { Redmine } from "./redmine.ts";
import type { RedmineConfig } from "./config.ts";
import type { Version } from "./version.ts";

// ======================= redmine-ts-sdk/testing =======================

type Payload<O extends AnyOp> = Awaited<ReturnOf<O>> extends infer R ? (R extends { all(): Promise<(infer T)[]> } ? T[] : R) : never;

export interface FakeRedmine {
  /** Pass to createRedmine({ fetch }). Unmatched requests fail the test loudly with the op id and input. */
  readonly fetch: typeof fetch;
  /** Fully typed client already pointed at the fake. */
  client<V extends Version = Version>(cfg?: Partial<RedmineConfig<V>>): Redmine<V>;
  /**
   * Fixtures are DOMAIN values (an Issue, Issue[]), wrapped into the real envelope by the op's own descriptor,
   * so a fixture cannot drift from the wire shape the engine will unwrap.
   */
  on<O extends AnyOp>(op: O, match: Partial<InputOf<O>> | ((input: InputOf<O>) => boolean), reply: Reply<Payload<O>>): void;
  readonly calls: readonly RecordedCall[];
}
export type Reply<T> =
  | { status?: number; value: T; total_count?: number } // json/list
  | { status: 422; errors: string[] }
  | { status: number; empty: true }
  | { throws: Error } // network failure
  | { delayMs: number; then: Reply<T> };
export interface RecordedCall { op: string; method: string; url: string; headers: Record<string, string>; body: unknown }

export function fakeRedmine(): FakeRedmine {
  throw new Error("not implemented");
  // TODO route table built from ops: (method, "<base path>/<template regex>") -> op. Same descriptors the engine uses,
  //      so a renamed route in a spec bump breaks tests here instead of passing on a hand-typed URL.
}

// ======================= redmine-ts-sdk/catalog =======================

export interface OpMeta {
  id: string; // "getIssue"
  namespace: string | null; // "issues" ; null when hidden from namespaces
  verb: string | null; // "get"
  summary: string; // from the spec
  description: string;
  /** JSON Schema 2020-12 of the canonical flat input. nullable lowered to type arrays; filter operators as an enum-tagged where-schema. */
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  kind: "item" | "list" | "empty" | "binary"; // list ops: adapter adds limit/offset and calls listing.page()
  /** Derived, never typed: GET -> readOnlyHint, DELETE -> destructiveHint, PUT/PATCH -> idempotentHint */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
  since: Version;
  until: Version | null;
  stability: "stable" | "alpha";
}

export declare const catalog: readonly OpMeta[];

/** Ops a server declared as `version` actually has. The same ladder the runtime guard uses. */
export function availableIn(version: Version | undefined): readonly OpMeta[] {
  throw new Error("not implemented");
}

// How the later `@redmine-ts/tools` package consumes it (illustrative, NOT in the sdk):
//
//   const tools = availableIn(rm.version).filter(readOnly).map(meta => ({
//     name: meta.id, description: meta.description, inputSchema: meta.inputSchema, annotations: meta.annotations,
//     handler: (input: unknown) => rm.call(ops[meta.id], input as never),   // input shape == schema shape == call shape: no translation layer
//   }))
//
// Curated triage tools (issue_context, propose_update...) are written against rm.issues.* and share the same
// RedmineError.toJSON() for tool-side error reporting and RedmineConfig.onEvent for the audit hook.
