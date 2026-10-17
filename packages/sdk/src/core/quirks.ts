// Symptom-based response fixes. Never keyed by server version: patch releases regress and fix things
// (hours "8/1" in 6.0.1, fixed in 6.0.2), and the server does not report its version. Each fix must be a
// no-op on correct data, so it is safe against every server.

import { isRecord } from "./util.ts";

/** Applied to every decoded JSON response when `normalize` is on. Takes the wire envelope, returns a copy only when it changed. */
export function normalizeResponse(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { time_entry: one, time_entries: many } = value;
  const fixedOne = isRecord(one) ? fixHours(one) : one;
  const fixedMany = Array.isArray(many) ? many.map((e) => (isRecord(e) ? fixHours(e) : e)) : many;
  if (fixedOne === one && !changed(many, fixedMany)) return value;
  return {
    ...value,
    ...(one === undefined ? {} : { time_entry: fixedOne }),
    ...(many === undefined ? {} : { time_entries: fixedMany }),
  };
}

function changed(before: unknown, after: unknown): boolean {
  return Array.isArray(before) && Array.isArray(after) && before.some((e, i) => e !== after[i]);
}

const HOURS = /^\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*$/;

function fixHours(entry: Record<string, unknown>): Record<string, unknown> {
  const { hours } = entry;
  if (typeof hours !== "string") return entry;
  const match = HOURS.exec(hours);
  const numerator = Number(match?.[1]);
  const denominator = match?.[2] === undefined ? 1 : Number(match[2]);
  if (!match || denominator === 0) return entry;
  return { ...entry, hours: numerator / denominator };
}
