import type { OperationId, Operations, Namespace } from './generated/operations.ts'
import type { OpsIn, RedmineVersion } from './generated/versions.ts'
import type { Listing } from './listing.ts'
import type { Download } from './files.ts'
import type { RedmineEvent } from './execute.ts'

export type Auth =
  | { readonly apiKey: string; readonly basic?: never; readonly bearer?: never }
  | { readonly basic: { readonly username: string; readonly password: string }; readonly apiKey?: never; readonly bearer?: never }
  | {
      readonly bearer: {
        /** Current access token. Called per request so callers can share a token store. */
        readonly token: () => string | Promise<string>
        /** Called once on 401, single-flight across concurrent calls; the request is replayed once. */
        readonly refresh?: () => Promise<string>
      }
      readonly apiKey?: never
      readonly basic?: never
    }

export interface RedmineOptions<V extends RedmineVersion> {
  /** Absolute http(s) URL. A path prefix (`/redmine/`) is kept; query and hash are rejected. */
  readonly baseUrl: string | URL
  /** Omit for anonymous access to public projects. */
  readonly auth?: Auth
  /** Declares the server version: hides newer operations from the type and gates them at runtime. */
  readonly redmine?: V
  /** Inject for proxies, custom CAs, browsers behind a CORS proxy, and tests. Defaults to globalThis.fetch. */
  readonly fetch?: typeof fetch
  /** Max requests in flight per client. Default 4. */
  readonly concurrency?: number
  /** Per attempt. Default 30_000. */
  readonly timeoutMs?: number
  /** Retries for retry-safe operations. Default 2. */
  readonly retries?: number
  /** Redacted request/response/retry events for logging and metrics. */
  readonly onEvent?: (event: RedmineEvent) => void
}

export interface CallOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  /** Impersonate this login for this call only (X-Redmine-Switch-User, admin only). */
  readonly as?: string
  /** `false` disables retries for this call even when the operation is retry-safe. */
  readonly retry?: boolean
}

type Kind<Id extends OperationId> = Operations[Id]['kind']
type In<Id extends OperationId> = Operations[Id]['input']
type Out<Id extends OperationId> = Operations[Id]['output']

type Result<Id extends OperationId> = {
  entity: Promise<Out<Id>>
  list: Promise<readonly Out<Id>[]>
  paged: Listing<Out<Id>>
  empty: Promise<void>
  binary: Promise<Download>
}[Kind<Id>]

/** Input is optional exactly when the operation has no required key. */
export type Method<Id extends OperationId> = Operations[Id]['required'] extends true
  ? (input: In<Id>, opts?: CallOptions) => Result<Id>
  : (input?: In<Id>, opts?: CallOptions) => Result<Id>

/** Distributes: an undeclared version (the full union) makes every operation available. */
type AvailableIn<V extends RedmineVersion> = V extends RedmineVersion ? OpsIn[V] : never

export type Redmine<V extends RedmineVersion = RedmineVersion> = {
  readonly [NS in Namespace]: {
    readonly [Id in AvailableIn<V> as Operations[Id]['ns'] extends NS ? Operations[Id]['verb'] : never]: Method<Id>
  }
}

/**
 * Parses options once (the boundary), then builds `rm.<namespace>.<verb>` by looping over the
 * registry. Each method is a closure over its OperationDef and the shared executor; operations
 * newer than a declared version are still built (for untyped callers) but reject with
 * `unsupported_operation`.
 */
export function createRedmine<const V extends RedmineVersion = RedmineVersion>(options: RedmineOptions<V>): Redmine<V> {
  // TODO:
  //   const config = parseOptions(options)            // throws TypeError on bad baseUrl/auth/limits
  //   const exec = createExecutor(config)             // owns limiter, auth state, fetch
  //   const client = {}
  //   for (const def of Object.values(registry))
  //     (client[def.namespace] ??= {})[def.verb] =
  //       def.response.kind === 'paged' ? (input, opts) => createListing(exec, def, input ?? {}, opts)
  //                                     : (input, opts) => exec.run(def, input ?? {}, opts)
  //   return deepFreeze(client)
  throw new Error('not implemented')
}

export interface Config {
  /** Always ends with '/', so relative operation paths keep the subpath. */
  readonly base: URL
  readonly auth: Auth | undefined
  readonly declared: RedmineVersion | undefined
  readonly fetch: typeof fetch
  readonly concurrency: number
  readonly timeoutMs: number
  readonly retries: number
  readonly onEvent: ((event: RedmineEvent) => void) | undefined
}

export function parseOptions(options: RedmineOptions<RedmineVersion>): Config {
  // TODO: new URL(baseUrl); protocol http/https; no search/hash; pathname += '/' if missing;
  //       reject embedded credentials (user:pass@host) with a message pointing at `auth`.
  throw new Error('not implemented')
}
