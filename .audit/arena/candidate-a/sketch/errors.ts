import type { RedmineVersion } from './generated/versions.ts'

/** Everything that can go wrong, as data. Switch on `kind`; the compiler checks exhaustiveness. */
export type Problem =
  /** 422. Messages are localized to the API user's language: show them, never match on them. */
  | { readonly kind: 'validation'; readonly messages: readonly string[] }
  /** 401: missing or bad credentials (after one bearer refresh, if configured). */
  | { readonly kind: 'unauthorized' }
  /** 403: no permission, or the REST API is disabled on the server. */
  | { readonly kind: 'forbidden' }
  /** 404. `hint` names `since` when the operation is newer than the oldest supported version. */
  | { readonly kind: 'not_found'; readonly hint?: string }
  /** 412: X-Redmine-Switch-User login unknown or inactive, or the caller is not admin. */
  | { readonly kind: 'switch_user_rejected'; readonly login: string }
  /** Declared `redmine` version predates the operation. Raised before any network call. */
  | { readonly kind: 'unsupported_operation'; readonly since: RedmineVersion; readonly declared: RedmineVersion }
  /** Untyped input reached the encoder in a shape it cannot send. */
  | { readonly kind: 'invalid_input'; readonly key: string; readonly reason: string }
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'timeout'; readonly ms: number }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'network'; readonly cause: unknown }
  /** 2xx that should have been JSON and wasn't (proxy login page, HTML error page). */
  | { readonly kind: 'decode'; readonly status: number; readonly snippet: string }

export interface RequestSummary {
  readonly method: string
  /** Credentials never appear here: the key is header-only and Basic/Bearer headers are not copied. */
  readonly url: string
}

export class RedmineError extends Error {
  readonly problem: Problem
  readonly operation: string
  readonly status: number | undefined
  readonly attempts: number
  readonly request: RequestSummary

  constructor(init: { problem: Problem; operation: string; status?: number; attempts: number; request: RequestSummary }) {
    super('not implemented')
    throw new Error('not implemented')
  }
}

/** Pure. Maps a finished non-2xx response to a Problem. */
export function problemFromResponse(
  status: number,
  body: string,
  ctx: { since: RedmineVersion; oldest: RedmineVersion; switchUser: string | undefined; opLabel: string },
): Problem {
  // TODO: 422 -> parse { errors: string[] } (fallback: [body snippet]); 412 -> switch_user_rejected
  //       404 -> hint when ctx.since !== ctx.oldest; 401/403 direct; else http.
  throw new Error('not implemented')
}

export function isRetryableProblem(p: Problem, status: number | undefined): boolean {
  // TODO: network, timeout (per-attempt only, not the caller's signal), http 429/502/503/504
  throw new Error('not implemented')
}
