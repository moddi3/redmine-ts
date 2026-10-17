// src/core/wire.ts. The PURE half of a request: plan it, classify the response, decide retries, decode.
// No fetch, no clocks, no state. Every Redmine quirk in research.md that is not "concurrency" lives here or in quirks.ts,
// and every one of them is a table-driven unit test.

import type { AnyOp } from "./op.ts";
import type { RetryPolicy } from "./config.ts";
import type { RedmineError } from "./errors.ts";

/** A request with everything decided except credentials, signal, and the semaphore. */
export interface Plan {
  readonly method: string;
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>; // accept, content-type (only when a body exists), switch-user
  readonly body: BodyInit | undefined; // PUT/DELETE/POST without a body send NONE (no content-type, no "null")
  readonly replayable: boolean; // false for ReadableStream bodies: no retry, no 401 replay
}

export function planRequest(
  base: URL,
  op: AnyOp,
  input: Readonly<Record<string, unknown>>,
  extra: { as?: string; extraQuery?: Record<string, string> },
): Plan {
  throw new Error("not implemented");
  // TODO split the flat input by descriptor (no collisions: the generator proved it):
  //   path  = op.pathParams.map(k => encodeURIComponent(String(input[k])))  -> fill "{k}" in op.path
  //   url   = new URL(filledPath, base)         // base ends with "/", path has no leading "/": subpath survives
  //   query = keys in op.query ("csv" arrays joined by ",") + compileWhere(op, input.where) + extraQuery; skip undefined
  //   body  = op.body null -> none; json -> JSON.stringify(envelope ? {[envelope]: rest} : rest) where rest = keys not path/query/where
  //           binary -> input[op.body.key] as-is, content-type application/octet-stream (anything else is a 406)
  //   unknown key left over on a bodyless op -> invalid_input (typo protection; Redmine would ignore it silently)
}

export type Outcome =
  | { type: "ok"; value: unknown }
  | { type: "fail"; error: RedmineError };

/** Status + raw text -> value or typed error. Sole owner of "what does this status mean". */
export function interpret(
  op: AnyOp,
  res: { status: number; contentType: string | null; text: string; requestId: string | null },
): Outcome {
  throw new Error("not implemented");
  // TODO 2xx: empty text -> {value: undefined} (PUT/DELETE bodies are empty; naive res.json() throws)
  //          non-JSON content-type on a json op -> protocol/non_json, hint "baseUrl probably points at the login page / wrong subpath"
  //          JSON.parse failure -> protocol/bad_json
  //      422: {errors: string[]} -> validation{messages}; 401/403/404/406 -> their kinds
  //      412: switch_user_rejected (login is echoed from the request, not parsed from the localized body)
  //      other: http{status, body: truncated}
}

/** Pure retry decision. Table in config.ts. `attempt` is 0-based count of attempts already made. */
export function retryDecision(
  op: AnyOp,
  err: RedmineError,
  attempt: number,
  policy: RetryPolicy,
  replayable: boolean,
  retryAfterMs: number | undefined,
): { retry: false } | { retry: true; delayMs: number } {
  throw new Error("not implemented");
  // TODO status 429 -> retry for any safety; (502|503|504|network|timeout) -> only op.safety !== "write"; require replayable
  //      delayMs = min(maxMs, retryAfterMs ?? random(0, baseMs * 2 ** attempt))   // full jitter
}

/** After interpret: unwrap the envelope, run the quirk for this op if any. Still pure. */
export function decode(op: AnyOp, value: unknown, normalize: boolean): unknown {
  throw new Error("not implemented");
  // TODO item: value[unwrap] ; list: Page built from {[items], total_count, offset, limit} ; empty -> undefined
  //      normalize ? (QUIRKS[op.id]?.(value) ?? value) : value
}
