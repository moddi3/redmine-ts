import { createRedmine, RedmineError } from "@redmine-ts/sdk";
import type { RedmineConfig } from "@redmine-ts/sdk";

/** claude.ai gives token calls 10 seconds, and a key check may sit in front of one. */
export const KEY_CHECK_TIMEOUT_MS = 8000;

export type KeyVerdict = "ok" | "refused" | "unreachable";

export async function checkApiKey(
  redmine: Omit<RedmineConfig, "auth">,
  apiKey: string,
  { signal, onError }: { signal?: AbortSignal; onError?: (error: Error) => void } = {},
): Promise<KeyVerdict> {
  const rm = createRedmine({
    ...redmine,
    auth: { apiKey },
    timeoutMs: Math.min(KEY_CHECK_TIMEOUT_MS, redmine.timeoutMs ?? KEY_CHECK_TIMEOUT_MS),
    retry: false,
  });
  try {
    await rm.users.current({}, { signal });
    return "ok";
  } catch (error) {
    if (RedmineError.is(error, "unauthorized")) return "refused";
    if (!signal?.aborted) onError?.(error instanceof Error ? error : new Error(String(error)));
    return "unreachable";
  }
}
