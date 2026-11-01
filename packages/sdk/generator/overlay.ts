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
  /**
   * The component schema of Redmine's attach-by-token list. Every JSON body field that references it is marked
   * `body.uploads`, and the client uploads its `file` entries before it sends the record. The generator proves
   * the component is an array of objects with a string `token`, that a body uses it only as a top-level field,
   * and that a top-level field named `uploads` uses nothing else.
   */
  inlineUploads: string;
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
  /** Filter name -> what its value is, for filters whose spec neither lists values nor implies a kind. */
  filterValues: Readonly<Record<string, string>>;
  /**
   * Filter name -> what `{contains: id}` matches. Redmine reads `~` on these id filters as a search of the issue
   * tree: IssueQuery#sql_for_parent_id_field and #sql_for_child_id_field, TimeEntryQuery#sql_for_issue_id_field.
   */
  subtrees: Readonly<Record<string, string>>;
  /** operationId -> filter -> a sentence appended to the first line of the filter's description. */
  filterNotes: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Filters IssueQuery and TimeEntryQuery add only `if project`, so a query without one project drops them with
   * no error. Grouped by query class like commaLists. Observed on 6.1 and 7.0: a `category_id` next to a list of
   * project ids returned issues of other categories.
   */
  projectScoped: readonly { ops: readonly string[]; filters: readonly string[] }[];
  /**
   * Include values whose key the server leaves out when the collection is empty, so they must stay
   * optional instead of narrowing to required. Observed on Redmine 6.1 and 7.0:
   * .audit/probes/includes.out.txt and .audit/probes/redmine-behavior.out.txt.
   */
  sparseIncludes: readonly string[];
  safety: Readonly<Record<string, Safety>>;
  descriptions: Readonly<Record<string, { replaces: string; text: string; reason: string }>>;
  /**
   * Tags whose operations are stable; the rest are alpha. The spec's tag descriptions marked these Stable
   * through 7.0.1-r1, after the status column of https://www.redmine.org/projects/redmine/wiki/Rest_api,
   * and 7.0.2-r1 dropped them.
   */
  stableTags: readonly string[];
  /** JSON pointer of a non-additive change -> why the latest shape is right. */
  resolved: Readonly<Record<string, string>>;
  /**
   * JSON pointer of a property -> why it stays optional. Each entry covers a property that the latest spec
   * requires and an older spec still declares, although that older Redmine never sends it. Until upstream
   * fixes the older spec, the generator drops the property from every `required` list before the merge, and
   * it fails once an entry no longer changes the merged spec.
   */
  optional: Readonly<Record<string, string>>;
}

const ISSUE_CHILD =
  "7.0.2-r1 moved the inline child shape into the recursive issue_child. Redmine 6.1 already renders nested children with id and subject (IssuesHelper#render_api_issue_children), so the 7.0 shape holds for both versions.";

// Observed on 6.1 and 7.0: a list of two or more ids goes out in the long form, where Redmine compares
// project_id with the values alone, and an identifier there matches nothing.
const PROJECT_ID_NOTE =
  "One id or identifier also matches subprojects by default; two or more ids do not, and {not: id} excludes only that project. An identifier works only alone.";

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
  inlineUploads: "uploads",
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
  projectScoped: [
    { ops: ["getIssues", "getIssuesByProject"], filters: ["category_id", "subproject_id"] },
    {
      ops: ["getTimeEntries", "getTimeEntriesByProject"],
      filters: ["issue.category_id", "subproject_id"],
    },
  ],
  filterValues: {
    "author.group": "group id",
    member_of_group: "group id",
    "user.group": "group id",
    "author.role": "role id",
    assigned_to_role: "role id",
    "user.role": "role id",
    twofa_scheme: "scheme name, such as `totp`",
  },
  subtrees: {
    parent_id: "a parent at any depth",
    child_id: "a child at any depth",
    issue_id: "the issue and its subtasks",
    "issue.parent_id": "a parent at any depth",
  },
  filterNotes: {
    getIssues: { project_id: PROJECT_ID_NOTE },
    getTimeEntries: { project_id: PROJECT_ID_NOTE },
  },
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
  descriptions: {
    updateJournal: {
      replaces:
        "A journal left with empty `notes` and no property changes (`details`) is kept and can still be updated, but is omitted from the issue's `include=journals` response until it has notes again.",
      text: "On Redmine 6.1.0 to 6.1.3 and on 7.0.0, a journal left with empty `notes` and no property changes (`details`) is deleted. On 6.1.4, 7.0.1 and later it is kept and can still be updated, but the issue's `include=journals` response leaves it out until it has notes again.",
      reason:
        "JournalsController#update destroyed such a journal until Redmine #44258, fixed in 6.1.4 and 7.0.1. The 6.1.3-r2 spec says it is deleted and the 7.0.2-r2 spec says it is kept, and the client cannot tell 6.1.3 from 6.1.4.",
    },
  },
  stableTags: ["Issues", "Projects", "Users", "Time Entries", "News"],
  resolved: {
    "#/components/schemas/issue/properties/children/items": ISSUE_CHILD,
    "#/components/schemas/issue/properties/children/items/properties/id": ISSUE_CHILD,
    "#/components/schemas/issue/properties/children/items/properties/tracker": ISSUE_CHILD,
    "#/components/schemas/issue/properties/children/items/properties/subject": ISSUE_CHILD,
  },
  optional: {
    "#/components/schemas/wiki_page/properties/project":
      "The 6.1.3-r2 spec declares it, but Redmine 6.1 never renders it: wiki/show.api.rsb in 6.1.3, 6.1.5 and 6.1-stable has no project. Observed on 6.1: tests/contract/catalog.test.ts.",
  },
};
