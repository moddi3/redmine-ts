// The pure half of a request: plan it, interpret the response, decide retries, decode.
// No fetch, no clocks, no state, so each Redmine quirk here is a table-driven unit test.

import type { RetryPolicy } from "./config.ts";
import { RedmineError, type RedmineErrorData } from "./errors.ts";
import { type Compiled, compileWhere, longForm, type Page } from "./listing.ts";
import type { AnyOp, QueryStyle } from "./op.ts";
import { normalizeResponse } from "./quirks.ts";
import { invalidInput, isRecord } from "./util.ts";

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
  /** The JSON body carried `lock_version`, which decides what an empty-errors 422 means. */
  readonly lockVersion: boolean;
}

export function planRequest(
  base: URL,
  op: AnyOp,
  input: Readonly<Record<string, unknown>>,
  extra: { as?: string; query?: Readonly<Record<string, string>> },
): Plan {
  const url = new URL(fillPath(op, input), base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw invalidInput(`path "${op.path}" resolves outside baseUrl`, op.id);
  }

  const params = url.searchParams;
  for (const [key, style] of Object.entries(op.query))
    appendQuery(params, op, key, style, input[key]);
  let filters: Record<string, Compiled> = {};
  // A raw request may have a real query parameter named `where`; only an op without one has filters there.
  if (input.where !== undefined && !Object.hasOwn(op.query, "where")) {
    if (!isRecord(input.where)) throw invalidInput("`where` must be an object", op.id);
    filters = compileWhere(op, input.where);
  }
  const query = extra.query ?? {};
  const long = longForm(op, filters, query);
  if (long === undefined) {
    for (const [key, { wire }] of Object.entries(filters)) params.set(key, wire);
    for (const [key, value] of Object.entries(query)) params.set(key, value);
  } else {
    for (const [key, value] of long) params.append(key, value);
  }

  const headers: Record<string, string> = {
    Accept: op.response.kind === "binary" ? "*/*" : "application/json",
  };
  if (extra.as !== undefined) headers["X-Redmine-Switch-User"] = extra.as;

  const owned = new Set([...op.pathParams, ...Object.keys(op.query), "where"]);
  const { body } = op;
  if (body === null) {
    rejectLeftovers(op, input, owned);
    return {
      method: op.method,
      url,
      headers,
      body: undefined,
      replayable: true,
      lockVersion: false,
    };
  }
  if (body.kind === "binary") {
    owned.add(body.key);
    rejectLeftovers(op, input, owned);
    const source = toBodyInit(input[body.key]);
    if (source === undefined) {
      throw invalidInput(
        `\`${body.key}\` must be a Blob, Uint8Array, ArrayBuffer or ReadableStream`,
        op.id,
      );
    }
    headers["Content-Type"] = "application/octet-stream";
    return {
      method: op.method,
      url,
      headers,
      body: source,
      replayable: !(source instanceof ReadableStream),
      lockVersion: false,
    };
  }
  if (body.kind === "value") {
    owned.add(body.key);
    rejectLeftovers(op, input, owned);
    const value = input[body.key];
    headers["Content-Type"] = "application/json";
    return {
      method: op.method,
      url,
      headers,
      body: jsonText(op, value),
      replayable: true,
      lockVersion: carriesLockVersion(value),
    };
  }

  const fields: Record<string, unknown> = {};
  const siblings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (owned.has(key)) continue;
    const sent = value === null && body.clear?.includes(key) ? "" : value;
    (body.siblings.includes(key) ? siblings : fields)[key] = sent;
  }
  const payload =
    body.envelope === null ? { ...fields, ...siblings } : { [body.envelope]: fields, ...siblings };
  headers["Content-Type"] = "application/json";
  return {
    method: op.method,
    url,
    headers,
    body: JSON.stringify(payload),
    replayable: true,
    lockVersion: carriesLockVersion(payload),
  };
}

/** `lock_version` at the top of the payload or inside its envelope (`{ issue: { lock_version } }`). */
function carriesLockVersion(payload: unknown): boolean {
  const has = (value: unknown): boolean => isRecord(value) && value.lock_version !== undefined;
  return has(payload) || (isRecord(payload) && Object.values(payload).some(has));
}

/** JSON.stringify would silently drop a function and turn NaN into null, so those are refused instead. */
function jsonText(op: AnyOp, value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value, (_key, v: unknown) => {
      const kind = typeof v;
      if (kind === "function" || kind === "symbol" || kind === "bigint") {
        throw new TypeError(`a ${kind} cannot be sent as JSON`);
      }
      if (typeof v === "number" && !Number.isFinite(v)) {
        throw new TypeError(`${String(v)} cannot be sent as JSON`);
      }
      return v;
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "it cannot be serialized";
    throw invalidInput(`request body is not JSON: ${reason}`, op.id);
  }
  if (text === undefined) throw invalidInput("request body must be a JSON value", op.id);
  return text;
}

function fillPath(op: AnyOp, input: Readonly<Record<string, unknown>>): string {
  let path = op.path;
  for (const key of op.pathParams) {
    const value = input[key];
    if (typeof value !== "string" && typeof value !== "number") {
      throw invalidInput(`path parameter \`${key}\` is required (string or number)`, op.id);
    }
    const text = String(value);
    if (text === "" || text === "." || text === "..") {
      throw invalidInput(`path parameter \`${key}\` is not a valid path segment`, op.id);
    }
    path = path.replace(`{${key}}`, () => encodeURIComponent(text));
  }
  return path;
}

function appendQuery(
  params: URLSearchParams,
  op: AnyOp,
  key: string,
  style: QueryStyle,
  value: unknown,
): void {
  if (value === undefined || value === null) return;
  const values = (Array.isArray(value) ? value : [value]).map((v) => queryText(op, key, v));
  if (Array.isArray(value) && values.length === 0) return;
  switch (style) {
    case "brackets":
      for (const v of values) params.append(`${key}[]`, v);
      break;
    case "repeat":
      for (const v of values) params.append(key, v);
      break;
    case "scalar":
    case "csv":
      params.set(key, values.join(","));
      break;
    default: {
      const exhaustive: never = style;
      return exhaustive;
    }
  }
}

function queryText(op: AnyOp, key: string, value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw invalidInput(`query parameter \`${key}\` takes strings, numbers or booleans`, op.id);
}

function rejectLeftovers(
  op: AnyOp,
  input: Readonly<Record<string, unknown>>,
  owned: ReadonlySet<string>,
): void {
  const leftover = Object.keys(input).filter((k) => !owned.has(k) && input[k] !== undefined);
  if (leftover.length > 0) {
    throw invalidInput(
      `${op.id} takes no ${leftover.map((k) => `\`${k}\``).join(", ")}; Redmine would silently ignore it`,
      op.id,
    );
  }
}

function toBodyInit(value: unknown): BodyInit | undefined {
  if (value instanceof Blob || value instanceof ArrayBuffer || value instanceof ReadableStream)
    return value;
  if (value instanceof Uint8Array) {
    return value.buffer instanceof ArrayBuffer
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : value.slice();
  }
  return undefined;
}

export type Outcome = { type: "ok"; value: unknown } | { type: "fail"; error: RedmineError };

const BODY_LIMIT = 2048;

/** Status plus raw text to a value or a typed error. The only owner of "what does this status mean". */
export function interpret(
  op: AnyOp,
  response: {
    status: number;
    contentType: string | null;
    text: string;
    requestId: string | null;
    /** What the request carried, which some statuses need to be read correctly. */
    switchUser: string | undefined;
    lockVersion: boolean;
  },
): Outcome {
  const { status, contentType, text } = response;
  const context = {
    op: op.id,
    ...(response.requestId === null ? {} : { request_id: response.requestId }),
  };
  const fail = (data: RedmineErrorData): Outcome => ({
    type: "fail",
    error: new RedmineError(data, context),
  });

  if (status >= 200 && status < 300) {
    if (text.trim() === "") return { type: "ok", value: undefined };
    if (contentType !== null && !/json/i.test(contentType)) {
      return fail({
        kind: "protocol",
        reason: "non_json",
        hint: `expected JSON but got "${contentType}"; baseUrl may point at a login page or the wrong subpath (e.g. a missing "/redmine"), or the REST API is disabled`,
      });
    }
    try {
      return { type: "ok", value: JSON.parse(text) };
    } catch {
      return fail({
        kind: "protocol",
        reason: "bad_json",
        hint: "the response body is not valid JSON",
      });
    }
  }

  switch (status) {
    case 401:
      return fail({ kind: "unauthorized", status });
    case 403:
      return fail({ kind: "forbidden", status });
    case 404:
      return fail({ kind: "not_found", status });
    case 406:
      return fail({ kind: "not_acceptable", status });
    case 409:
      return fail({ kind: "conflict", status });
    case 412:
      if (response.switchUser === undefined) break;
      return fail({
        kind: "switch_user_rejected",
        reason: "rejected_by_server",
        status,
        login: response.switchUser,
      });
    case 422: {
      const messages = validationMessages(text);
      if (messages?.length === 0 && response.lockVersion) return fail({ kind: "conflict", status });
      if (messages !== undefined) return fail({ kind: "validation", status, messages });
      break;
    }
  }
  return fail({ kind: "http", status, body: truncate(text) });
}

function validationMessages(text: string): readonly string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.errors)) return undefined;
    const errors: unknown[] = parsed.errors;
    return errors.every((e) => typeof e === "string") ? errors : undefined;
  } catch {
    return undefined;
  }
}

function truncate(text: string): string {
  if (text.length <= BODY_LIMIT) return text;
  const bytes = new TextEncoder().encode(text);
  return bytes.length <= BODY_LIMIT
    ? text
    : new TextDecoder().decode(bytes.subarray(0, BODY_LIMIT));
}

/**
 * Pure retry decision. 429 retries any method (the request was not executed). 502, 503, 504, network
 * errors and timeouts retry only read and idempotent operations. Writes never retry: a replayed PUT with
 * notes appends a second journal. Non-replayable bodies never retry.
 * `attempt` counts the retries already made, so it is 0 after the first failure.
 */
export function retryDecision(
  op: AnyOp,
  error: RedmineError,
  attempt: number,
  policy: RetryPolicy,
  replayable: boolean,
  retryAfterMs: number | undefined,
): { retry: false } | { retry: true; delayMs: number } {
  if (!replayable || attempt >= policy.attempts || !isRetryable(op, error)) return { retry: false };
  const jitter = Math.random() * policy.baseMs * 2 ** attempt;
  return { retry: true, delayMs: Math.min(policy.maxMs, retryAfterMs ?? jitter) };
}

function isRetryable(op: AnyOp, error: RedmineError): boolean {
  const { data } = error;
  if (data.kind === "http" && data.status === 429) return true;
  const transient =
    data.kind === "network" ||
    data.kind === "timeout" ||
    (data.kind === "http" && (data.status === 502 || data.status === 503 || data.status === 504));
  return transient && op.safety !== "write";
}

/** After interpret: unwrap the envelope and apply symptom fixes. Still pure. */
export function decode(op: AnyOp, value: unknown, normalize: boolean): unknown {
  const { response } = op;
  switch (response.kind) {
    case "item": {
      const wire = normalize ? normalizeResponse(value) : value;
      return response.unwrap !== null && isRecord(wire) ? wire[response.unwrap] : wire;
    }
    case "list":
      return decodePage(op, value, normalize);
    case "empty":
    case "binary":
      return undefined;
    default: {
      const exhaustive: never = response;
      return exhaustive;
    }
  }
}

/** The list branch of `decode`, typed. */
export function decodePage(op: AnyOp, value: unknown, normalize: boolean): Page<unknown> {
  const { response } = op;
  if (response.kind !== "list") throw invalidInput(`${op.id} is not a list operation`, op.id);
  const wire = normalize ? normalizeResponse(value) : value;
  const items = isRecord(wire) ? wire[response.items] : undefined;
  if (!Array.isArray(items) || !isRecord(wire)) {
    throw new RedmineError(
      { kind: "protocol", reason: "bad_json", hint: `expected an array under "${response.items}"` },
      { op: op.id },
    );
  }
  const count = (key: string, fallback: number): number =>
    typeof wire[key] === "number" ? wire[key] : fallback;
  return {
    items,
    total_count: response.paged ? count("total_count", items.length) : undefined,
    offset: count("offset", 0),
    limit: count("limit", items.length),
  };
}
