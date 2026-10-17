// Symptom-based response fixes. Never keyed by server version: patch releases regress and fix things
// (hours "8/1" in 6.0.1, fixed in 6.0.2), and the server does not report its version. Each fix must be a
// no-op on correct data, so it is safe against every server.

/** Applied to every decoded JSON response when `normalize` is on. */
export function normalizeResponse(_value: unknown): unknown {
  throw new Error("not implemented");
  // time_entry / time_entries[]: string hours ("8/1", "1.5") -> number; leave anything else untouched
}
