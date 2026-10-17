// src/core/errors.ts — lives in the shared runtime chunk so `instanceof` holds across editions.
import type { RedmineVersion } from '../generated/versions'

export type RedmineErrorDetail =
  /** 422. Messages are localized to the API user's language: show them, never match on them. */
  | { readonly kind: 'validation'; readonly status: 422; readonly messages: readonly string[] }
  /** 401, or 403 when the REST API is disabled server-side (indistinguishable from `forbidden` by status alone). */
  | { readonly kind: 'unauthorized'; readonly status: 401 }
  | { readonly kind: 'forbidden'; readonly status: 403 }
  | { readonly kind: 'not_found'; readonly status: 404 }
  /** 406. Usually an upload sent with a content type other than application/octet-stream. */
  | { readonly kind: 'not_acceptable'; readonly status: 406 }
  /** 412 from X-Redmine-Switch-User: login unknown or inactive, or caller is not admin. */
  | { readonly kind: 'switch_user_failed'; readonly status: 412; readonly login: string }
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'network'; readonly cause: unknown }
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  /** Thrown before any network call when an instance's edition lacks the operation. */
  | {
      readonly kind: 'unsupported_in_version'
      readonly operation: string
      readonly version: RedmineVersion
      readonly availableIn: readonly RedmineVersion[]
    }
  /** Server ignored offset/limit (e.g. 6.0.1 projects): same first id twice, or more items than `limit`. */
  | { readonly kind: 'pagination_stalled'; readonly operation: string; readonly offset: number }
  | { readonly kind: 'invalid_response'; readonly status: number; readonly reason: string }

export type RedmineErrorKind = RedmineErrorDetail['kind']

/** Secrets are stripped before construction: no API key, password, or token appears in `url` or `message`. */
export interface RequestSummary {
  readonly operation: string
  readonly method: string
  readonly url: string
}

export class RedmineError<D extends RedmineErrorDetail = RedmineErrorDetail> extends Error {
  override readonly name = 'RedmineError'
  constructor(
    readonly detail: D,
    readonly request: RequestSummary | null,
    options?: { cause?: unknown },
  ) {
    super(describe(detail, request), options)
  }
}

export function isRedmineError<K extends RedmineErrorKind>(
  e: unknown,
  kind?: K,
): e is RedmineError<Extract<RedmineErrorDetail, { kind: K }>> {
  return e instanceof RedmineError && (kind === undefined || e.detail.kind === kind)
}

function describe(detail: RedmineErrorDetail, request: RequestSummary | null): string {
  throw new Error('not implemented')
}

/** Maps a non-2xx response to a detail. `body` is already parsed when JSON, else null. */
export function detailFromResponse(status: number, body: unknown, switchUser: string | undefined): RedmineErrorDetail {
  // TODO: 422 + {errors: string[]} → validation; 412 + switchUser → switch_user_failed; known statuses; else http
  throw new Error('not implemented')
}
