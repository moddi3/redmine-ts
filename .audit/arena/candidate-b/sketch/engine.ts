// src/core/engine.ts. The impure shell: fetch, timeouts, the semaphore, the retry loop. ~150 lines when filled in.
// Everything it decides, it asks wire.ts. Everything it needs to know about an operation, it reads off the Op.
// It imports NO generated data: give it any Op and it works (tests do exactly that).

import type { AnyOp, InputOf, ReturnOf } from "./op.ts";
import type { CallOptions, ResolvedConfig } from "./config.ts";

/**
 * One engine per createRedmine(). Owns the only shared mutable state in the SDK: the semaphore.
 * `Engine.call` is the single dispatch seam: namespaces, extras, files, the toolkit and tests all go through it.
 */
export interface Engine {
  call<O extends AnyOp>(op: O, input: InputOf<O>, opts?: CallOptions): ReturnOf<O>;
  /** Raw escape for files.ts (binary responses, streamed bodies): same pipeline, no decode. */
  send(op: AnyOp, input: Readonly<Record<string, unknown>>, opts?: CallOptions): Promise<Response>;
}

export function createEngine(cfg: ResolvedConfig): Engine {
  const semaphore = new Semaphore(cfg.maxConcurrent); // FIFO; released during backoff sleeps, held only while a request is in flight
  throw new Error("not implemented");

  // call(op, input, opts):
  //   1. guard      if (!isAvailable(cfg.version, op.since, op.until)) throw unsupported_version      // before any I/O
  //   2. dispatch   switch (op.response.kind)
  //        "list"   -> return createListing(op, input, ({offset, limit, extra}) => this.execute(op, input, opts, {offset, limit, ...extra}).then(toPage))
  //        "binary" -> return Download (files.ts wraps the Response; engine only does send())
  //        else     -> return execute(...).then(v => decode(op, v, cfg.normalize))
  //   3. execute    // one logical request, many attempts
  //        plan = planRequest(cfg.base, op, input, {as: opts.as, extraQuery})
  //        for (attempt = 0; ; attempt++):
  //          release = await semaphore.acquire(opts.signal)
  //          try:
  //            headers = {...plan.headers, ...await cfg.auth.headers()}
  //            signal  = AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs ?? cfg.timeoutMs)].filter(Boolean))
  //            emit request; res = await cfg.fetch(plan.url, {method, headers, body, signal, duplex: "half" if stream})
  //            out = interpret(op, {status, contentType, text: await res.text(), requestId})
  //          catch e: out = fail(mapFetchError(e, signal))   // AbortError + timeout signal -> timeout; caller signal -> aborted; else network
  //          finally: release()
  //          if out ok -> emit response; return value
  //          if out is 401 and cfg.auth.onUnauthorized() resolved true and plan.replayable and !refreshed -> refreshed = true; continue
  //          d = retryDecision(op, out.error, attempt, policy, plan.replayable, retryAfter)
  //          if !d.retry -> emit error; throw out.error
  //          emit retry; await sleep(d.delayMs, opts.signal)
}

class Semaphore {
  constructor(readonly max: number) {}
  acquire(signal?: AbortSignal): Promise<() => void> {
    throw new Error("not implemented"); // TODO queue of resolvers; abort while queued rejects with aborted
  }
}
