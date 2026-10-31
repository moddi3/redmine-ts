// The impure shell: fetch, timeouts, the concurrency limit and the retry loop. It asks wire.ts for every
// decision and reads everything about an operation off the Op, so it works with any registry.

import { VERSIONS } from "../generated/versions.ts";
import { ACCESS_METHODS, DEFAULT_RETRY, resolveRetry } from "./config.ts";
import type { CallOptions, ResolvedConfig, RetryPolicy, SdkEvent } from "./config.ts";
import { RedmineError } from "./errors.ts";
import { markSent, toDownload } from "./files.ts";
import { createAdminGuard, currentUserOp } from "./impersonation.ts";
import { createListing } from "./listing.ts";
import type { FetchPage, ListInput } from "./listing.ts";
import type { AnyOp, InputOf, ReturnOf } from "./op.ts";
import { invalidInput, isRecord } from "./util.ts";
import { isAvailable } from "./version.ts";
import { decode, decodePage, deletedBy, interpret, planRequest, retryDecision } from "./wire.ts";
import type { Plan } from "./wire.ts";

/** One engine per createRedmine(). Owns two pieces of mutable state its requests share: the concurrency limiter and the cached admin check. */
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
  /** Why the client refuses `op` without sending anything (its `access` or declared `version`), if it does. */
  refusal(op: AnyOp): RedmineError | undefined;
  checkDeletion(op: AnyOp, plan: Plan, options: CallOptions): Promise<RedmineError | undefined>;
}

interface Delivered {
  response: Response;
  /** Decoded JSON for text mode, undefined in stream mode. */
  value: unknown;
}

interface Failed {
  error: RedmineError;
  sent: Record<string, string>;
  retryAfterMs: number | undefined;
}

export function createEngine(config: ResolvedConfig): Engine {
  const limiter = createLimiter(config.maxConcurrent);
  const adminGuard = createAdminGuard(async () =>
    decode(currentUserOp, (await run(currentUserOp, {}, {}, undefined, false)).value, false),
  );

  function emit(event: SdkEvent): void {
    notifyObserver(() => config.onEvent?.(event));
  }

  function refusal(op: AnyOp): RedmineError | undefined {
    const { access, version } = config;
    if (access !== "full" && !ACCESS_METHODS[access].includes(op.method)) {
      return new RedmineError({ kind: "access_denied", access, method: op.method }, { op: op.id });
    }
    if (version === undefined || isAvailable(version, op.since, op.until)) return undefined;
    return new RedmineError(
      { kind: "unsupported_version", declared: version, since: op.since, until: op.until },
      { op: op.id },
    );
  }

  async function checkDeletion(
    op: AnyOp,
    plan: Plan,
    options: CallOptions,
  ): Promise<RedmineError | undefined> {
    const { access } = config;
    if (access === "full") return undefined;
    const deleting = deletedBy(config.base, plan);
    if (deleting === undefined) return undefined;
    const { unless } = deleting;
    if (unless !== undefined) {
      const { value } = await run(unless.read, {}, options, undefined, false);
      if (unless.keeps(decode(unless.read, value, false))) return undefined;
    }
    return new RedmineError(
      { kind: "access_denied", access, method: op.method, deletes: deleting.effect },
      { op: op.id },
    );
  }

  function fail(op: AnyOp, error: RedmineError): never {
    emit({ type: "error", op: op.id, error });
    throw error;
  }

  /** One request under a slot. Never throws for a failed request, returns it as data. */
  async function attempt(
    op: AnyOp,
    plan: Plan,
    options: CallOptions,
    timeoutMs: number,
    attemptNo: number,
    stream: boolean,
  ): Promise<Delivered | Failed> {
    const release = await limiter.acquire(options.signal, op.id);
    try {
      const sent = { ...plan.headers, ...(await config.auth.headers()) };
      return await exchange(op, plan, sent, options, timeoutMs, attemptNo, stream);
    } finally {
      release();
    }
  }

  async function exchange(
    op: AnyOp,
    plan: Plan,
    sent: Record<string, string>,
    options: CallOptions,
    timeoutMs: number,
    attemptNo: number,
    stream: boolean,
  ): Promise<Delivered | Failed> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout.signal])
      : timeout.signal;
    try {
      emit({
        type: "request",
        op: op.id,
        method: plan.method,
        url: plan.url.href,
        attempt: attemptNo,
      });
      const started = Date.now();
      const init: RequestInit & { duplex?: "half" } = {
        method: plan.method,
        headers: sent,
        signal,
        ...(plan.body === undefined ? {} : { body: plan.body }),
        ...(plan.body instanceof ReadableStream ? { duplex: "half" } : {}),
      };
      markSent(plan.body);
      const response = await config.fetch(plan.url.href, init);
      emit({
        type: "response",
        op: op.id,
        status: response.status,
        ms: Date.now() - started,
        attempt: attemptNo,
      });
      notifyObserver(() => options.onResponse?.({ status: response.status }));
      const ok = response.status >= 200 && response.status < 300;
      if (stream && ok) return { response, value: undefined };
      const outcome = interpret(op, {
        status: response.status,
        contentType: response.headers.get("content-type"),
        text: await response.text(),
        requestId: response.headers.get("x-request-id"),
        switchUser: options.as,
        lockVersion: plan.lockVersion,
      });
      if (outcome.type === "ok") return { response, value: outcome.value };
      return { error: outcome.error, sent, retryAfterMs: retryAfter(response) };
    } catch (cause) {
      return {
        error: classify(op, cause, options.signal, timeout.signal, timeoutMs),
        sent,
        retryAfterMs: undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(
    op: AnyOp,
    input: Readonly<Record<string, unknown>>,
    options: CallOptions,
    query: Readonly<Record<string, string>> | undefined,
    stream: boolean,
  ): Promise<Delivered> {
    const plan = planRequest(config.base, op, input, {
      query,
      ...(options.as === undefined ? {} : { as: options.as }),
    });
    const deleting = await checkDeletion(op, plan, options);
    if (deleting) throw deleting;
    if (
      options.as !== undefined &&
      !(await abortable(adminGuard.isAdmin(), options.signal, op.id))
    ) {
      return fail(
        op,
        new RedmineError(
          { kind: "switch_user_rejected", login: options.as, reason: "not_admin" },
          { op: op.id },
        ),
      );
    }
    const policy = callPolicy(options);
    const timeoutMs = options.timeoutMs ?? config.timeoutMs;
    let retries = 0;
    let attemptNo = 0;
    let replayed = false;
    for (;;) {
      const result = await attempt(op, plan, options, timeoutMs, ++attemptNo, stream);
      if (!("error" in result)) return result;

      let { error } = result;
      if (error.kind === "unauthorized" && !replayed && plan.replayable) {
        let changed: boolean;
        try {
          changed = await config.auth.onUnauthorized(result.sent);
        } catch (cause) {
          return fail(op, new RedmineError(error.data, { op: op.id, cause }));
        }
        if (changed) {
          replayed = true;
          continue;
        }
      }
      error = withHint(op, error);
      const decision = policy
        ? retryDecision(op, error, retries, policy, plan.replayable, result.retryAfterMs)
        : { retry: false as const };
      if (!decision.retry) return fail(op, error);
      emit({
        type: "retry",
        op: op.id,
        attempt: attemptNo,
        delay_ms: decision.delayMs,
        reason: error.kind,
      });
      await sleep(decision.delayMs, options.signal, op.id);
      retries++;
    }
  }

  /** Per-call retry settings layer over the client's, and may re-enable a client that disabled retries. */
  function callPolicy(options: CallOptions): RetryPolicy | null {
    if (options.retry === undefined) return config.retry;
    if (options.retry === false) return null;
    return resolveRetry({ ...(config.retry ?? DEFAULT_RETRY), ...options.retry });
  }

  function withHint(op: AnyOp, error: RedmineError): RedmineError {
    const { data } = error;
    const newerThanOldest = VERSIONS.indexOf(op.since) > 0;
    if (data.kind !== "not_found" || config.version !== undefined || !newerThanOldest) return error;
    const hint = `${op.id} exists since Redmine ${op.since}; this server may be older. Declare \`version\` to get a typed refusal instead of a 404.`;
    return new RedmineError(
      { ...data, hint },
      {
        op: op.id,
        ...(error.request_id === undefined ? {} : { request_id: error.request_id }),
        cause: error.cause,
      },
    );
  }

  async function execute(
    op: AnyOp,
    input: Readonly<Record<string, unknown>>,
    options: CallOptions,
    query?: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const { value } = await run(op, input, options, query, false);
    return value;
  }

  /** The caller's input minus the list controls, which the Listing owns. */
  function listControls(input: Readonly<Record<string, unknown>>): {
    controls: ListInput<unknown>;
    request: Readonly<Record<string, unknown>>;
  } {
    const { sort, pageSize, paging, ...request } = input;
    if (sort !== undefined && typeof sort !== "string") throw invalidInput("sort must be a string");
    if (pageSize !== undefined && typeof pageSize !== "number")
      throw invalidInput("pageSize must be a number");
    if (paging !== undefined && paging !== "offset" && paging !== "keyset") {
      throw invalidInput('paging must be "offset" or "keyset"');
    }
    return { controls: { where: request.where, sort, pageSize, paging }, request };
  }

  function dispatch(op: AnyOp, input: unknown, options: CallOptions): unknown {
    const refused = refusal(op);
    const asRecord = (): Readonly<Record<string, unknown>> => {
      if (input === undefined || input === null) return {};
      if (isRecord(input)) return input;
      throw invalidInput("input must be an object", op.id);
    };
    const response = op.response;
    if (response.kind === "list") {
      let controls: ListInput<unknown> = {};
      let request: Readonly<Record<string, unknown>> = {};
      let problem = refused;
      try {
        ({ controls, request } = listControls(asRecord()));
      } catch (error) {
        problem ??= error instanceof RedmineError ? error : undefined;
        if (problem === undefined) throw error;
      }
      const paged = response.paged;
      const fetchPage: FetchPage<unknown> = async ({ offset, limit, extra }) => {
        if (problem) throw problem;
        const query = paged ? { ...extra, offset: String(offset), limit: String(limit) } : extra;
        return decodePage(op, await execute(op, request, options, query), config.normalize);
      };
      return createListing(op, controls, fetchPage);
    }
    const start = async (): Promise<unknown> => {
      if (refused) throw refused;
      const record = asRecord();
      if (response.kind === "binary") {
        const filename = typeof record.filename === "string" ? record.filename : undefined;
        return toDownload(await send(op, record, options), filename);
      }
      return decode(op, await execute(op, record, options), config.normalize);
    };
    return start();
  }

  async function send(
    op: AnyOp,
    input: Readonly<Record<string, unknown>>,
    options: CallOptions = {},
  ): Promise<Response> {
    const refused = refusal(op);
    if (refused) throw refused;
    return (await run(op, input, options, undefined, true)).response;
  }

  return {
    config,
    // Op's phantom return type cannot be proven from data, the registry's generated types vouch for it.
    call: <O extends AnyOp>(op: O, input: InputOf<O>, options: CallOptions = {}): ReturnOf<O> =>
      dispatch(op, input, options) as ReturnOf<O>,
    send,
    refusal,
    checkDeletion,
  };
}

function notifyObserver(observe: () => void): void {
  try {
    observe();
  } catch {}
}

function classify(
  op: AnyOp,
  cause: unknown,
  caller: AbortSignal | undefined,
  timeout: AbortSignal,
  timeoutMs: number,
): RedmineError {
  if (cause instanceof RedmineError) return cause;
  if (caller?.aborted) return new RedmineError({ kind: "aborted" }, { op: op.id, cause });
  if (timeout.aborted)
    return new RedmineError({ kind: "timeout", after_ms: timeoutMs }, { op: op.id, cause });
  const message = cause instanceof Error ? cause.message : "fetch failed";
  return new RedmineError({ kind: "network", message }, { op: op.id, cause });
}

/** Seconds or an HTTP date, as milliseconds from now. */
function retryAfter(response: Response): number | undefined {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return undefined;
  const ms = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
}

/** Lets a caller stop waiting on work shared with other callers, without cancelling it for them. */
function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  op: string,
): Promise<T> {
  if (signal === undefined) return promise;
  return new Promise((resolve, reject) => {
    const aborted = (): void => reject(new RedmineError({ kind: "aborted" }, { op }));
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

function sleep(ms: number, signal: AbortSignal | undefined, op: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = (): void => reject(new RedmineError({ kind: "aborted" }, { op }));
    if (signal?.aborted) return aborted();
    const onAbort = (): void => {
      clearTimeout(timer);
      aborted();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

interface Limiter {
  /** Resolves with an idempotent release. Rejects with `aborted` if the signal fires while queued. */
  acquire(signal: AbortSignal | undefined, op: string): Promise<() => void>;
}

function createLimiter(max: number): Limiter {
  let active = 0;
  const queue: Array<() => void> = [];

  const release = (): (() => void) => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      active--;
      queue.shift()?.();
    };
  };

  return {
    acquire(signal, op) {
      const aborted = (): RedmineError => new RedmineError({ kind: "aborted" }, { op });
      if (signal?.aborted) return Promise.reject(aborted());
      if (active < max) {
        active++;
        return Promise.resolve(release());
      }
      return new Promise((resolve, reject) => {
        const grant = (): void => {
          signal?.removeEventListener("abort", onAbort);
          active++;
          resolve(release());
        };
        const onAbort = (): void => {
          queue.splice(queue.indexOf(grant), 1);
          reject(aborted());
        };
        queue.push(grant);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}
