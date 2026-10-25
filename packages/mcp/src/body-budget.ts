// A body is held whole until it parses, so the bytes bodies hold are bounded across requests, not only
// per request. There is one budget per handler, so one per process on Node and Bun and one per
// isolate on Workers.

/** A body that has not grown by this much in STALL_MS holds memory without moving. */
const PROGRESS_BYTES = 128 * 1024;
const STALL_MS = 5000;
/** How long a body refused mid-read is still read and dropped, so the client reads the answer, not a reset. */
const LINGER_MS = 5000;
/** setTimeout fires at once for a longer delay. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** Past this capacity a buffer grows by this much at a time instead of doubling. */
const GROWTH_STEP = 1024 * 1024;

/** About when a moving body that holds the budget has either grown or become stalled. */
export const RETRY_AFTER_SECONDS: number = STALL_MS / 1000;

/** `length` is refused by its declared length before any of it is read; the rest after reading some. */
export type BodyRefusal =
  | "length"
  | "too_large"
  | "over_budget"
  | "stalled"
  | "late"
  | "unreadable";

export type BodyRead =
  | { readonly kind: "json"; readonly value: unknown }
  /** Not JSON, so the MCP SDK reads these bytes, as received, and answers them as any broken body. */
  | { readonly kind: "other"; readonly bytes: Uint8Array<ArrayBuffer> }
  /** `limit` is the number the answer names, in milliseconds for `late` and in bytes otherwise. */
  | { readonly kind: "refused"; readonly refusal: BodyRefusal; readonly limit: number };

export interface BodyBudget {
  read(request: Request): Promise<BodyRead>;
}

export interface BodyBudgetOptions {
  /** Bytes of buffer all bodies in flight may hold at once, past each one's first `free` bytes. */
  readonly limit: number;
  /** How long a body may take to arrive, from the first read. */
  readonly timeoutMs: number;
  /** The largest body a request may send at all. */
  readonly maxBody: number;
  readonly free: number;
}

type Chunk = Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]>>;

interface Holder {
  /** The body's buffer past `free`. */
  held: number;
  progressAt: number;
  /** Set before the body is woken, when another body took its room or its deadline passed. */
  ended?: "stalled" | "late";
  wake?: () => void;
}

/**
 * Charges each body's buffer past `free` against `limit`, before the buffer grows. A body that needs
 * room the others hold gets it from stalled bodies, longest stalled first, or is refused; an upload
 * that keeps moving is never dropped for one that stopped. Any body still arriving `timeoutMs` after
 * its first read is refused.
 */
export function createBodyBudget({
  limit,
  timeoutMs,
  maxBody,
  free,
}: BodyBudgetOptions): BodyBudget {
  if (typeof limit !== "number" || !(limit >= 0)) {
    throw new RangeError(`maxBodyBytesInFlight must be a number of bytes, got ${String(limit)}`);
  }
  if (typeof timeoutMs !== "number" || !(timeoutMs >= 1 && timeoutMs <= MAX_TIMER_MS)) {
    throw new RangeError(
      `bodyTimeoutMs must be a number of milliseconds from 1 to ${MAX_TIMER_MS}, got ${String(timeoutMs)}`,
    );
  }
  const largest = Math.min(maxBody, limit + free);
  const holders = new Set<Holder>();
  let used = 0;

  function release(holder: Holder): void {
    used -= holder.held;
    holder.held = 0;
    holders.delete(holder);
  }

  function acquire(holder: Holder, bytes: number, now: number): boolean {
    if (used + bytes > limit) {
      const stalled = [...holders]
        .filter((other) => other !== holder && now - other.progressAt > STALL_MS)
        .sort((a, b) => a.progressAt - b.progressAt);
      const freeable = stalled.reduce((sum, other) => sum + other.held, 0);
      if (used - freeable + bytes > limit) return false;
      for (const other of stalled) {
        if (used + bytes <= limit) break;
        release(other);
        other.ended ??= "stalled";
        other.wake?.();
      }
    }
    used += bytes;
    holder.held += bytes;
    holders.add(holder);
    return true;
  }

  const refused = (refusal: BodyRefusal): BodyRead => ({
    kind: "refused",
    refusal,
    limit:
      refusal === "late"
        ? timeoutMs
        : refusal === "length" || refusal === "too_large"
          ? largest
          : limit,
  });

  return {
    async read(request) {
      const declared = Number(request.headers.get("content-length"));
      if (declared > largest) return refused("length");
      const reader = request.body!.getReader();
      const lingering = (refusal: BodyRefusal): BodyRead => {
        linger(reader);
        return refused(refusal);
      };
      const holder: Holder = { held: 0, progressAt: 0 };
      const timer = setTimeout(() => {
        holder.ended ??= "late";
        holder.wake?.();
      }, timeoutMs);
      // Bytes, decoded once at the end. A string grown chunk by chunk kept about 30 bytes of heap per
      // byte received on Node and Bun when clients sent one byte every 2 ms, each its own chunk.
      let bytes = new Uint8Array(0);
      let received = 0;
      let mark = 0;
      try {
        for (;;) {
          const next = reader.read();
          const chunk = await new Promise<Chunk | undefined>((resolve, reject) => {
            holder.wake = () => resolve(undefined);
            next.then(resolve, reject);
          });
          if (holder.ended) return lingering(holder.ended);
          if (chunk === undefined || chunk.done) break;
          const size = received + chunk.value.byteLength;
          if (size > largest) return lingering("too_large");
          if (size - mark >= PROGRESS_BYTES) {
            holder.progressAt = Date.now();
            mark = size;
          }
          if (size > bytes.length) {
            const room = capacity(bytes.length, size, size <= declared ? declared : largest, free);
            const charge = room - free - holder.held;
            if (charge > 0) {
              const now = Date.now();
              if (holder.held === 0) {
                holder.progressAt = now;
                mark = size;
              }
              if (!acquire(holder, charge, now)) return lingering("over_budget");
            }
            const grown = new Uint8Array(room);
            grown.set(bytes.subarray(0, received));
            bytes = grown;
          }
          bytes.set(chunk.value, received);
          received = size;
        }
      } catch {
        return refused("unreadable");
      } finally {
        clearTimeout(timer);
        release(holder);
      }
      const body = bytes.subarray(0, received);
      try {
        return { kind: "json", value: JSON.parse(new TextDecoder().decode(body)) };
      } catch {
        return { kind: "other", bytes: body };
      }
    },
  };
}

/**
 * The buffer for `size` bytes. It doubles up to GROWTH_STEP and then grows by GROWTH_STEP, so the
 * buffer the budget charges for is never more than GROWTH_STEP ahead of the bytes received, at the
 * cost of copying more of a large body. It stays within `free` while the body does, so a body within
 * `free` is never charged. It is capped at the declared length, so a body that arrives as declared
 * ends in a buffer of its exact size. It is not sized from the declared length up front, since a
 * client could declare 6.7 MiB, send 64 KiB and stop, and the budget would turn others away for bytes
 * that never come.
 */
function capacity(current: number, size: number, ceiling: number, free: number): number {
  const grown =
    size <= free ? Math.min(current * 2, free) : current + Math.min(current, GROWTH_STEP);
  return Math.min(ceiling, Math.max(size, grown));
}

/**
 * Reads and drops the rest of a refused body for LINGER_MS, so the client can finish sending and read
 * the answer, then stops reading, so a client that keeps sending cannot keep the server reading.
 * Cancelling at once would destroy the socket on Node before the answer is written.
 */
function linger(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  const timer = setTimeout(() => void reader.cancel().catch(() => undefined), LINGER_MS);
  const drain = async (): Promise<void> => {
    let chunk = await reader.read();
    while (!chunk.done) chunk = await reader.read();
  };
  const stop = (): void => clearTimeout(timer);
  drain().then(stop, stop);
}
