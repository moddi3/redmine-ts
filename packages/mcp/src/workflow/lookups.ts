// The lists every instance has and rarely changes, read once per server and kept for a few minutes,
// so reference_data, issue_context and issues_transition share one fetch of each.

import type {
  CustomField,
  IssuePriority,
  IssueStatus,
  Membership,
  Tracker,
  TimeEntryActivity,
  User,
} from "@redmine-ts/sdk";
import type { Client } from "../tools.ts";

export const LOOKUP_TTL_MS: number = 5 * 60_000;

export interface Lookups {
  statuses(): Promise<readonly IssueStatus[]>;
  trackers(): Promise<readonly Tracker[]>;
  priorities(): Promise<readonly IssuePriority[]>;
  activities(): Promise<readonly TimeEntryActivity[]>;
  /** The user the API key acts as. */
  currentUser(): Promise<User>;
  /** Redmine answers 403 unless the key is an admin's. */
  customFields(): Promise<readonly CustomField[]>;
}

export function createLookups(rm: Client): Lookups {
  const entries = new Map<string, { at: number; value: Promise<unknown> }>();
  const cached = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key);
    if (hit !== undefined && Date.now() - hit.at < LOOKUP_TTL_MS) return hit.value as Promise<T>;
    const value = load();
    entries.set(key, { at: Date.now(), value });
    // A failure is not kept, so the next call asks again.
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    return value;
  };
  return {
    statuses: () => cached("statuses", () => rm.issueStatuses.list().all()),
    trackers: () => cached("trackers", () => rm.trackers.list().all()),
    priorities: () => cached("priorities", () => rm.enumerations.listIssuePriorities().all()),
    activities: () => cached("activities", () => rm.enumerations.listTimeEntryActivities().all()),
    currentUser: () => cached("currentUser", () => rm.users.current()),
    customFields: () => cached("customFields", () => rm.customFields.list().all()),
  };
}

/** Memberships read for one project, 5 pages. A larger project is cut there, and `more` says so. */
export const MAX_MEMBERS = 500;

export async function projectMembers(
  rm: Client,
  project_id: number | string,
): Promise<{ members: Membership[]; more: boolean }> {
  const members: Membership[] = [];
  for await (const page of rm.memberships.list({ project_id }).pages()) {
    members.push(...page.items);
    // total_count tells whether more follow, so a larger project costs no sixth page.
    if (members.length >= MAX_MEMBERS) {
      return {
        members: members.slice(0, MAX_MEMBERS),
        more: members.length > MAX_MEMBERS || (page.total_count ?? 0) > MAX_MEMBERS,
      };
    }
  }
  return { members, more: false };
}
