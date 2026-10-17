// src/core/quirks.ts. Symptom-based response normalizers, keyed by operation id. NEVER keyed by server version:
// patch releases regress and fix things (6.0.1 "8/1" hours, fixed 6.0.2), and the server does not tell us its version.
// A normalizer must be a no-op on already-correct data, so it is safe on every server.
// The op-id key is typed against the generated registry: renaming/removing an op breaks this file at compile time.

type Quirk = (value: unknown) => unknown;

export const QUIRKS: Readonly<Record<string, Quirk>> = {
  // getTimeEntry / getTimeEntries / createTimeEntry...: hours arrives as "8/1" on 6.0.1-class servers
  getTimeEntry: normalizeTimeEntry,
  getTimeEntries: normalizeTimeEntry,
  getTimeEntriesByProject: normalizeTimeEntry,
};
// Not here on purpose: 0.44h -> 0.43h rounding (6.0.3, wontfix) is a server write bug the client cannot detect.

function normalizeTimeEntry(value: unknown): unknown {
  throw new Error("not implemented"); // TODO walk time_entry / time_entries[]; typeof hours === "string" -> parse "a/b" or decimal string -> number; leave anything else untouched
}
