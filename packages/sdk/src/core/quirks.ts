// Symptom-based response fixes. Never keyed by server version: patch releases regress and fix things
// (hours "8/1" in 6.0.1, fixed in 6.0.2), and the server does not report its version. Each fix must be a
// no-op on correct data, so it is safe against every server.

import { isRecord } from "./util.ts";

/** Returns its input when there is nothing to fix, so an unchanged response is never copied. */
type Fix = (value: unknown) => unknown;

/** Applied to every decoded JSON response when `normalize` is on. Takes the wire envelope, returns a copy only when it changed. */
export const normalizeResponse: Fix = fields({
  time_entry: fields({ hours }),
  time_entries: each(fields({ hours })),
  issue: fields({
    journals: oldestFirst(
      (first, last) =>
        (compare(time(first.created_on), time(last.created_on)) || compare(first.id, last.id)) > 0,
    ),
    // Redmine breaks ties by changeset id, which the API does not send.
    changesets: oldestFirst(
      (first, last) => compare(time(first.committed_on), time(last.committed_on)) > 0,
    ),
  }),
  // Redmine orders comments by created_on, which the API does not send.
  news: fields({ comments: oldestFirst((first, last) => compare(first.id, last.id) > 0) }),
});

function fields(fixes: Readonly<Record<string, Fix>>): Fix {
  return (value) => {
    if (!isRecord(value)) return value;
    let copy: Record<string, unknown> | undefined;
    for (const [key, fix] of Object.entries(fixes)) {
      if (!Object.hasOwn(value, key)) continue;
      const fixed = fix(value[key]);
      if (fixed !== value[key]) (copy ??= { ...value })[key] = fixed;
    }
    return copy ?? value;
  };
}

function each(fix: Fix): Fix {
  return (value) => {
    if (!Array.isArray(value)) return value;
    const fixed = value.map(fix);
    return fixed.some((entry, i) => entry !== value[i]) ? fixed : value;
  };
}

/**
 * Redmine builds these lists oldest first and reverses the whole list for a user whose "Display
 * comments" preference is newest first. The REST API does not send that preference, so the list
 * itself tells: Redmine reversed it when its first entry is later than its last.
 */
function oldestFirst(
  later: (first: Record<string, unknown>, last: Record<string, unknown>) => boolean,
): Fix {
  return (value) => {
    if (!Array.isArray(value)) return value;
    const first: unknown = value[0];
    const last: unknown = value.at(-1);
    return isRecord(first) && isRecord(last) && later(first, last) ? value.toReversed() : value;
  };
}

/** 1, -1 or 0, and 0 when either side is not a number. */
function compare(a: unknown, b: unknown): number {
  return typeof a === "number" && typeof b === "number" ? Math.sign(a - b) || 0 : 0;
}

function time(value: unknown): number | undefined {
  return typeof value === "string" ? Date.parse(value) : undefined;
}

const HOURS = /^\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*$/;

function hours(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const match = HOURS.exec(value);
  const numerator = Number(match?.[1]);
  const denominator = match?.[2] === undefined ? 1 : Number(match[2]);
  if (!match || denominator === 0) return value;
  return numerator / denominator;
}
