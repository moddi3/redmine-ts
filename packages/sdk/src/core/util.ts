import { RedmineError } from "./errors.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function invalidInput(detail: string, op?: string): RedmineError {
  return new RedmineError({ kind: "invalid_input", detail }, op === undefined ? {} : { op });
}

/** Own-property lookup, so keys like "constructor" or "__proto__" never hit the prototype. */
export function own<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}
