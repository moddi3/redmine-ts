// Redmine honours X-Redmine-Switch-User only for an admin key. For any other key it ignores the header
// and runs the request as the key's own user, so a write is silently misattributed. The engine asks
// this guard before it sends the first impersonated request.

import { VERSIONS } from "../generated/versions.ts";
import type { AnyOp } from "./op.ts";
import { isRecord } from "./util.ts";

/** The key's own user, read without `as`. Kept here because the engine never imports generated operations. */
export const currentUserOp: AnyOp = {
  id: "getCurrentUser",
  method: "GET",
  path: "users/current.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "user" },
  includes: [],
  since: VERSIONS[0],
  until: null,
  safety: "read",
  stability: "stable",
};

export interface AdminGuard {
  /** Whether the engine's key belongs to an admin. One check is shared by concurrent callers and then cached. */
  isAdmin(): Promise<boolean>;
}

/**
 * `fetchCurrentUser` resolves to the decoded `users/current` user. A failed check (network, 401) rejects
 * with its own error and is not cached, so the next call asks again instead of reporting a stale verdict.
 */
export function createAdminGuard(fetchCurrentUser: () => Promise<unknown>): AdminGuard {
  let verdict: Promise<boolean> | undefined;
  return {
    isAdmin() {
      verdict ??= fetchCurrentUser().then(
        (user) => isRecord(user) && user.admin === true,
        (error: unknown) => {
          verdict = undefined;
          throw error;
        },
      );
      return verdict;
    },
  };
}
