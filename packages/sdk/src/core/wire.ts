// The pure half of a request: plan it, interpret the response, decide retries, decode.
// No fetch, no clocks, no state, so each Redmine quirk here is a table-driven unit test.

import type { RetryPolicy } from "./config.ts";
import type { RedmineError } from "./errors.ts";
import type { AnyOp } from "./op.ts";

/** A request with everything decided except credentials, signal and the concurrency slot. */
export interface Plan {
  readonly method: string;
  readonly url: URL;
  /** Accept, Content-Type (only with a body), X-Redmine-Switch-User. */
  readonly headers: Readonly<Record<string, string>>;
  /** Bodyless PUT/DELETE/POST send nothing: no Content-Type, no "null". */
  readonly body: BodyInit | undefined;
  /** False for ReadableStream bodies: no retry and no 401 replay. */
  readonly replayable: boolean;
}

export function planRequest(
  _base: URL,
  _op: AnyOp,
  _input: Readonly<Record<string, unknown>>,
  _extra: { as?: string; query?: Readonly<Record<string, string>> },
): Plan {
  throw new Error("not implemented");
  // path:  fill each "{k}" with encodeURIComponent(String(input[k])); new URL(path, base) keeps the subpath
  // query: op.query keys by style (scalar, csv joined by ",", brackets k[]=a&k[]=b), compileWhere(op, input.where),
  //        extra.query; skip undefined
  // body:  json -> JSON.stringify({ [envelope]: rest, ...siblings }) or rest when envelope is null,
  //        where rest = keys that are not path, query, where or siblings
  //        binary -> input[key] as is with Content-Type application/octet-stream
  // a leftover key on a bodyless op -> invalid_input, because Redmine would silently ignore it
}

export type Outcome = { type: "ok"; value: unknown } | { type: "fail"; error: RedmineError };

/** Status plus raw text to a value or a typed error. The only owner of "what does this status mean". */
export function interpret(
  _op: AnyOp,
  _response: {
    status: number;
    contentType: string | null;
    text: string;
    requestId: string | null;
    switchUser: string | undefined;
  },
): Outcome {
  throw new Error("not implemented");
  // 2xx: empty text -> undefined (PUT/DELETE bodies are empty; a naive res.json() throws)
  //      non-JSON content type -> protocol/non_json with a hint that baseUrl may point at a login page or wrong subpath
  //      JSON.parse failure -> protocol/bad_json
  // 422 {errors: string[]} -> validation; 401/403/404/406 -> their kinds; 412 -> switch_user_rejected with the requested login
  // anything else -> http with the body truncated to 2 KiB
}

/**
 * Pure retry decision. 429 retries any method (the request was not executed). 502, 503, 504, network
 * errors and timeouts retry only read and idempotent operations. Writes never retry: a replayed PUT with
 * notes appends a second journal. Non-replayable bodies never retry.
 */
export function retryDecision(
  _op: AnyOp,
  _error: RedmineError,
  _attempt: number,
  _policy: RetryPolicy,
  _replayable: boolean,
  _retryAfterMs: number | undefined,
): { retry: false } | { retry: true; delayMs: number } {
  throw new Error("not implemented");
  // delayMs = min(maxMs, retryAfterMs ?? random(0, baseMs * 2 ** attempt))
}

/** After interpret: unwrap the envelope and apply symptom fixes. Still pure. */
export function decode(_op: AnyOp, _value: unknown, _normalize: boolean): unknown {
  throw new Error("not implemented");
  // item -> value[unwrap] (undefined stays undefined); list -> Page { items: value[items], total_count, offset, limit }
  // empty -> undefined; then normalizeResponse(value) when normalize is on
}
