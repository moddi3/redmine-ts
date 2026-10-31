import { RedmineError } from "./errors.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function invalidInput(detail: string, op?: string): RedmineError {
  return new RedmineError({ kind: "invalid_input", detail }, op === undefined ? {} : { op });
}

/**
 * JSON.stringify writes NaN and Infinity as null, which can clear a Redmine field. In a URL, Redmine answers
 * the bare word with a 404 or a 422, or reads it as a default, such as 25 for `limit=NaN`.
 */
export function unsendable(value: unknown): string | undefined {
  return typeof value === "number" && !Number.isFinite(value)
    ? `${String(value)} cannot be sent`
    : undefined;
}

/** Own-property lookup, so keys like "constructor" or "__proto__" never hit the prototype. */
export function own<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}
