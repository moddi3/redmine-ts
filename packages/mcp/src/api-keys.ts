// Redmine sends API keys as api_key in users/current, users/:id, my/account and a created user. A user gets
// their own key, and an admin gets anyone's.

export function withoutApiKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutApiKeys) as T;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "api_key")
      .map(([key, field]) => [key, withoutApiKeys(field)]),
  ) as T;
}

/** An error body is text cut at 2 KiB, so it may not parse; the value is blanked where the field appears. */
export function withoutApiKeysInText(text: string): string {
  return text.replace(/("api_key"\s*:\s*")[^"]*/g, "$1");
}
