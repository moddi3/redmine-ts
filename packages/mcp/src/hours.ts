// Redmine keeps hours as floats and sends them with noise, such as 2.1600000262260437 for 2.16. Tool
// results round them to two decimals; the SDK still returns what Redmine sends.

/** The hour fields of issues and versions, and a time entry's hours. */
const HOURS = new Set([
  "hours",
  "estimated_hours",
  "total_estimated_hours",
  "spent_hours",
  "total_spent_hours",
]);

/** `value` with each number under an hour field, at any depth, rounded to two decimals. */
export function roundHours<T>(value: T): T {
  if (Array.isArray(value)) return value.map(roundHours) as T;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [
      key,
      HOURS.has(key) && typeof field === "number"
        ? Math.round(field * 100) / 100
        : roundHours(field),
    ]),
  ) as T;
}
