// Fixes keyed by symptom and by envelope name, never by Redmine version: the server
// cannot tell us its version, and patch regressions come and go.

type Fix = (item: Record<string, unknown>) => void

/** Envelope key -> fixes applied to each decoded item. Adding a quirk is one line here plus a unit test. */
const FIXES: Readonly<Partial<Record<string, readonly Fix[]>>> = {
  time_entry: [fixHours],
  time_entries: [fixHours],
}

export function normalize(envelopeKey: string, item: Record<string, unknown>): void {
  for (const fix of FIXES[envelopeKey] ?? []) fix(item)
}

/** 6.0.1 sent hours as "8/1" (a Rational). Also accepts numeric strings. */
function fixHours(item: Record<string, unknown>): void {
  // TODO: typeof hours === 'string' -> /^(\d+(?:\.\d+)?)\/(\d+)$/ -> n / d; else Number(hours)
  throw new Error('not implemented')
}
