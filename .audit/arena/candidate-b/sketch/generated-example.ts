// A hand-sized slice of what src/generated/* contains, so the seam is concrete. Real output is ~4-6k lines, never edited.
// Four ops are enough to show every shape: item, list(+scope merge, filters, keyset, includes), write-with-envelope, a 7.0-only op.

import type { Op, Slot } from "./op.ts";
import type { Cond, Listing, ListInput } from "./listing.ts";
import type { CallOptions } from "./config.ts";
import type { AtLeast, Version } from "./version.ts";

// ---------- generated/schemas.ts ----------

export interface IdName { id: number; name: string }
export interface CustomFieldValue { id: number; name?: string; value: string | string[] | null } // single vs multiple: honest union
export interface Issue {
  id: number;
  project: IdName;
  tracker: IdName;
  status: IdName;
  subject: string;
  description?: string | null;
  assigned_to?: IdName; // nil association is ABSENT on the wire, so optional, not nullable
  custom_fields?: CustomFieldValue[];
  journals?: Journal[]; // present only with include=journals
  allowed_statuses?: { id: number; name: string; is_closed: boolean }[];
  updated_on: string;
}
export interface Journal { id: number; notes: string | null; details: { property: string; name: string; old_value?: string | null; new_value?: string | null }[] }
export interface IssueUpdate { subject?: string; status_id?: number; assigned_to_id?: number | null; notes?: string; uploads?: { token: string; filename?: string; content_type?: string }[] }
export interface WikiPageSummary {
  title: string;
  /** @since 7.0 (appeared in 7.0.1: a PATCH release. Optional is the honest type for every declared version.) */
  project?: IdName;
}

// ---------- generated/ops.ts ----------

export type Included<T, I extends string> = T & Required<Pick<T, Extract<I, keyof T>>>;
export type IssueInclude = "journals" | "allowed_statuses" | "children" | "attachments" | "relations" | "changesets" | "watchers";

export interface IssuesWhere {
  status_id?: Cond<number | "open" | "closed" | "any", "not">;
  assigned_to_id?: Cond<number | "me", "not" | "presence">;
  updated_on?: Cond<string, "range" | "presence">;
  subject?: Cond<string, "text" | "presence">;
  [cf: `cf_${number}`]: Cond<string | number, "not" | "range" | "text" | "presence"> | undefined;
}

export const ops = {
  getIssue: {
    id: "getIssue", method: "GET", path: "issues/{issue_id}.json", pathParams: ["issue_id"],
    query: { include: "csv" }, filters: {}, body: null,
    response: { kind: "item", unwrap: "issue" }, includes: ["journals", "allowed_statuses"],
    since: "6.1", until: null, safety: "read", stability: "stable",
  } as Op<"getIssue", { issue_id: number; include?: readonly IssueInclude[] }, Promise<Issue>>,

  getIssues: {
    id: "getIssues", method: "GET", path: "issues.json", pathParams: [], query: { sort: "scalar", include: "csv" },
    filters: { status_id: { param: "status_id", kind: "id", ops: ["o", "=", "!", "c", "*"], words: { open: "o", closed: "c", any: "*" } } /* ...25 more */ },
    body: null, response: { kind: "list", items: "issues", paged: true, keyset: { param: "issue_id" } }, includes: ["attachments", "relations"],
    since: "6.1", until: null, safety: "read", stability: "stable",
  } as Op<"getIssues", ListInput<IssuesWhere> & { project_id?: number | string }, Listing<Issue>>,
  // getIssuesByProject is a sibling with pathParams ["project_id"]; the slot below merges both into one `issues.list`.

  updateIssue: {
    id: "updateIssue", method: "PUT", path: "issues/{issue_id}.json", pathParams: ["issue_id"], query: {}, filters: {},
    body: { kind: "json", envelope: "issue" }, response: { kind: "empty" }, includes: [],
    since: "6.1", until: null, safety: "write", stability: "stable",
  } as Op<"updateIssue", { issue_id: number } & IssueUpdate, Promise<void>>,

  removeUsersFromGroup: {
    id: "removeUsersFromGroup", method: "DELETE", path: "groups/{group_id}/users.json", pathParams: ["group_id"], query: {}, filters: {},
    body: { kind: "json", envelope: null }, response: { kind: "empty" }, includes: [],
    since: "7.0", until: null, safety: "idempotent", stability: "alpha",
  } as Op<"removeUsersFromGroup", { group_id: number; user_ids: number[] }, Promise<void>>,
} as const;

// ---------- generated/slots.ts (data the binder walks) ----------

export const SLOTS = {
  issues: {
    get: { op: ops.getIssue, positional: ["issue_id"] },
    list: { op: ops.getIssues, positional: [] }, // by-project sibling folded in: binder routes on input.project_id
    update: { op: ops.updateIssue, positional: ["issue_id"] },
  },
  groups: { removeUsers: { op: ops.removeUsersFromGroup, positional: ["group_id"] } }, // since 7.0
} as const satisfies Record<string, Record<string, Slot>>;

// ---------- generated/resources.ts (explicit signatures: great hovers, zero type-level computation) ----------

export interface BaseResources {
  issues: {
    /** Show issue. https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Showing-an-issue */
    get<const I extends IssueInclude = never>(issue_id: number, input?: { include?: readonly I[] }, opts?: CallOptions): Promise<Included<Issue, I>>;
    /** List issues. */
    list(input?: ListInput<IssuesWhere> & { project_id?: number | string }): Listing<Issue>;
    update(issue_id: number, input: IssueUpdate, opts?: CallOptions): Promise<void>;
  };
  groups: Record<never, never>;
}
export interface Additions70 {
  groups: {
    /** @since 7.0 Bulk-remove users. */
    removeUsers(group_id: number, input: { user_ids: number[] }, opts?: CallOptions): Promise<void>;
  };
}
export type Resources<V extends Version> = BaseResources & (AtLeast<V, "7.0"> extends true ? Additions70 : unknown);
