// The impure shell: fetch, timeouts, the concurrency limit and the retry loop. It asks wire.ts for every
// decision and reads everything about an operation off the Op, so it works with any registry.

import type { CallOptions, ResolvedConfig } from "./config.ts";
import type { AnyOp, InputOf, ReturnOf } from "./op.ts";

/** One engine per createRedmine(). Owns the only shared mutable state in the SDK: the concurrency limiter. */
export interface Engine {
  readonly config: ResolvedConfig;
  /** The single dispatch path. Namespaces, extras, files and the future toolkit all go through it. */
  call<O extends AnyOp>(op: O, input: InputOf<O>, options?: CallOptions): ReturnOf<O>;
  /**
   * Same pipeline without decoding, for binary responses and `rm.request`. The timeout and the
   * concurrency slot cover the request until response headers arrive; the body stream then belongs to
   * the caller, who cancels it through their own signal.
   */
  send(
    op: AnyOp,
    input: Readonly<Record<string, unknown>>,
    options?: CallOptions,
  ): Promise<Response>;
}

export function createEngine(_config: ResolvedConfig): Engine {
  throw new Error("not implemented");
  // call(op, input, options):
  //   1. guard: !isAvailable(config.version, op.since, op.until) -> unsupported_version, before any I/O
  //   2. list   -> createListing(op, input, page => execute(op, input, options, page query).then(decode))
  //      binary -> send(...) wrapped as a Download
  //      else   -> execute(...).then(value => decode(op, value, config.normalize))
  //   3. execute: plan once; per attempt acquire a slot (abortable), add auth headers,
  //      signal = AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]), fetch, read text, interpret, release.
  //      AbortError: timeout signal -> timeout, caller signal -> aborted; other fetch failures -> network.
  //      401 + auth.onUnauthorized() + replayable -> replay once.
  //      not_found on an operation newer than the oldest version, with no declared version -> add a hint naming `since`.
  //      otherwise retryDecision -> sleep (slot released, abortable) or throw. Emit SdkEvents throughout.
}
