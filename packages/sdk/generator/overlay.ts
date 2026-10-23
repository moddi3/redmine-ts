// The only hand-written generator input. The generator checks that every key names a real tag,
// operation, filter or conflict, so a spec update cannot leave a stale decision behind.

import type { Safety } from "../src/core/op.ts";

export interface Overlay {
  /** Tag -> namespace, where camelCasing the tag reads badly. */
  namespaces: Readonly<Record<string, string>>;
  /** operationId -> verb, where the derived verb collides or misleads. */
  verbs: Readonly<Record<string, string>>;
  /**
   * Scoped variants hidden from namespaces because their global sibling takes the scope as an input key.
   * The generator proves the sibling has that key.
   */
  scopedDuplicates: Readonly<Record<string, { sibling: string; key: string }>>;
  /** Binary operations replaced by hand-written Extras. */
  extras: readonly string[];
  /** List operations that support keyset walks, and their id filter. */
  keyset: Readonly<Record<string, string>>;
  /**
   * Filters whose `=` and `!` read only the first value and split it on commas, where Redmine's short syntax
   * splits on "|". A list sent as `a|b` matches `a` alone. Grouped by query class: Redmine builds every
   * operation of a group from the same query, so each filter is named once. Observed on Redmine 6.1 and 7.0:
   * .audit/probes/id-list-filters.out.txt.
   */
  commaLists: readonly { ops: readonly string[]; filters: readonly string[] }[];
  /**
   * operationId -> nullable body fields that Redmine ignores as `null` and clears as `""`. The client sends `""`
   * for a `null` there. Issue#safe_attributes= skips a falsy `assigned_to_id`, and every other nullable field
   * of an update clears with `null`: .audit/probes/clear-fields.out.txt.
   */
  clearAsEmpty: Readonly<Record<string, readonly string[]>>;
  /** Filter name -> words compiled to operator codes. Words whose code a filter lacks are dropped. */
  filterWords: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Include values whose key the server leaves out when the collection is empty, so they must stay
   * optional instead of narrowing to required. Observed on Redmine 6.1 and 7.0:
   * .audit/probes/includes.out.txt and .audit/probes/redmine-behavior.out.txt.
   */
  sparseIncludes: readonly string[];
  safety: Readonly<Record<string, Safety>>;
  /** JSON pointer of a non-additive change -> why the latest shape is right. */
  resolved: Readonly<Record<string, string>>;
}

export const overlay: Overlay = {
  namespaces: {
    "Issue Relations": "relations",
    "Wiki Pages": "wiki",
    "Project Memberships": "memberships",
  },
  verbs: {
    getCurrentUser: "current",
    getWikiPageByVersion: "getVersion",
    getIssuePriorities: "listIssuePriorities",
    getTimeEntryActivities: "listTimeEntryActivities",
    getDocumentCategories: "listDocumentCategories",
    // getNewsList has no project_id filter, and global search has no project scope (its `scope` values
    // name sets of projects, and `subprojects` only works here), so both stay visible.
    getNewsListByProject: "listByProject",
    getSearchByProject: "listByProject",
  },
  scopedDuplicates: {
    getIssuesByProject: { sibling: "getIssues", key: "project_id" },
    createIssueUnderProject: { sibling: "createIssue", key: "project_id" },
    getTimeEntriesByProject: { sibling: "getTimeEntries", key: "project_id" },
    createTimeEntryUnderProject: { sibling: "createTimeEntry", key: "project_id" },
    createTimeEntryUnderIssue: { sibling: "createTimeEntry", key: "issue_id" },
  },
  extras: ["uploadAttachmentFile", "downloadAttachmentFile", "downloadThumbnail"],
  keyset: { getIssues: "issue_id" },
  clearAsEmpty: { updateIssue: ["assigned_to_id"] },
  commaLists: [
    {
      ops: ["getIssues", "getIssuesByProject"],
      filters: [
        "issue_id",
        "parent_id",
        "child_id",
        "done_ratio",
        "relates",
        "duplicates",
        "duplicated",
        "blocks",
        "blocked",
        "precedes",
        "follows",
        "copied_to",
        "copied_from",
      ],
    },
    { ops: ["getTimeEntries", "getTimeEntriesByProject"], filters: ["issue.parent_id"] },
  ],
  filterWords: { status_id: { open: "o", closed: "c", any: "*" } },
  sparseIncludes: [
    "children",
    "relations",
    "trackers",
    "issue_categories",
    "time_entry_activities",
    "issue_custom_fields",
    "auth_source",
  ],
  safety: {},
  resolved: {},
};
