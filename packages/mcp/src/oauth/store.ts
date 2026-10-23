// Single use and revocation need state that sealed values cannot carry. A grant store holds it: keys
// marked used until a deadline. The authorization server works without one, with the weaker
// guarantees of a cache in each process.

/**
 * Where the authorization server marks codes, Redmine states and refresh tokens used, and revokes
 * token families. Keys are opaque and namespaced, such as `code:<id>` and `family:<id>`. Every
 * instance that serves the same publicUrl must share one store, and `consume` must be atomic across
 * all of them: of two calls for one key at once, exactly one resolves true.
 */
export interface GrantStore {
  /** Marks `key` used for `ttlSeconds`. Resolves false when it already was, and is not expired. */
  consume(key: string, ttlSeconds: number): Promise<boolean>;
  /** Whether `key` is marked used and not expired. */
  has(key: string): Promise<boolean>;
}

/** How often the memory store drops expired keys, so it never holds more than a minute of them. */
const SWEEP_MS = 60_000;

/**
 * A grant store in this process's memory that drops keys as they expire. It is atomic within one
 * process, so it suits a single Node process, as the CLI runs. Several processes or Worker isolates
 * each have their own, so they need a shared store instead.
 */
export function memoryGrantStore(): GrantStore {
  const until = new Map<string, number>();
  let sweepAt = 0;
  const live = (key: string, at: number) => (until.get(key) ?? 0) > at;
  return {
    async consume(key, ttlSeconds) {
      const at = Date.now();
      if (at >= sweepAt) {
        for (const [entry, end] of until) if (end <= at) until.delete(entry);
        sweepAt = at + SWEEP_MS;
      }
      if (live(key, at)) return false;
      until.set(key, at + ttlSeconds * 1000);
      return true;
    },
    async has(key) {
      return live(key, Date.now());
    },
  };
}
