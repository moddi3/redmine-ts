// src/core/normalize.ts — response fixes keyed by symptom and operation id, never by version number.
import type { AVAILABILITY } from '../generated/versions'

type AnyOperationId = keyof typeof AVAILABILITY
type Normalizer = (body: unknown) => unknown

/** `hours: "8/1"` (6.0.1) and numeric strings become numbers; real numbers pass through untouched. */
export function parseHours(value: unknown): unknown {
  // TODO: number → itself; /^\d+(\.\d+)?$/ → Number; /^(\d+)\/1$/ → Number($1); else leave as is (do not guess)
  throw new Error('not implemented')
}

/** Keys are checked against every operation id ever generated, so a typo or a removed op fails the build. */
export const normalizers: Partial<Record<AnyOperationId, Normalizer>> = {
  // getTimeEntries: (b) => mapItems(b, 'time_entries', fixTimeEntryHours),
  // getTimeEntry:   (b) => mapKey(b, 'time_entry', fixTimeEntryHours),
}
