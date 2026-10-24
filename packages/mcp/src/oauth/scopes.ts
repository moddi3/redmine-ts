// The OAuth scopes mirror the access modes. Each scope includes the ones before it, so a token's
// highest scope decides its mode, and the server's own mode caps what it grants. Upstream, each scope
// asks Redmine for the permissions it needs, because Redmine grants only the permissions requested.

import { VERSIONS } from "@redmine-ts/sdk";
import type { Access, RedmineVersion } from "@redmine-ts/sdk";
import { ACCESS_ORDER, allows } from "../tools.ts";
import type { Tier } from "../tools.ts";

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

/** The scopes a call of `tier` needs: the least scope that allows it, and every scope below it. */
export function scopesNeeded(tier: Tier): [Scope, ...Scope[]] {
  const at = SCOPES.findIndex((scope) => allows(MODE[scope], tier));
  return SCOPES.slice(0, at + 1) as [Scope, ...Scope[]];
}

/** The mode `scopes` allow: their highest scope's. Undefined when none of them is ours. */
export function accessFor(scopes: readonly string[]): Access | undefined {
  const top = SCOPES.findLast((scope) => scopes.includes(scope));
  return top === undefined ? undefined : MODE[top];
}

/**
 * What a client asking for the `scope` parameter `requested` gets: everything up to the highest scope
 * it names, capped by what this server offers. Without a scope it gets all the server offers; names
 * that are not ours, next to ours, are ignored. Undefined when it names none of ours, which is
 * `invalid_scope`.
 */
export function grantedScopes(requested: string | null, access: Access): Scope[] | undefined {
  const offered = scopesFor(access);
  const names = scopeNames(requested);
  if (names.length === 0) return offered;
  const top = SCOPES.findLastIndex((scope) => names.includes(scope));
  return top === -1 ? undefined : offered.slice(0, top + 1);
}

/** The names in a `scope` parameter, which separates them with spaces. */
export function scopeNames(scope: string | null): string[] {
  return scope?.split(" ").filter((name) => name !== "") ?? [];
}

/**
 * Redmine's permission names, by the scope that requests them, as Redmine 6.1 and 7.0 define them in
 * lib/redmine/preparation.rb. Deletes are the delete_ permissions; a few manage_ permissions also
 * delete, so the access mode, not the Redmine scope, is what refuses a delete. `admin` is never
 * requested: an OAuth session acts as a non-admin even for an admin.
 */
const PERMISSIONS: Readonly<Record<Scope, readonly string[]>> = {
  "redmine:read": [
    "view_project",
    "search_project",
    "view_members",
    "view_issues",
    "view_private_notes",
    "view_issue_watchers",
    "view_time_entries",
    "view_news",
    "view_documents",
    "view_files",
    "view_wiki_pages",
    "view_wiki_edits",
    "export_wiki_pages",
    "view_wiki_page_watchers",
    "view_changesets",
    "browse_repository",
    "view_messages",
    "view_message_watchers",
    "view_calendar",
    "view_gantt",
  ],
  "redmine:write": [
    "add_project",
    "edit_project",
    "close_project",
    "select_project_publicity",
    "select_project_modules",
    "manage_members",
    "manage_versions",
    "add_subprojects",
    "manage_public_queries",
    "save_queries",
    "use_webhooks",
    "add_issues",
    "edit_issues",
    "edit_own_issues",
    "copy_issues",
    "manage_issue_relations",
    "manage_subtasks",
    "set_issues_private",
    "set_own_issues_private",
    "add_issue_notes",
    "edit_issue_notes",
    "edit_own_issue_notes",
    "set_notes_private",
    "add_issue_watchers",
    "import_issues",
    "manage_categories",
    "log_time",
    "edit_time_entries",
    "edit_own_time_entries",
    "manage_project_activities",
    "log_time_for_other_users",
    "import_time_entries",
    "manage_news",
    "comment_news",
    "add_documents",
    "edit_documents",
    "manage_files",
    "edit_wiki_pages",
    "rename_wiki_pages",
    "add_wiki_page_watchers",
    "protect_wiki_pages",
    "manage_wiki",
    "commit_access",
    "manage_related_issues",
    "manage_repository",
    "add_messages",
    "edit_messages",
    "edit_own_messages",
    "add_message_watchers",
    "manage_boards",
  ],
  "redmine:delete": [
    "delete_project",
    "delete_issues",
    "delete_issue_watchers",
    "delete_documents",
    "delete_wiki_pages",
    "delete_wiki_pages_attachments",
    "delete_wiki_page_watchers",
    "delete_messages",
    "delete_own_messages",
    "delete_message_watchers",
  ],
};

/** Permissions a Redmine before 7.0 does not know; asking it for one fails the whole sign-in. */
const SINCE_7_0 = new Set(["use_webhooks"]);

/**
 * The Redmine scope string for `scopes`. Without a declared version, it leaves out what 6.1 lacks,
 * so it works on both.
 */
export function redmineScope(
  scopes: readonly Scope[],
  version: RedmineVersion | undefined,
): string {
  const has7 = version !== undefined && VERSIONS.indexOf(version) >= VERSIONS.indexOf("7.0");
  return scopes
    .flatMap((scope) => PERMISSIONS[scope])
    .filter((permission) => has7 || !SINCE_7_0.has(permission))
    .join(" ");
}
