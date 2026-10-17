// Three hand-written public entries, collapsed into one file for the sketch.
// Edition entries (`/6.1`, `/7.0`) are generated; see generated/7.0/index.ts.

// ---- src/index.ts: `redmine-ts-sdk` (version-neutral; no createRedmine, no floating latest) ----
export { RedmineError, isRedmineError, type RedmineErrorDetail, type RedmineErrorKind } from './core/errors'
export type { Auth, CallOptions, RedmineConfig } from './core/transport'
export type { IssueWhere, TimeEntryWhere, DateFilter, IdFilter } from './core/where'
export { defineOperation, type CustomOperation } from './core/operation'
export { VERSIONS, type RedmineVersion } from './generated/versions'

// ---- src/versions.ts: `redmine-ts-sdk/versions` (runtime-chosen editions; imports every edition) ----
import { createRedmine as create_6_1, operations as operations_6_1, type Redmine as Redmine_6_1 } from './generated/6.1'
import { createRedmine as create_7_0, operations as operations_7_0, type Redmine as Redmine_7_0 } from './generated/7.0'
import type { RedmineClient } from './core/client'
import type { RedmineConfig } from './core/transport'
import type { CommonOperations, RedmineVersion } from './generated/versions'

/** Discriminated by `version`; narrow to reach edition-only operations and fields. */
export type AnyRedmine = Redmine_6_1 | Redmine_7_0

/**
 * Supertype of every edition's client: operations all editions share, outputs as unions.
 * Version-agnostic helpers take this. Every `AnyRedmine` member must be assignable (type test enforces it).
 */
export type CommonRedmine = RedmineClient<RedmineVersion, CommonOperations>

/** Generated with the edition list; adding an edition adds a line here through gen, not by hand. */
const editions = {
  '6.1': { create: create_6_1, operations: operations_6_1 },
  '7.0': { create: create_7_0, operations: operations_7_0 },
} as const satisfies Record<RedmineVersion, unknown>

export function createRedmineFor<V extends RedmineVersion>(version: V, config: RedmineConfig): Extract<AnyRedmine, { version: V }> {
  // TODO: editions[version].create(config); unknown string at runtime → RangeError listing VERSIONS
  throw new Error('not implemented')
}

/** Parses an untrusted config value (env var, MCP config) into a version. No default: there is no "latest". */
export function parseRedmineVersion(value: string): RedmineVersion {
  // TODO: accept 'x.y' and 'x.y.z' (patch dropped); reject unknown with the VERSIONS list in the message
  throw new Error('not implemented')
}

// ---- src/versions-schemas.ts: `redmine-ts-sdk/versions/schemas` ----
// export const inputSchemas = { '6.1': schemas_6_1, '7.0': schemas_7_0 } as const
// Separate entry so browser bundles of client code never carry JSON Schemas.

// ---- src/testing.ts: `redmine-ts-sdk/testing` ----
export interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | Uint8Array | null
}

export type FakeRoute = (req: RecordedRequest) => { status: number; body?: unknown; headers?: Record<string, string> } | undefined

/** A `fetch` that answers from routes and records every request. Pass it as `config.fetch`. */
export function createFakeFetch(routes: readonly FakeRoute[]): typeof fetch & { readonly requests: readonly RecordedRequest[] } {
  // TODO: first route returning a response wins; no match → 404 with the URL in the body to make test failures obvious
  throw new Error('not implemented')
}
