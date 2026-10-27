// Redmine sends API keys as api_key in users/current, users/:id and my/account. A user gets their own
// key, and an admin gets anyone's.

export function withoutApiKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutApiKeys) as T;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "api_key")
      .map(([key, field]) => [key, withoutApiKeys(field)]),
  ) as T;
}
