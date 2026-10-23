// The OAuth scopes mirror the access modes. Each scope includes the ones before it, so a token's
// highest scope decides its mode, and the server's own mode caps what it grants.

import type { Access } from "@redmine-ts/sdk";
import { ACCESS_ORDER } from "../tools.ts";

/** Least to most: read, then writes, then deletes. */
export const SCOPES = ["redmine:read", "redmine:write", "redmine:delete"] as const;

export type Scope = (typeof SCOPES)[number];

const MODE: Readonly<Record<Scope, Access>> = {
  "redmine:read": "read-only",
  "redmine:write": "no-delete",
  "redmine:delete": "full",
};

/** The scopes a server in `access` mode grants, and asks for in its challenge. */
export function scopesFor(access: Access): Scope[] {
  return SCOPES.filter(
    (scope) => ACCESS_ORDER.indexOf(MODE[scope]) >= ACCESS_ORDER.indexOf(access),
  );
}

/** The mode `scopes` allow: their highest scope's. Undefined when none of them is ours. */
export function accessFor(scopes: readonly string[]): Access | undefined {
  const top = SCOPES.findLast((scope) => scopes.includes(scope));
  return top === undefined ? undefined : MODE[top];
}
