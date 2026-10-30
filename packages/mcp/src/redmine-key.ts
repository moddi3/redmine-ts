import { createRedmine, RedmineError } from "@redmine-ts/sdk";
import type { RedmineConfig } from "@redmine-ts/sdk";

/** claude.ai gives token calls 10 seconds, and a key check may sit in front of one. */
export const KEY_CHECK_TIMEOUT_MS = 8000;

export type KeyVerdict =
  | { readonly kind: "ok"; readonly admin?: boolean }
  | { readonly kind: "refused" }
  | { readonly kind: "unreachable" };

export async function checkCredential(
  redmine: RedmineConfig,
  { signal, onError }: { signal?: AbortSignal; onError?: (error: Error) => void } = {},
): Promise<KeyVerdict> {
  const rm = createRedmine({
    ...redmine,
    timeoutMs: Math.min(KEY_CHECK_TIMEOUT_MS, redmine.timeoutMs ?? KEY_CHECK_TIMEOUT_MS),
    retry: false,
  });
  try {
    const { admin } = await rm.users.current({}, { signal });
    return { kind: "ok", admin };
  } catch (error) {
    if (RedmineError.is(error, "unauthorized")) return { kind: "refused" };
    if (!signal?.aborted) onError?.(error instanceof Error ? error : new Error(String(error)));
    return { kind: "unreachable" };
  }
}
