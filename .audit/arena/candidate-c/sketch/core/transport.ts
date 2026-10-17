// src/core/transport.ts — the only module that touches fetch, Request, or Response.
import type { WireRequest } from './operation'

export type Auth =
  | { readonly apiKey: string }
  | { readonly basic: { readonly username: string; readonly password: string } }
  | {
      readonly bearer: {
        readonly token: () => string | Promise<string>
        /** Called once on 401; concurrent requests share the in-flight refresh. */
        readonly refresh?: () => Promise<string>
      }
    }

export interface RedmineConfig {
  /** May include a subpath (`https://host/redmine/`); it is preserved, unlike `new URL('/issues.json', base)`. */
  readonly baseUrl: string
  readonly auth: Auth
  /** Defaults to `globalThis.fetch`. Inject for custom CA, proxies, browsers behind a CORS proxy, or tests. */
  readonly fetch?: typeof fetch
  /** Per attempt. Default 30_000. */
  readonly timeoutMs?: number
  /** In-flight request cap per client. Default 4: Redmine has no rate limit and no bulk endpoints. */
  readonly maxConcurrency?: number
  /** Idempotent methods only. Default `{ attempts: 3, baseDelayMs: 300 }`, retrying on network, 502, 503, 504. */
  readonly retry?: { readonly attempts: number; readonly baseDelayMs: number } | false
  readonly hooks?: {
    readonly onRequest?: (e: { operation: string; method: string; url: string }) => void
    readonly onResponse?: (e: { operation: string; status: number; durationMs: number }) => void
  }
}

/** Per-call options, identical on every edition. */
export interface CallOptions {
  readonly signal?: AbortSignal
  /** Impersonate a user via X-Redmine-Switch-User (admin only). Per call, never client state. */
  readonly as?: string
  readonly timeoutMs?: number
}

export interface Transport {
  /** Resolves to parsed JSON, `undefined` for empty bodies, or a stream for binary responses. Throws RedmineError. */
  send(req: WireRequest, opts: CallOptions | undefined): Promise<unknown>
}

export function createTransport(config: RedmineConfig): Transport {
  // TODO:
  //   base = normalizeBase(config.baseUrl)                     // ensure trailing slash, keep subpath
  //   limiter = createLimiter(config.maxConcurrency ?? 4)
  //   send(req, opts):
  //     url = joinUrl(base, req.path, req.query)
  //     headers: Accept json; auth header (X-Redmine-API-Key | Basic | Bearer); X-Redmine-Switch-User if opts.as
  //     body: json → JSON.stringify + content-type json; binary → octet-stream (406 otherwise)
  //     loop attempt in 1..attempts (1 when !req.idempotent):
  //       await limiter slot; signal = AbortSignal.any([opts.signal, AbortSignal.timeout(t)].filter(Boolean))
  //       res = await fetch(new Request(url, …)) catching TypeError → network, TimeoutError → timeout
  //       401 && bearer.refresh && !refreshedOnce → singleFlightRefresh(); retry this attempt once
  //       retryable(res.status) && attempt < max → sleep(jittered backoff); continue
  //       return parseBody(res, req.response)
  //   parseBody: 204 or empty text → undefined; json → JSON.parse(text) (invalid → invalid_response); binary → res.body
  //   non-2xx → throw new RedmineError(detailFromResponse(...), redact(summary))
  throw new Error('not implemented')
}

/** Pure. `joinUrl('https://h/redmine/', '/issues.json', [['limit','100']])` → `https://h/redmine/issues.json?limit=100`. */
export function joinUrl(base: string, path: string, query: readonly (readonly [string, string])[]): string {
  throw new Error('not implemented')
}

/** Pure. Downloads use the path from baseUrl, never the server's absolute content_url (wrong host behind proxies). */
export function attachmentDownloadPath(id: number, filename: string): string {
  throw new Error('not implemented')
}
