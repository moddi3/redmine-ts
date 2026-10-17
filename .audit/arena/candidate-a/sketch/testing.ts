// Subpath `redmine-ts-sdk/testing`. The fake is a `fetch`, because fetch is the only injection seam:
// tests exercise the real pipeline (routing, retries, decoding) and assert what went on the wire.

export interface RecordedCall {
  readonly method: string
  readonly url: URL
  readonly headers: Headers
  readonly body: unknown
}

export type FakeReply =
  | { readonly status: number; readonly json?: unknown; readonly text?: string; readonly headers?: Record<string, string> }
  | { readonly networkError: true }

/** Route key: `METHOD path` relative to the base, without query, e.g. `GET issues/42.json`. */
export type FakeRoutes = Record<string, FakeReply | readonly FakeReply[] | ((call: RecordedCall) => FakeReply)>

export interface FakeFetch {
  readonly fetch: typeof fetch
  readonly calls: readonly RecordedCall[]
}

/**
 * An array value replies in sequence (for retry tests: `[{ status: 503 }, { status: 200, json }]`).
 * An unmatched route fails the test with the full call list.
 */
export function createFakeFetch(routes: FakeRoutes, base?: string): FakeFetch {
  throw new Error('not implemented')
}
