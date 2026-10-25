// A body is held whole until it parses, so the bytes bodies hold are bounded across requests, not only
// per request. There is one budget per handler, so one per process on Node and Bun and one per
// isolate on Workers.

/** A body that has not grown by this much in STALL_MS holds memory without moving. */
const PROGRESS_BYTES = 128 * 1024;
const STALL_MS = 5000;
/** How long a body refused mid-read is still read and dropped, so the client reads the answer, not a reset. */
const LINGER_MS = 5000;

/** About when a moving body that holds the budget has either grown or become stalled. */
export const RETRY_AFTER_SECONDS: number = STALL_MS / 1000;

/** `length` is refused by its declared length before any of it is read; the rest after reading some. */
export type BodyRefusal = "length" | "too_large" | "over_budget" | "stalled" | "unreadable";

export type BodyRead =
  | { readonly kind: "json"; readonly value: unknown }
  /** Not JSON, so the MCP SDK answers it as it answers any broken body. */
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "refused"; readonly refusal: BodyRefusal; readonly limit: number };

export interface BodyBudget {
  read(request: Request): Promise<BodyRead>;
}

export interface BodyBudgetOptions {
  /** Bytes all bodies in flight may hold at once, past each one's first `free` bytes. */
  readonly limit: number;
  /** The largest body a request may send at all. */
  readonly maxBody: number;
  readonly free: number;
}

type Chunk = Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]>>;

interface Holder {
  held: number;
  progressAt: number;
  /** Set before the body is woken, when another body took its room. */
  ended?: "stalled";
  wake?: () => void;
}

/**
 * Charges each body's bytes past `free` against `limit`. A body that needs room the others hold gets
 * it from stalled bodies, longest stalled first, or is refused; an upload that keeps moving is never
 * dropped for one that stopped.
 */
export function createBodyBudget({ limit, maxBody, free }: BodyBudgetOptions): BodyBudget {
  if (!(limit >= 0)) {
    throw new RangeError(`maxBodyBytesInFlight must be a number of bytes, got ${String(limit)}`);
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
    limit: refusal === "length" || refusal === "too_large" ? largest : limit,
  });

  return {
    async read(request) {
      const declared = Number(request.headers.get("content-length"));
      if (declared > largest) return refused("length");
      const reader = request.body!.getReader();
      const lingering = (refusal: BodyRefusal, pending?: Promise<Chunk>): BodyRead => {
        linger(reader, pending);
        return refused(refusal);
      };
      const holder: Holder = { held: 0, progressAt: 0 };
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
          if (holder.ended) return lingering(holder.ended, chunk === undefined ? next : undefined);
          if (chunk === undefined || chunk.done) break;
          const size = received + chunk.value.byteLength;
          if (size > largest) return lingering("too_large");
          const charge = size - free - holder.held;
          if (charge > 0) {
            const now = Date.now();
            if (holder.held === 0 || size - mark >= PROGRESS_BYTES) {
              holder.progressAt = now;
              mark = size;
            }
            if (!acquire(holder, charge, now)) return lingering("over_budget");
          }
          if (size > bytes.length) {
            bytes = grow(bytes, received, size, size <= declared ? declared : largest);
          }
          bytes.set(chunk.value, received);
          received = size;
        }
      } catch {
        return refused("unreadable");
      } finally {
        release(holder);
      }
      const text = new TextDecoder().decode(bytes.subarray(0, received));
      try {
        return { kind: "json", value: JSON.parse(text) };
      } catch {
        return { kind: "text", text };
      }
    },
  };
}

/**
 * Room for `size` bytes, at least double the last, so copying stays linear in the body. Capped at the
 * declared length, so a body that arrives as declared ends in a buffer of its exact size. It is never
 * allocated up front, since a client could declare 6.7 MiB, send 64 KiB and stop, holding memory the
 * budget does not charge.
 */
function grow(
  bytes: Uint8Array,
  used: number,
  size: number,
  ceiling: number,
): Uint8Array<ArrayBuffer> {
  const grown = new Uint8Array(Math.min(ceiling, Math.max(size, bytes.length * 2)));
  grown.set(bytes.subarray(0, used));
  return grown;
}

/**
 * Drops the rest of a refused body. The source is cancelled only once the answer has had time to go
 * out, since on Node that destroys the socket, and with it an answer not yet written.
 */
function linger(reader: ReadableStreamDefaultReader<Uint8Array>, pending?: Promise<Chunk>): void {
  const timer = setTimeout(() => void reader.cancel().catch(() => undefined), LINGER_MS);
  const drain = async (): Promise<void> => {
    let chunk = await (pending ?? reader.read());
    while (!chunk.done) chunk = await reader.read();
  };
  const stop = (): void => clearTimeout(timer);
  drain().then(stop, stop);
}
