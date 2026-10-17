// The one pipeline every operation runs through. Owns all mutable client state:
// the concurrency limiter and the bearer refresh promise. Nothing else writes either.

import type { CallOptions, Config } from './client.ts'
import type { OperationDef } from './def.ts'
import type { Problem } from './errors.ts'
import type { EncodedRequest } from './request.ts'

export type RedmineEvent =
  | { readonly type: 'request'; readonly operation: string; readonly method: string; readonly url: string; readonly attempt: number }
  | { readonly type: 'response'; readonly operation: string; readonly status: number; readonly ms: number }
  | { readonly type: 'retry'; readonly operation: string; readonly attempt: number; readonly delayMs: number; readonly problem: Problem }

export interface Executor {
  /** Runs one non-paged operation and returns its decoded result (entity, list, void, Download). */
  run(def: OperationDef, input: Record<string, unknown>, opts: CallOptions | undefined): Promise<unknown>
  /** One raw page for Listing: same pipeline, returns the undecoded envelope. */
  page(def: OperationDef, input: Record<string, unknown>, opts: CallOptions | undefined): Promise<RawPage>
}

export interface RawPage {
  readonly items: readonly Record<string, unknown>[]
  readonly total_count: number | null
  readonly offset: number | null
  readonly limit: number | null
}

export function createExecutor(config: Config): Executor {
  // TODO:
  //   const limiter = createLimiter(config.concurrency)
  //   const auth = createAuthState(config.auth)       // single-flight refresh lives here
  //   async function run(def, input, opts):
  //     gate(def, config.declared)                     // unsupported_operation before network
  //     input = await resolveInlineUploads(def, input, send)   // files -> tokens, sequential
  //     const req = encodeRequest(def, input, config.base, opts?.as)
  //     const res = await sendWithRetry(def, input, req, opts)
  //     return decode(def, res)                        // envelope unwrap + normalize
  //   sendWithRetry:
  //     for attempt in 1..(retryAllowed(def, input, opts) ? config.retries + 1 : 1):
  //       try: res = await limiter.run(() => sendOnce(req, attempt, opts))
  //       on 401 with bearer.refresh and !refreshed: await auth.refresh(); refreshed = true; replay (not counted)
  //       on DELETE && attempt > 1 && 404: return empty success (first attempt already deleted)
  //       on 2xx: return res
  //       problem = problemFromResponse(...) / network / timeout
  //       if !isRetryableProblem(problem) or last attempt: throw new RedmineError(...)
  //       delay = retryAfter(res) ?? jitter(250ms * 2^(attempt-1)); emit retry; await sleep(delay, opts.signal)
  //   sendOnce:
  //     signal = AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs ?? config.timeoutMs)].filter(Boolean))
  //     headers = { ...req.headers, ...(await auth.headers()) }
  //     distinguish caller abort (aborted) from per-attempt timeout (timeout, retryable)
  throw new Error('not implemented')
}

/** Pure. Whether this call may be replayed after a retryable failure. */
export function retryAllowed(def: OperationDef, input: Record<string, unknown>, opts: CallOptions | undefined): boolean {
  // TODO: opts?.retry === false -> false; def.retry 'safe' -> true; 'never' -> false;
  //       { unlessFields } -> none of those keys present (non-undefined) in input.
  throw new Error('not implemented')
}

/** Pure. Envelope unwrap by def.response.kind, then normalize by envelope key. */
export function decode(def: OperationDef, status: number, text: string): unknown {
  // TODO: empty -> undefined regardless of body (204, or 200 with '' / ' ');
  //       entity -> normalize(key, json[key]); list -> json[key].map(...);
  //       non-JSON 2xx text -> RedmineError decode. binary handled before text is read.
  throw new Error('not implemented')
}

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>
}

/** FIFO semaphore. Released in finally, so an aborted or failed task never leaks a slot. */
export function createLimiter(max: number): Limiter {
  throw new Error('not implemented')
}

export interface AuthState {
  headers(): Promise<Record<string, string>>
  /** Single-flight: concurrent callers await the same promise; cleared when it settles. */
  refresh(): Promise<void>
}

export function createAuthState(auth: Config['auth']): AuthState {
  // TODO: apiKey -> X-Redmine-API-Key; basic -> Authorization: Basic base64(utf8(user:pass));
  //       bearer -> Authorization: Bearer await token(); never a `key=` query param.
  throw new Error('not implemented')
}

export type { EncodedRequest }
