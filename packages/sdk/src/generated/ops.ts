// Generated from spec/redmine-openapi/*.yaml by `vp run gen`. Do not edit.

import type { BinarySource, Download } from "../core/files.ts";
import type { Cond, ListInput, Listing } from "../core/listing.ts";
import type { Op } from "../core/op.ts";
import type {
  Attachment,
  CustomField,
  CustomFieldValues,
  CustomFields,
  DocumentCategory,
  File,
  Group,
  GroupSummary,
  IdName,
  Issue,
  IssueCategory,
  IssuePriority,
  IssueRelation,
  IssueStatus,
  IssueSummary,
  Membership,
  MyAccount,
  News,
  Pref,
  Project,
  ProjectSummary,
  Query,
  Role,
  Search,
  TimeEntry,
  TimeEntryActivity,
  Tracker,
  Uploads,
  User,
  UserSummary,
  Version,
  VersionSummary,
  WikiPage,
  WikiPageSummary,
} from "./schemas.ts";

export type GetIssuesInclude = "attachments" | "relations";

export interface GetIssuesWhere {
  /**
   * Filter by issue ID.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `1`, `>=100`, `><1|100`
   */
  issue_id?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by project.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `mine` (projects where current user is a member), `bookmarks` (bookmarked projects)
   * Examples: `1|2`, `mine`, `!mine`
   */
  project_id?: Cond<string | number, "not">;
  /**
   * Filter by subproject.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `*`, `!*`
   */
  subproject_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by tracker.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `1|2`, `!3`
   */
  tracker_id?: Cond<string | number, "not">;
  /**
   * Filter by issue status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `o` (open), `=` (default), `!` (not equal), `c` (closed), `*` (any), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `o`, `1|2`, `c`, `!3`
   */
  status_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by priority.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `1|2`, `!3`
   */
  priority_id?: Cond<string | number, "not">;
  /**
   * Filter by assignee.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!*`, `!me`
   */
  assigned_to_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by author.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!me`
   */
  author_id?: Cond<string | number, "not">;
  /**
   * Filter by author's group.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`
   */
  "author.group"?: Cond<string | number, "not">;
  /**
   * Filter by author's role.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`
   */
  "author.role"?: Cond<string | number, "not">;
  /**
   * Filter by assignee's group membership.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1`, `*`
   */
  member_of_group?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by assignee's role.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1`, `*`
   */
  assigned_to_role?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by target version.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `1|2`, `!*`
   */
  fixed_version_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by target version's due date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`
   */
  "fixed_version.due_date"?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by target version's status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Values: `open`, `locked`, `closed`
   * Examples: `open`, `open|locked`, `!closed`
   */
  "fixed_version.status"?: Cond<string | number, "not">;
  /**
   * Filter by category.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `1|2`, `!*`
   */
  category_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by parent issue.
   * Format: `[operator]value`
   * Operators: `=` (exact parent ID), `~` (descendant of, subtree search), `*` (any, i.e. is a subtask), `!*` (none, i.e. is a root issue)
   * Examples: `123`, `~123`, `*`, `!*`
   */
  parent_id?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by child issue.
   * Format: `[operator]value`
   * Operators: `=` (exact child ID), `~` (ancestor of, subtree search), `*` (any, i.e. has subtasks), `!*` (none, i.e. is a leaf issue)
   * Examples: `123`, `~123`, `*`, `!*`
   */
  child_id?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by subject.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `^prefix`
   */
  subject?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by description.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `!~excluded`
   */
  description?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by journal notes.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`
   */
  notes?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by creation date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`, `lm`
   */
  created_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by last updated date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`, `lm`
   */
  updated_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by closed date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`, `lm`
   */
  closed_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by start date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`
   */
  start_date?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by due date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`
   */
  due_date?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by estimated hours.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `>=5`, `><1|10`, `!*`
   */
  estimated_hours?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by total spent time.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `>=5`, `><1|10`, `!*`
   */
  spent_time?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by done ratio (percentage).
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `>=50`, `><0|99`, `100`
   */
  done_ratio?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by private flag.
   * Format: `[operator]value`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (private), `0` (not private)
   * Examples: `1`, `0`
   */
  is_private?: Cond<string | number, "not">;
  /**
   * Filter by attachment filename.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~report`, `*.pdf`
   */
  attachment?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by attachment description.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~screenshot`
   */
  attachment_description?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by watcher.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!me`
   */
  watcher_id?: Cond<string | number, "not">;
  /**
   * Filter by user who updated the issue.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `me` (current user)
   * Examples: `1`, `me`
   */
  updated_by?: Cond<string | number, "not">;
  /**
   * Filter by user who last updated the issue.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `me` (current user)
   * Examples: `1`, `me`
   */
  last_updated_by?: Cond<string | number, "not">;
  /**
   * Filter by project status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (active), `5` (closed)
   * Examples: `1`, `!5`
   */
  "project.status"?: Cond<string | number, "not">;
  /**
   * Filter by "relates to" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `=p` (same project), `=!p` (different project), `!p` (not in project), `*o` (related to open issue), `!o` (related to closed issue), `*` (any), `!*` (none)
   * Examples: `123`, `=p`, `*o`, `*`
   */
  relates?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "duplicates" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  duplicates?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "duplicated by" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  duplicated?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "blocks" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*o`
   */
  blocks?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "blocked by" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*o`
   */
  blocked?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "precedes" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  precedes?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "follows" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  follows?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "copied to" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  copied_to?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "copied from" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  copied_from?: Cond<string | number, "not" | "presence">;
  /**
   * Full-text search across all searchable fields.
   * Format: `<operator>value`
   * Operators: `~` (contains all words), `*~` (contains any word), `!~` (not contains)
   * Examples: `~keyword`, `*~foo bar`
   */
  any_searchable?: Cond<string | number, "text">;
  /**
   * Custom field filters by id, e.g. `cf_12`. Operators depend on the field format.
   */
  [field: `cf_${number}`]: Cond<string | number, "not" | "range" | "text" | "presence">;
}

export interface GetIssuesInput<
  I extends GetIssuesInclude = GetIssuesInclude,
> extends ListInput<GetIssuesWhere> {
  /**
   * Comma-separated list of associated data to include for each issue.
   * Values: `attachments` (file attachments), `relations` (issue relations)
   */
  include?: readonly I[];
  /**
   * ID of a saved query to apply. When specified, the saved query's filter criteria are used.
   * Other filter parameters in the same request are ignored.
   * Use GET /queries.json to retrieve available saved queries.
   */
  query_id?: number;
}

export interface CreateIssueInput {
  project_id: number | string;
  tracker_id?: number;
  status_id?: number;
  priority_id?: number;
  subject: string;
  description?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  done_ratio?: number;
  category_id?: number | null;
  fixed_version_id?: number | null;
  assigned_to_id?: number | null;
  parent_issue_id?: number | null;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
  watcher_user_ids?: number[];
  is_private?: boolean;
  estimated_hours?: number | null;
  uploads?: Uploads;
}

export type GetIssueInclude =
  | "children"
  | "attachments"
  | "relations"
  | "changesets"
  | "journals"
  | "watchers"
  | "allowed_statuses";

export interface GetIssueInput<I extends GetIssueInclude = GetIssueInclude> {
  issue_id: number;
  /**
   * Comma-separated list of associated data to include in the response.
   * Values: `children` (child issues), `attachments` (file attachments), `relations` (issue relations), `changesets` (associated VCS changesets), `journals` (change history and notes), `watchers` (users watching the issue), `allowed_statuses` (status transitions available for the current user)
   */
  include?: readonly I[];
}

export interface UpdateIssueInput {
  issue_id: number;
  project_id?: number | string;
  tracker_id?: number;
  status_id?: number;
  priority_id?: number;
  subject?: string;
  description?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  done_ratio?: number;
  category_id?: number | null;
  fixed_version_id?: number | null;
  assigned_to_id?: number | null;
  parent_issue_id?: number | null;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
  is_private?: boolean;
  estimated_hours?: number | null;
  notes?: string;
  /**
   * Mark the notes as private. Only visible to users with the "View private notes" permission.
   */
  private_notes?: boolean;
  /**
   * IDs of existing attachments to remove from this issue.
   */
  deleted_attachment_ids?: number[];
  uploads?: Uploads;
}

export interface DeleteIssueInput {
  issue_id: number;
}

export type GetIssuesByProjectInclude = "attachments" | "relations";

export interface GetIssuesByProjectWhere {
  /**
   * Filter by issue ID.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `1`, `>=100`, `><1|100`
   */
  issue_id?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by subproject.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `*`, `!*`
   */
  subproject_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by tracker.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `1|2`, `!3`
   */
  tracker_id?: Cond<string | number, "not">;
  /**
   * Filter by issue status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `o` (open), `=` (default), `!` (not equal), `c` (closed), `*` (any), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `o`, `1|2`, `c`, `!3`
   */
  status_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by priority.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `1|2`, `!3`
   */
  priority_id?: Cond<string | number, "not">;
  /**
   * Filter by assignee.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!*`, `!me`
   */
  assigned_to_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by author.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!me`
   */
  author_id?: Cond<string | number, "not">;
  /**
   * Filter by author's group.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`
   */
  "author.group"?: Cond<string | number, "not">;
  /**
   * Filter by author's role.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`
   */
  "author.role"?: Cond<string | number, "not">;
  /**
   * Filter by assignee's group membership.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1`, `*`
   */
  member_of_group?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by assignee's role.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1`, `*`
   */
  assigned_to_role?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by target version.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `1|2`, `!*`
   */
  fixed_version_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by target version's due date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`
   */
  "fixed_version.due_date"?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by target version's status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Values: `open`, `locked`, `closed`
   * Examples: `open`, `open|locked`, `!closed`
   */
  "fixed_version.status"?: Cond<string | number, "not">;
  /**
   * Filter by category.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)
   * Examples: `1|2`, `!*`
   */
  category_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by parent issue.
   * Format: `[operator]value`
   * Operators: `=` (exact parent ID), `~` (descendant of, subtree search), `*` (any, i.e. is a subtask), `!*` (none, i.e. is a root issue)
   * Examples: `123`, `~123`, `*`, `!*`
   */
  parent_id?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by child issue.
   * Format: `[operator]value`
   * Operators: `=` (exact child ID), `~` (ancestor of, subtree search), `*` (any, i.e. has subtasks), `!*` (none, i.e. is a leaf issue)
   * Examples: `123`, `~123`, `*`, `!*`
   */
  child_id?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by subject.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `^prefix`
   */
  subject?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by description.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `!~excluded`
   */
  description?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by journal notes.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`
   */
  notes?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by creation date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`, `lm`
   */
  created_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by last updated date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`, `lm`
   */
  updated_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by closed date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`, `lm`
   */
  closed_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by start date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`
   */
  start_date?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by due date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `t`, `>t-7`
   */
  due_date?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by estimated hours.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `>=5`, `><1|10`, `!*`
   */
  estimated_hours?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by total spent time.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `>=5`, `><1|10`, `!*`
   */
  spent_time?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by done ratio (percentage).
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `>=50`, `><0|99`, `100`
   */
  done_ratio?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by private flag.
   * Format: `[operator]value`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (private), `0` (not private)
   * Examples: `1`, `0`
   */
  is_private?: Cond<string | number, "not">;
  /**
   * Filter by attachment filename.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~report`, `*.pdf`
   */
  attachment?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by attachment description.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~screenshot`
   */
  attachment_description?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by watcher.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!me`
   */
  watcher_id?: Cond<string | number, "not">;
  /**
   * Filter by user who updated the issue.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `me` (current user)
   * Examples: `1`, `me`
   */
  updated_by?: Cond<string | number, "not">;
  /**
   * Filter by user who last updated the issue.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `me` (current user)
   * Examples: `1`, `me`
   */
  last_updated_by?: Cond<string | number, "not">;
  /**
   * Filter by project status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (active), `5` (closed)
   * Examples: `1`, `!5`
   */
  "project.status"?: Cond<string | number, "not">;
  /**
   * Filter by "relates to" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `=p` (same project), `=!p` (different project), `!p` (not in project), `*o` (related to open issue), `!o` (related to closed issue), `*` (any), `!*` (none)
   * Examples: `123`, `=p`, `*o`, `*`
   */
  relates?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "duplicates" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  duplicates?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "duplicated by" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  duplicated?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "blocks" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*o`
   */
  blocks?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "blocked by" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*o`
   */
  blocked?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "precedes" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  precedes?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "follows" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  follows?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "copied to" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  copied_to?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by "copied from" relation.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`
   * Examples: `123`, `*`
   */
  copied_from?: Cond<string | number, "not" | "presence">;
  /**
   * Full-text search across all searchable fields.
   * Format: `<operator>value`
   * Operators: `~` (contains all words), `*~` (contains any word), `!~` (not contains)
   * Examples: `~keyword`, `*~foo bar`
   */
  any_searchable?: Cond<string | number, "text">;
  /**
   * Custom field filters by id, e.g. `cf_12`. Operators depend on the field format.
   */
  [field: `cf_${number}`]: Cond<string | number, "not" | "range" | "text" | "presence">;
}

export interface GetIssuesByProjectInput<
  I extends GetIssuesByProjectInclude = GetIssuesByProjectInclude,
> extends ListInput<GetIssuesByProjectWhere> {
  project_id: number | string;
  /**
   * Comma-separated list of associated data to include for each issue.
   * Values: `attachments` (file attachments), `relations` (issue relations)
   */
  include?: readonly I[];
  /**
   * ID of a saved query to apply. When specified, the saved query's filter criteria are used.
   * Other filter parameters in the same request are ignored.
   * Use GET /queries.json to retrieve available saved queries.
   */
  query_id?: number;
}

export interface CreateIssueUnderProjectInput {
  project_id: number | string;
  tracker_id?: number;
  status_id?: number;
  priority_id?: number;
  subject: string;
  description?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  done_ratio?: number;
  category_id?: number | null;
  fixed_version_id?: number | null;
  assigned_to_id?: number | null;
  parent_issue_id?: number | null;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
  watcher_user_ids?: number[];
  is_private?: boolean;
  estimated_hours?: number | null;
  uploads?: Uploads;
}

export interface AddWatcherInput {
  issue_id: number;
  user_id: number;
}

export interface RemoveWatcherInput {
  issue_id: number;
  user_id: number;
}

export type GetProjectsInclude =
  | "trackers"
  | "issue_categories"
  | "time_entry_activities"
  | "enabled_modules"
  | "issue_custom_fields";

export interface GetProjectsWhere {
  /**
   * Filter by project status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (active), `5` (closed)
   * Examples: `1`, `1|5`, `!1`
   */
  status?: Cond<string | number, "not">;
  /**
   * Filter by project ID.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `mine` (projects where current user is a member), `bookmarks` (bookmarked projects)
   * Examples: `1|2|3`, `mine`, `!mine`, `mine|bookmarks`
   */
  id?: Cond<string | number, "not">;
  /**
   * Filter by project name.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `^prefix`
   */
  name?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by project description.
   * Format: `<operator>value`
   * Operators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `!~excluded`
   */
  description?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by parent project.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any, i.e. is a subproject), `!*` (none, i.e. is a root project)
   * Special values: `mine` (projects where current user is a member), `bookmarks` (bookmarked projects)
   * Examples: `1|2`, `mine`, `*`, `!*`
   */
  parent_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by public/private status.
   * Format: `[operator]value`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (public), `0` (private)
   * Examples: `1`, `!1`
   */
  is_public?: Cond<string | number, "not">;
  /**
   * Filter by creation date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `><2024-01-01|2024-12-31`, `t`, `>t-7`, `lm`
   */
  created_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by last updated date.
   * Format: `<operator>[value]`
   * Operators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `><2024-01-01|2024-12-31`, `t`, `>t-7`, `lm`
   */
  updated_on?: Cond<string | number, "range" | "presence">;
}

export interface GetProjectsInput<
  I extends GetProjectsInclude = GetProjectsInclude,
> extends ListInput<GetProjectsWhere> {
  /**
   * Comma-separated list of associated data to include for each project.
   * Values: `trackers` (available issue trackers), `issue_categories` (issue categories), `time_entry_activities` (time entry activity types), `enabled_modules` (enabled modules/features), `issue_custom_fields` (custom fields for issues)
   */
  include?: readonly I[];
}

export interface CreateProjectInput {
  name: string;
  identifier: string;
  description?: string | null;
  homepage?: string | null;
  is_public?: boolean;
  parent_id?: number | null;
  /**
   * Inherit members from the parent project. Only effective for subprojects (parent_id is set).
   */
  inherit_members?: boolean;
  /**
   * Default assignee for new issues in this project. Set to null to clear.
   */
  default_assigned_to_id?: number | null;
  /**
   * Default target version for new issues in this project. Set to null to clear.
   */
  default_version_id?: number | null;
  /**
   * Default saved query for the project's issue list page. Set to null to clear.
   */
  default_issue_query_id?: number | null;
  /**
   * IDs of trackers available in this project.
   */
  tracker_ids?: number[];
  /**
   * Enabled module names for this project.
   * Values: `issue_tracking`, `time_tracking`, `news`, `documents`, `files`, `wiki`, `repository`, `boards`, `calendar`, `gantt`
   */
  enabled_module_names?: string[];
  /**
   * IDs of issue custom fields enabled for this project. Custom fields with `is_for_all=true` are always available regardless of this setting.
   */
  issue_custom_field_ids?: number[];
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export type GetProjectInclude =
  | "trackers"
  | "issue_categories"
  | "time_entry_activities"
  | "enabled_modules"
  | "issue_custom_fields";

export interface GetProjectInput<I extends GetProjectInclude = GetProjectInclude> {
  project_id: number | string;
  /**
   * Comma-separated list of associated data to include in the response.
   * Values: `trackers` (available issue trackers), `issue_categories` (issue categories), `time_entry_activities` (time entry activity types), `enabled_modules` (enabled modules/features), `issue_custom_fields` (custom fields for issues)
   */
  include?: readonly I[];
}

export interface UpdateProjectInput {
  project_id: number | string;
  /**
   * Accepted but ignored: a project's identifier cannot be changed
   * once the project exists, and the request still succeeds.
   */
  identifier?: string;
  name?: string;
  description?: string | null;
  homepage?: string | null;
  is_public?: boolean;
  parent_id?: number | null;
  /**
   * Inherit members from the parent project. Only effective for subprojects (parent_id is set).
   */
  inherit_members?: boolean;
  /**
   * Default assignee for new issues in this project. Set to null to clear.
   */
  default_assigned_to_id?: number | null;
  /**
   * Default target version for new issues in this project. Set to null to clear.
   */
  default_version_id?: number | null;
  /**
   * Default saved query for the project's issue list page. Set to null to clear.
   */
  default_issue_query_id?: number | null;
  /**
   * IDs of trackers available in this project.
   */
  tracker_ids?: number[];
  /**
   * Enabled module names for this project.
   * Values: `issue_tracking`, `time_tracking`, `news`, `documents`, `files`, `wiki`, `repository`, `boards`, `calendar`, `gantt`
   */
  enabled_module_names?: string[];
  /**
   * IDs of issue custom fields enabled for this project. Custom fields with `is_for_all=true` are always available regardless of this setting.
   */
  issue_custom_field_ids?: number[];
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export interface DeleteProjectInput {
  project_id: number | string;
}

export interface ArchiveProjectInput {
  project_id: number | string;
}

export interface UnarchiveProjectInput {
  project_id: number | string;
}

export interface GetMembershipsInput extends ListInput<never> {
  project_id: number | string;
}

export interface CreateMembershipInput {
  project_id: number | string;
  user_id: number;
  role_ids: number[];
}

export interface GetMembershipInput {
  membership_id: number;
}

export interface UpdateMembershipInput {
  membership_id: number;
  role_ids: number[];
}

export interface DeleteMembershipInput {
  membership_id: number;
}

export interface CloseProjectInput {
  project_id: number | string;
}

export interface ReopenProjectInput {
  project_id: number | string;
}

export type GetUsersInclude = "auth_source";

export interface GetUsersWhere {
  /**
   * Filter by user status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Values: `1` (active), `2` (registered), `3` (locked)
   * Examples: `1`, `1|2`, `!3`
   */
  status?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by authentication source. Undocumented
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1`, `!1`
   */
  auth_source_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by two-factor authentication scheme. Undocumented
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Only available when two-factor authentication is enabled in Redmine settings.
   */
  twofa_scheme?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by login. Undocumented
   * Format: `[operator]value`
   * Operators: `~` (contains, default), `*~` (contains any word), `=` (exact match), `!~` (does not contain), `!` (not equal), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~admin`, `^john`
   */
  login?: Cond<string | number, "not" | "text" | "presence">;
  /**
   * Filter by first name. Undocumented
   * Format: `[operator]value`
   * Operators: `~` (contains, default), `*~` (contains any word), `=` (exact match), `!~` (does not contain), `!` (not equal), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~John`, `=John`
   */
  firstname?: Cond<string | number, "not" | "text" | "presence">;
  /**
   * Filter by last name. Undocumented
   * Format: `[operator]value`
   * Operators: `~` (contains, default), `*~` (contains any word), `=` (exact match), `!~` (does not contain), `!` (not equal), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~Doe`, `=Doe`
   */
  lastname?: Cond<string | number, "not" | "text" | "presence">;
  /**
   * Filter by email address. Undocumented
   * Format: `[operator]value`
   * Operators: `~` (contains, default), `*~` (contains any word), `=` (exact match), `!~` (does not contain), `!` (not equal), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~example.com`, `$@example.com`
   */
  mail?: Cond<string | number, "not" | "text" | "presence">;
  /**
   * Filter by creation date. Undocumented
   * Format: `[operator]value`
   * Operators: `=` (on date), `>=`, `<=`, `><` (between, pipe-separated), `>t-` (more than N days ago), `<t-` (less than N days ago), `><t-` (between N and M days ago), `t-` (N days ago), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `>t-30`, `lm`
   */
  created_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by last login date. Undocumented
   * Format: `[operator]value`
   * Operators: `=` (on date), `>=`, `<=`, `><` (between, pipe-separated), `>t-` (more than N days ago), `<t-` (less than N days ago), `><t-` (between N and M days ago), `t-` (N days ago), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `*` (any), `!*` (none)
   * Examples: `>=2024-01-01`, `>t-30`, `!*`
   */
  last_login_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by admin privilege. Undocumented
   * Format: `[operator]value`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (admin), `0` (non-admin)
   * Examples: `1`, `!1`
   */
  admin?: Cond<string | number, "not">;
}

export interface GetUsersInput<
  I extends GetUsersInclude = GetUsersInclude,
> extends ListInput<GetUsersWhere> {
  /**
   * Comma-separated list of associated data to include for each user.
   * Values: `auth_source` (authentication source information)
   */
  include?: readonly I[];
  /**
   * Filter by name, login, or email (contains search).
   * The API always uses the `~` (contains) operator regardless of any operator prefix.
   * Examples: `john`, `admin`
   */
  name?: string;
  /**
   * Filter by group membership (legacy parameter).
   * Internally converted to `is_member_of_group` filter with `=` operator.
   * Value is the group ID.
   */
  group_id?: string;
}

export interface CreateUserInput {
  login: string;
  admin?: boolean;
  password?: string;
  firstname: string;
  lastname: string;
  mail: string;
  language?: string;
  /**
   * External authentication source ID (e.g., LDAP). When set, the user authenticates via the external source and the password field is ignored. Set to null for local authentication.
   */
  auth_source_id?: number | null;
  /**
   * Email notification preference.
   * Values: `all` (for any event on all projects), `selected` (for any event on selected projects only), `only_my_events` (only for things I watch or am involved in), `only_assigned` (only for things I am assigned to), `only_owner` (only for things I am the owner of), `none` (no events)
   */
  mail_notification?:
    | "all"
    | "selected"
    | "only_my_events"
    | "only_assigned"
    | "only_owner"
    | "none";
  /**
   * Project IDs for which to receive email notifications. Only effective when mail_notification is set to `selected`.
   */
  notified_project_ids?: number[];
  /**
   * Force the user to change their password at next login.
   */
  must_change_passwd?: boolean;
  /**
   * Generate a random password automatically. When true, the password field is ignored. Only effective for locally authenticated users (auth_source_id is null).
   */
  generate_password?: boolean;
  /**
   * User account status: `1` (active), `2` (registered), `3` (locked).
   */
  status?: number;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
  /**
   * Set to true to send an account information email to the user. Not stored; only triggers email delivery.
   */
  send_information?: boolean;
  pref?: Pref;
}

export type GetUserInclude = "memberships" | "groups" | "auth_source";

export interface GetUserInput<I extends GetUserInclude = GetUserInclude> {
  user_id: number;
  /**
   * Comma-separated list of associated data to include in the response.
   * Values: `memberships` (project memberships with roles), `groups` (groups the user belongs to), `auth_source` (authentication source information)
   */
  include?: readonly I[];
}

export interface UpdateUserInput {
  user_id: number;
  login?: string;
  admin?: boolean;
  password?: string;
  firstname?: string;
  lastname?: string;
  mail?: string;
  language?: string;
  /**
   * External authentication source ID (e.g., LDAP). When set, the user authenticates via the external source and the password field is ignored. Set to null for local authentication.
   */
  auth_source_id?: number | null;
  /**
   * Email notification preference.
   * Values: `all` (for any event on all projects), `selected` (for any event on selected projects only), `only_my_events` (only for things I watch or am involved in), `only_assigned` (only for things I am assigned to), `only_owner` (only for things I am the owner of), `none` (no events)
   */
  mail_notification?:
    | "all"
    | "selected"
    | "only_my_events"
    | "only_assigned"
    | "only_owner"
    | "none";
  /**
   * Project IDs for which to receive email notifications. Only effective when mail_notification is set to `selected`.
   */
  notified_project_ids?: number[];
  /**
   * Force the user to change their password at next login.
   */
  must_change_passwd?: boolean;
  /**
   * Generate a random password automatically. When true, the password field is ignored. Only effective for locally authenticated users (auth_source_id is null).
   */
  generate_password?: boolean;
  /**
   * User account status: `1` (active), `2` (registered), `3` (locked).
   */
  status?: number;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
  /**
   * Group IDs to assign the user to. Admin-only. Replaces all current group memberships (not append).
   */
  group_ids?: number[];
  /**
   * Set to true to send an account information email to the user. Not stored; only triggers email delivery.
   */
  send_information?: boolean;
  pref?: Pref;
}

export interface DeleteUserInput {
  user_id: number;
}

export type GetCurrentUserInclude = "memberships" | "groups" | "auth_source";

export interface GetCurrentUserInput<I extends GetCurrentUserInclude = GetCurrentUserInclude> {
  /**
   * Comma-separated list of associated data to include in the response.
   * Values: `memberships` (project memberships with roles), `groups` (groups the user belongs to), `auth_source` (authentication source information)
   */
  include?: readonly I[];
}

export interface GetTimeEntriesWhere {
  /**
   * Filter by user.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!*`
   */
  user_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by project.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Special values: `mine` (projects where current user is a member), `bookmarks` (bookmarked projects)
   * Examples: `1|2`, `mine`, `!mine`
   */
  project_id?: Cond<string | number, "not">;
  /**
   * Filter by date spent.
   * Format: `[operator]value`
   * Operators: `=` (on date), `>=`, `<=`, `><` (between, pipe-separated), `>t-` (more than N days ago), `<t-` (less than N days ago), `><t-` (between N and M days ago), `t-` (N days ago), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `*` (any), `!*` (none)
   * Examples: `=2024-01-01`, `>=2024-01-01`, `><2024-01-01|2024-12-31`, `>t-7`, `t`, `lw`
   */
  spent_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by subproject.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `*`, `!*`
   */
  subproject_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by issue.
   * Format: `[operator]value`
   * Operators: `=` (exact match), `~` (issue and its subtasks), `*` (any), `!*` (none)
   * Examples: `=1`, `~1`, `*`, `!*`
   */
  issue_id?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by issue's tracker.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`, `!3`
   */
  "issue.tracker_id"?: Cond<string | number, "not">;
  /**
   * Filter by issue's status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`, `!3`
   */
  "issue.status_id"?: Cond<string | number, "not">;
  /**
   * Filter by issue's target version.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`, `!3`
   */
  "issue.fixed_version_id"?: Cond<string | number, "not">;
  /**
   * Filter by issue's parent.
   * Format: `[operator]value`
   * Operators: `=` (exact match), `~` (issue and its subtasks), `*` (any), `!*` (none)
   * Examples: `=1`, `~1`, `*`, `!*`
   */
  "issue.parent_id"?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by issue's category.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `!*`
   */
  "issue.category_id"?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by issue's subject.
   * Format: `[operator]value`
   * Operators: `~` (contains, default), `*~` (contains any word), `!~` (does not contain), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `^prefix`, `$suffix`
   */
  "issue.subject"?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by user's group.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `*`
   */
  "user.group"?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by user's role.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `*`
   */
  "user.role"?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by author.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!*`
   */
  author_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by activity.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`, `!3`
   */
  activity_id?: Cond<string | number, "not">;
  /**
   * Filter by project's status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (active), `5` (closed)
   * Examples: `1`, `!5`
   */
  "project.status"?: Cond<string | number, "not">;
  /**
   * Filter by comments.
   * Format: `[operator]value`
   * Operators: `~` (contains, default), `*~` (contains any word), `!~` (does not contain), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `^prefix`
   */
  comments?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by hours.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `=8`, `>=4`, `><1|8`
   */
  hours?: Cond<string | number, "range" | "presence">;
}

export interface GetTimeEntriesInput extends ListInput<GetTimeEntriesWhere> {
  /**
   * Shortcut for `spent_on` filter. When used with `to`, filters as between (`>=from` and `<=to`). When used alone, filters as `>=from`.
   * Format: `YYYY-MM-DD`
   */
  from?: string;
  /**
   * Shortcut for `spent_on` filter. When used with `from`, filters as between (`>=from` and `<=to`). When used alone, filters as `<=to`.
   * Format: `YYYY-MM-DD`
   */
  to?: string;
}

export interface CreateTimeEntryInput {
  issue_id?: number;
  project_id?: number;
  spent_on?: string;
  hours: number;
  activity_id?: number;
  comments?: string;
  user_id?: number;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export interface GetTimeEntryInput {
  time_entry_id: number;
}

export interface UpdateTimeEntryInput {
  time_entry_id: number;
  issue_id?: number;
  project_id?: number;
  spent_on?: string;
  hours?: number;
  activity_id?: number;
  comments?: string;
  user_id?: number;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export interface DeleteTimeEntryInput {
  time_entry_id: number;
}

export interface GetTimeEntriesByProjectWhere {
  /**
   * Filter by user.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!*`
   */
  user_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by date spent.
   * Format: `[operator]value`
   * Operators: `=` (on date), `>=`, `<=`, `><` (between, pipe-separated), `>t-` (more than N days ago), `<t-` (less than N days ago), `><t-` (between N and M days ago), `t-` (N days ago), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `*` (any), `!*` (none)
   * Examples: `=2024-01-01`, `>=2024-01-01`, `><2024-01-01|2024-12-31`, `>t-7`, `t`, `lw`
   */
  spent_on?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by subproject.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `*`, `!*`
   */
  subproject_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by issue.
   * Format: `[operator]value`
   * Operators: `=` (exact match), `~` (issue and its subtasks), `*` (any), `!*` (none)
   * Examples: `=1`, `~1`, `*`, `!*`
   */
  issue_id?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by issue's tracker.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`, `!3`
   */
  "issue.tracker_id"?: Cond<string | number, "not">;
  /**
   * Filter by issue's status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`, `!3`
   */
  "issue.status_id"?: Cond<string | number, "not">;
  /**
   * Filter by issue's target version.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`, `!3`
   */
  "issue.fixed_version_id"?: Cond<string | number, "not">;
  /**
   * Filter by issue's parent.
   * Format: `[operator]value`
   * Operators: `=` (exact match), `~` (issue and its subtasks), `*` (any), `!*` (none)
   * Examples: `=1`, `~1`, `*`, `!*`
   */
  "issue.parent_id"?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by issue's category.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `!*`
   */
  "issue.category_id"?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by issue's subject.
   * Format: `[operator]value`
   * Operators: `~` (contains, default), `*~` (contains any word), `!~` (does not contain), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `^prefix`, `$suffix`
   */
  "issue.subject"?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by user's group.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `*`
   */
  "user.group"?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by user's role.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Examples: `1|2`, `*`
   */
  "user.role"?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by author.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal), `*` (any), `!*` (none)
   * Special values: `me` (current user)
   * Examples: `1`, `me`, `!*`
   */
  author_id?: Cond<string | number, "not" | "presence">;
  /**
   * Filter by activity.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Examples: `1|2`, `!3`
   */
  activity_id?: Cond<string | number, "not">;
  /**
   * Filter by project's status.
   * Format: `[operator]value[|value2|...]`
   * Operators: `=` (default), `!` (not equal)
   * Values: `1` (active), `5` (closed)
   * Examples: `1`, `!5`
   */
  "project.status"?: Cond<string | number, "not">;
  /**
   * Filter by comments.
   * Format: `[operator]value`
   * Operators: `~` (contains, default), `*~` (contains any word), `!~` (does not contain), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)
   * Examples: `~keyword`, `^prefix`
   */
  comments?: Cond<string | number, "text" | "presence">;
  /**
   * Filter by hours.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * Examples: `=8`, `>=4`, `><1|8`
   */
  hours?: Cond<string | number, "range" | "presence">;
}

export interface GetTimeEntriesByProjectInput extends ListInput<GetTimeEntriesByProjectWhere> {
  project_id: number | string;
  /**
   * Shortcut for `spent_on` filter. When used with `to`, filters as between (`>=from` and `<=to`). When used alone, filters as `>=from`.
   * Format: `YYYY-MM-DD`
   */
  from?: string;
  /**
   * Shortcut for `spent_on` filter. When used with `from`, filters as between (`>=from` and `<=to`). When used alone, filters as `<=to`.
   * Format: `YYYY-MM-DD`
   */
  to?: string;
}

export interface CreateTimeEntryUnderProjectInput {
  project_id: number | string;
  issue_id?: number;
  spent_on?: string;
  hours: number;
  activity_id?: number;
  comments?: string;
  user_id?: number;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export interface CreateTimeEntryUnderIssueInput {
  issue_id: number;
  project_id?: number;
  spent_on?: string;
  hours: number;
  activity_id?: number;
  comments?: string;
  user_id?: number;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export type GetNewsListInput = ListInput<never>;

export type GetNewsInclude = "attachments" | "comments";

export interface GetNewsInput<I extends GetNewsInclude = GetNewsInclude> {
  news_id: number;
  /**
   * Comma-separated list of associated data to include in the response.
   * Values: `attachments` (file attachments), `comments` (comments/replies on the news item)
   */
  include?: readonly I[];
}

export interface UpdateNewsInput {
  news_id: number;
  title?: string;
  summary?: string;
  description?: string;
  uploads?: Uploads;
}

export interface DeleteNewsInput {
  news_id: number;
}

export interface GetNewsListByProjectInput extends ListInput<never> {
  project_id: number | string;
}

export interface CreateNewsInput {
  project_id: number | string;
  title: string;
  summary?: string;
  description: string;
  uploads?: Uploads;
}

export interface GetIssueRelationsInput extends ListInput<never> {
  issue_id: number;
}

export interface CreateIssueRelationInput {
  issue_id: number;
  issue_to_id: number;
  /**
   * Type of relation from this issue to the target issue.
   * Values: `relates` (related to), `duplicates` (this duplicates target), `duplicated` (this is duplicated by target), `blocks` (this blocks target), `blocked` (this is blocked by target), `precedes` (this must finish before target starts), `follows` (this must start after target finishes), `copied_to` (this was copied to target), `copied_from` (this was copied from target)
   */
  relation_type:
    | "relates"
    | "duplicates"
    | "duplicated"
    | "blocks"
    | "blocked"
    | "precedes"
    | "follows"
    | "copied_to"
    | "copied_from";
  /**
   * Number of days of delay for `precedes`/`follows` relations. Ignored for other relation types.
   */
  delay?: number | null;
}

export interface GetIssueRelationInput {
  issue_relation_id: number;
}

export interface DeleteIssueRelationInput {
  issue_relation_id: number;
}

export interface GetVersionsByProjectInput extends ListInput<never> {
  project_id: number | string;
}

export interface CreateVersionInput {
  project_id: number | string;
  name: string;
  status?: "open" | "locked" | "closed";
  /**
   * Version sharing scope.
   * Values: `none` (not shared), `descendants` (with subprojects), `hierarchy` (with ancestors and descendants), `tree` (with entire project tree), `system` (with all projects)
   */
  sharing?: "none" | "descendants" | "hierarchy" | "tree" | "system";
  due_date?: string | null;
  description?: string;
  /**
   * Title of a wiki page to associate with this version. Set to null to clear.
   */
  wiki_page_title?: string | null;
  /**
   * Set to true to make this the default target version for new issues in the project.
   */
  default_project_version?: boolean;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export interface GetVersionInput {
  version_id: number;
}

export interface UpdateVersionInput {
  version_id: number;
  name?: string;
  status?: "open" | "locked" | "closed";
  /**
   * Version sharing scope.
   * Values: `none` (not shared), `descendants` (with subprojects), `hierarchy` (with ancestors and descendants), `tree` (with entire project tree), `system` (with all projects)
   */
  sharing?: "none" | "descendants" | "hierarchy" | "tree" | "system";
  due_date?: string | null;
  description?: string;
  /**
   * Title of a wiki page to associate with this version. Set to null to clear.
   */
  wiki_page_title?: string | null;
  /**
   * Set to true to make this the default target version for new issues in the project.
   */
  default_project_version?: boolean;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export interface DeleteVersionInput {
  version_id: number;
}

export interface GetWikiPagesInput extends ListInput<never> {
  project_id: number | string;
}

export type GetWikiPageInclude = "attachments";

export interface GetWikiPageInput<I extends GetWikiPageInclude = GetWikiPageInclude> {
  project_id: number | string;
  wiki_page_title: string;
  /**
   * Comma-separated list of associated data to include in the response.
   * Values: `attachments` (file attachments)
   */
  include?: readonly I[];
}

export interface UpdateWikiPageInput {
  project_id: number | string;
  wiki_page_title: string;
  text: string;
  comments?: string;
  /**
   * Content version for optimistic locking. If specified and it does not match the current version, the server returns 409 Conflict to prevent overwriting concurrent changes.
   */
  version?: number;
  /**
   * Title of the parent wiki page. Sets this page as a child in the page hierarchy.
   */
  parent_title?: string;
  /**
   * New title for the page (rename). Requires the rename_wiki_pages permission.
   */
  title?: string;
  /**
   * When renaming with title, controls whether the old title keeps redirecting to the new one. Only the string "0" disables the redirect; any other value (including boolean false) leaves it enabled.
   */
  redirect_existing_links?: "0" | "1";
  /**
   * Make this page the start page of the wiki. Requires the manage_wiki permission.
   */
  is_start_page?: boolean;
  deleted_attachment_ids?: number[];
  uploads?: Uploads;
}

export interface DeleteWikiPageInput {
  project_id: number | string;
  wiki_page_title: string;
}

export type GetWikiPageByVersionInclude = "attachments";

export interface GetWikiPageByVersionInput<
  I extends GetWikiPageByVersionInclude = GetWikiPageByVersionInclude,
> {
  project_id: number | string;
  wiki_page_title: string;
  version_id: number;
  /**
   * Comma-separated list of associated data to include in the response.
   * Values: `attachments` (file attachments)
   */
  include?: readonly I[];
}

export type GetQueriesInput = ListInput<never>;

export interface GetAttachmentInput {
  attachment_id: number;
}

export interface UpdateAttachmentInput {
  attachment_id: number;
  filename?: string;
  content_type?: string;
  description?: string;
}

export interface DeleteAttachmentInput {
  attachment_id: number;
}

export interface DownloadAttachmentFileInput {
  attachment_id: number;
  filename: string;
}

export interface DownloadThumbnailInput {
  attachment_id: number;
  /**
   * Desired thumbnail size in pixels (max 800). Rounded up to the nearest 50px increment.
   * If not specified, the configured default thumbnail size is used.
   */
  size?: number;
}

export type GetIssueStatusesInput = ListInput<never>;

export type GetTrackersInput = ListInput<never>;

export interface GetIssueCategoriesInput extends ListInput<never> {
  project_id: number | string;
}

export interface CreateIssueCategoryInput {
  project_id: number | string;
  name: string;
  assigned_to_id?: number;
}

export type GetIssuePrioritiesInput = ListInput<never>;

export type GetTimeEntryActivitiesInput = ListInput<never>;

export type GetDocumentCategoriesInput = ListInput<never>;

export interface GetIssueCategoryInput {
  issue_category_id: number;
}

export interface UpdateIssueCategoryInput {
  issue_category_id: number;
  name?: string;
  assigned_to_id?: number;
}

export interface DeleteIssueCategoryInput {
  issue_category_id: number;
  /**
   * ID of another issue category to reassign issues to before deleting this category.
   * If the category has associated issues and this parameter is not provided, the issues will have their category unset.
   */
  reassign_to_id?: number;
}

export type GetRolesInput = ListInput<never>;

export interface GetRoleInput {
  role_id: number;
}

export interface GetGroupsInput extends ListInput<never> {
  /**
   * Include built-in groups (e.g., "Anonymous", "Non member") in the response.
   * Set to `1` to include built-in groups. Without this parameter, only user-created groups are returned.
   */
  builtin?: "1";
}

export interface CreateGroupInput {
  name?: string;
  /**
   * User IDs to add as members of this group.
   */
  user_ids?: number[];
  /**
   * Require two-factor authentication for all members of this group.
   */
  twofa_required?: boolean;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export type GetGroupInclude = "users" | "memberships";

export interface GetGroupInput<I extends GetGroupInclude = GetGroupInclude> {
  group_id: number;
  /**
   * Comma-separated list of associated data to include in the response.
   * Values: `users` (list of users in the group), `memberships` (project memberships with roles)
   */
  include?: readonly I[];
}

export interface UpdateGroupInput {
  group_id: number;
  name?: string;
  user_ids?: number[];
  twofa_required?: boolean;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
}

export interface DeleteGroupInput {
  group_id: number;
}

export interface AddUserToGroupInput {
  group_id: number;
  user_id: number;
}

export interface RemoveUsersFromGroupInput {
  group_id: number;
  user_ids: readonly number[];
}

export interface RemoveUserFromGroupInput {
  group_id: number;
  user_id: number;
}

export type GetCustomFieldsInput = ListInput<never>;

export interface GetSearchInput extends ListInput<never> {
  /**
   * Search query string. Tokenized into words for matching.
   * When `all_words` is enabled (default), all tokens must match. Otherwise, any token can match.
   */
  q: string;
  /**
   * Search scope.
   * Values: `all` (all projects), `my_projects` (projects where current user is a member), `bookmarks` (bookmarked projects), `subprojects` (include subprojects, only effective for project-scoped search)
   */
  scope?: "all" | "my_projects" | "bookmarks" | "subprojects";
  /**
   * Require all words to match. Default is `true` (all words must match).
   * Set to empty string to disable (any word matches). Any non-empty value enables this option.
   */
  all_words?: string;
  /**
   * Search titles only. Default is `false`.
   * Any non-empty value enables this option.
   */
  titles_only?: string;
  /**
   * Include issues in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  issues?: 1;
  /**
   * Include news in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  news?: 1;
  /**
   * Include wiki pages in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  wiki_pages?: 1;
  /**
   * Include projects in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   * Not available when searching within a specific project.
   */
  projects?: 1;
  /**
   * Include documents in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  documents?: 1;
  /**
   * Include changesets in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  changesets?: 1;
  /**
   * Include forum messages in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  messages?: 1;
  /**
   * Only return open issues. Default is `false`.
   * Any non-empty value enables this option.
   */
  open_issues?: string;
  /**
   * Search attachments. Default is `0` (do not search attachments).
   * Values: `0` (disabled), `1` (search attachments and content), `only` (search attachments only)
   */
  attachments?: "0" | "1" | "only";
}

export interface GetSearchByProjectInput extends ListInput<never> {
  project_id: number | string;
  /**
   * Search query string. Tokenized into words for matching.
   * When `all_words` is enabled (default), all tokens must match. Otherwise, any token can match.
   */
  q: string;
  /**
   * Search scope.
   * Values: `subprojects` (include subprojects of the specified project)
   * When not specified, only the specified project is searched.
   */
  scope?: "subprojects";
  /**
   * Require all words to match. Default is `true` (all words must match).
   * Set to empty string to disable (any word matches). Any non-empty value enables this option.
   */
  all_words?: string;
  /**
   * Search titles only. Default is `false`.
   * Any non-empty value enables this option.
   */
  titles_only?: string;
  /**
   * Include issues in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  issues?: 1;
  /**
   * Include news in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  news?: 1;
  /**
   * Include wiki pages in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  wiki_pages?: 1;
  /**
   * Include documents in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  documents?: 1;
  /**
   * Include changesets in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  changesets?: 1;
  /**
   * Include forum messages in search results. Any non-empty value enables this search type.
   * If no search type parameters are specified, all types are searched.
   */
  messages?: 1;
  /**
   * Only return open issues. Default is `false`.
   * Any non-empty value enables this option.
   */
  open_issues?: string;
  /**
   * Search attachments. Default is `0` (do not search attachments).
   * Values: `0` (disabled), `1` (search attachments and content), `only` (search attachments only)
   */
  attachments?: "0" | "1" | "only";
}

export interface GetFilesInput extends ListInput<never> {
  project_id: number | string;
}

export interface CreateFileInput {
  project_id: number | string;
  token: string;
  version_id?: number;
  filename?: string;
  description?: string;
  content_type?: string;
}

export type GetMyAccountInput = Record<string, never>;

export interface UpdateMyAccountInput {
  login?: string;
  admin?: boolean;
  firstname?: string;
  lastname?: string;
  mail?: string;
  language?: string;
  auth_source_id?: number | null;
  mail_notification?:
    | "all"
    | "selected"
    | "only_my_events"
    | "only_assigned"
    | "only_owner"
    | "none";
  notified_project_ids?: number[];
  must_change_passwd?: boolean;
  generate_password?: boolean;
  status?: number;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
  group_ids?: number[];
  pref?: Pref;
}

export interface UpdateJournalInput {
  journal_id: number;
  notes?: string | null;
  /**
   * Mark the journal notes as private. Only visible to users with the "View private notes" permission.
   */
  private_notes?: boolean;
}

export interface UploadAttachmentFileInput {
  /**
   * Filename for the uploaded file. If not provided, a random hexadecimal name is generated.
   */
  filename?: string;
  /**
   * MIME type of the file (e.g., `application/pdf`, `image/png`). If not provided, auto-detected from the filename.
   */
  content_type?: string;
  file: BinarySource;
}

export interface AddRelatedIssueInput {
  project_id: number | string;
  repository_id: number | string;
  revision: string;
  issue_id: number;
}

export interface RemoveRelatedIssueInput {
  project_id: number | string;
  repository_id: number | string;
  revision: string;
  issue_id: number;
}

export const getIssues: Op<"getIssues", GetIssuesInput, Listing<IssueSummary>> = {
  id: "getIssues",
  method: "GET",
  path: "issues.json",
  pathParams: [],
  query: { sort: "scalar", include: "csv", query_id: "scalar" },
  filters: {
    issue_id: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
    project_id: { ops: ["=", "!"] },
    subproject_id: { ops: ["=", "!", "*", "!*"] },
    tracker_id: { ops: ["=", "!", "ev", "!ev", "cf"] },
    status_id: {
      ops: ["o", "=", "!", "c", "*", "ev", "!ev", "cf"],
      words: { open: "o", closed: "c", any: "*" },
    },
    priority_id: { ops: ["=", "!", "ev", "!ev", "cf"] },
    assigned_to_id: { ops: ["=", "!", "*", "!*", "ev", "!ev", "cf"] },
    author_id: { ops: ["=", "!"] },
    "author.group": { ops: ["=", "!"] },
    "author.role": { ops: ["=", "!"] },
    member_of_group: { ops: ["=", "!", "*", "!*"] },
    assigned_to_role: { ops: ["=", "!", "*", "!*"] },
    fixed_version_id: { ops: ["=", "!", "*", "!*", "ev", "!ev", "cf"] },
    "fixed_version.due_date": {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "nd",
        "w",
        "lw",
        "l2w",
        "nw",
        "m",
        "lm",
        "nm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "t+",
        ">t+",
        "<t+",
        "><t+",
        "*",
        "!*",
      ],
    },
    "fixed_version.status": { ops: ["=", "!"] },
    category_id: { ops: ["=", "!", "*", "!*", "ev", "!ev", "cf"] },
    parent_id: { ops: ["=", "~", "*", "!*"] },
    child_id: { ops: ["=", "~", "*", "!*"] },
    subject: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    description: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    notes: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    created_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "*",
        "!*",
      ],
    },
    updated_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "*",
        "!*",
      ],
    },
    closed_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "*",
        "!*",
      ],
    },
    start_date: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "nd",
        "w",
        "lw",
        "l2w",
        "nw",
        "m",
        "lm",
        "nm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "t+",
        ">t+",
        "<t+",
        "><t+",
        "*",
        "!*",
      ],
    },
    due_date: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "nd",
        "w",
        "lw",
        "l2w",
        "nw",
        "m",
        "lm",
        "nm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "t+",
        ">t+",
        "<t+",
        "><t+",
        "*",
        "!*",
      ],
    },
    estimated_hours: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
    spent_time: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
    done_ratio: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
    is_private: { ops: ["=", "!"] },
    attachment: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    attachment_description: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    watcher_id: { ops: ["=", "!"] },
    updated_by: { ops: ["=", "!"] },
    last_updated_by: { ops: ["=", "!"] },
    "project.status": { ops: ["=", "!"] },
    relates: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    duplicates: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    duplicated: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    blocks: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    blocked: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    precedes: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    follows: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    copied_to: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    copied_from: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    any_searchable: { ops: ["~", "*~", "!~"] },
  },
  customFieldFilters: true,
  body: null,
  response: { kind: "list", items: "issues", paged: true, keyset: { param: "issue_id" } },
  includes: ["attachments", "relations"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const createIssue: Op<"createIssue", CreateIssueInput, Promise<IssueSummary>> = {
  id: "createIssue",
  method: "POST",
  path: "issues.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "issue", siblings: [] },
  response: { kind: "item", unwrap: "issue" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const getIssue: Op<"getIssue", GetIssueInput, Promise<Issue>> = {
  id: "getIssue",
  method: "GET",
  path: "issues/{issue_id}.json",
  pathParams: ["issue_id"],
  query: { include: "csv" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "issue" },
  includes: [
    "children",
    "attachments",
    "relations",
    "changesets",
    "journals",
    "watchers",
    "allowed_statuses",
  ],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const updateIssue: Op<"updateIssue", UpdateIssueInput, Promise<void>> = {
  id: "updateIssue",
  method: "PUT",
  path: "issues/{issue_id}.json",
  pathParams: ["issue_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "issue", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const deleteIssue: Op<"deleteIssue", DeleteIssueInput, Promise<void>> = {
  id: "deleteIssue",
  method: "DELETE",
  path: "issues/{issue_id}.json",
  pathParams: ["issue_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "stable",
};

export const getIssuesByProject: Op<
  "getIssuesByProject",
  GetIssuesByProjectInput,
  Listing<IssueSummary>
> = {
  id: "getIssuesByProject",
  method: "GET",
  path: "projects/{project_id}/issues.json",
  pathParams: ["project_id"],
  query: { sort: "scalar", include: "csv", query_id: "scalar" },
  filters: {
    issue_id: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
    subproject_id: { ops: ["=", "!", "*", "!*"] },
    tracker_id: { ops: ["=", "!", "ev", "!ev", "cf"] },
    status_id: {
      ops: ["o", "=", "!", "c", "*", "ev", "!ev", "cf"],
      words: { open: "o", closed: "c", any: "*" },
    },
    priority_id: { ops: ["=", "!", "ev", "!ev", "cf"] },
    assigned_to_id: { ops: ["=", "!", "*", "!*", "ev", "!ev", "cf"] },
    author_id: { ops: ["=", "!"] },
    "author.group": { ops: ["=", "!"] },
    "author.role": { ops: ["=", "!"] },
    member_of_group: { ops: ["=", "!", "*", "!*"] },
    assigned_to_role: { ops: ["=", "!", "*", "!*"] },
    fixed_version_id: { ops: ["=", "!", "*", "!*", "ev", "!ev", "cf"] },
    "fixed_version.due_date": {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "nd",
        "w",
        "lw",
        "l2w",
        "nw",
        "m",
        "lm",
        "nm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "t+",
        ">t+",
        "<t+",
        "><t+",
        "*",
        "!*",
      ],
    },
    "fixed_version.status": { ops: ["=", "!"] },
    category_id: { ops: ["=", "!", "*", "!*", "ev", "!ev", "cf"] },
    parent_id: { ops: ["=", "~", "*", "!*"] },
    child_id: { ops: ["=", "~", "*", "!*"] },
    subject: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    description: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    notes: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    created_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "*",
        "!*",
      ],
    },
    updated_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "*",
        "!*",
      ],
    },
    closed_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "*",
        "!*",
      ],
    },
    start_date: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "nd",
        "w",
        "lw",
        "l2w",
        "nw",
        "m",
        "lm",
        "nm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "t+",
        ">t+",
        "<t+",
        "><t+",
        "*",
        "!*",
      ],
    },
    due_date: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "nd",
        "w",
        "lw",
        "l2w",
        "nw",
        "m",
        "lm",
        "nm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "t+",
        ">t+",
        "<t+",
        "><t+",
        "*",
        "!*",
      ],
    },
    estimated_hours: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
    spent_time: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
    done_ratio: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
    is_private: { ops: ["=", "!"] },
    attachment: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    attachment_description: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    watcher_id: { ops: ["=", "!"] },
    updated_by: { ops: ["=", "!"] },
    last_updated_by: { ops: ["=", "!"] },
    "project.status": { ops: ["=", "!"] },
    relates: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    duplicates: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    duplicated: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    blocks: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    blocked: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    precedes: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    follows: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    copied_to: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    copied_from: { ops: ["=", "!", "=p", "=!p", "!p", "*o", "!o", "*", "!*"] },
    any_searchable: { ops: ["~", "*~", "!~"] },
  },
  customFieldFilters: true,
  body: null,
  response: { kind: "list", items: "issues", paged: true },
  includes: ["attachments", "relations"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const createIssueUnderProject: Op<
  "createIssueUnderProject",
  CreateIssueUnderProjectInput,
  Promise<IssueSummary>
> = {
  id: "createIssueUnderProject",
  method: "POST",
  path: "projects/{project_id}/issues.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "issue", siblings: [] },
  response: { kind: "item", unwrap: "issue" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const addWatcher: Op<"addWatcher", AddWatcherInput, Promise<void>> = {
  id: "addWatcher",
  method: "POST",
  path: "issues/{issue_id}/watchers.json",
  pathParams: ["issue_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: null, siblings: ["user_id"] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const removeWatcher: Op<"removeWatcher", RemoveWatcherInput, Promise<void>> = {
  id: "removeWatcher",
  method: "DELETE",
  path: "issues/{issue_id}/watchers/{user_id}.json",
  pathParams: ["issue_id", "user_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "stable",
};

export const getProjects: Op<"getProjects", GetProjectsInput, Listing<ProjectSummary>> = {
  id: "getProjects",
  method: "GET",
  path: "projects.json",
  pathParams: [],
  query: { include: "csv" },
  filters: {
    status: { ops: ["=", "!"] },
    id: { ops: ["=", "!"] },
    name: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    description: { ops: ["~", "!~", "*~", "^", "$", "*", "!*"] },
    parent_id: { ops: ["=", "!", "*", "!*"] },
    is_public: { ops: ["=", "!"] },
    created_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "*",
        "!*",
      ],
    },
    updated_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "t-",
        ">t-",
        "<t-",
        "><t-",
        "*",
        "!*",
      ],
    },
  },
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "projects", paged: true },
  includes: [
    "trackers",
    "issue_categories",
    "time_entry_activities",
    "enabled_modules",
    "issue_custom_fields",
  ],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const createProject: Op<"createProject", CreateProjectInput, Promise<Project>> = {
  id: "createProject",
  method: "POST",
  path: "projects.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "project", siblings: [] },
  response: { kind: "item", unwrap: "project" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const getProject: Op<"getProject", GetProjectInput, Promise<Project>> = {
  id: "getProject",
  method: "GET",
  path: "projects/{project_id}.json",
  pathParams: ["project_id"],
  query: { include: "csv" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "project" },
  includes: [
    "trackers",
    "issue_categories",
    "time_entry_activities",
    "enabled_modules",
    "issue_custom_fields",
  ],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const updateProject: Op<"updateProject", UpdateProjectInput, Promise<void>> = {
  id: "updateProject",
  method: "PUT",
  path: "projects/{project_id}.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "project", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const deleteProject: Op<"deleteProject", DeleteProjectInput, Promise<void>> = {
  id: "deleteProject",
  method: "DELETE",
  path: "projects/{project_id}.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "stable",
};

export const archiveProject: Op<"archiveProject", ArchiveProjectInput, Promise<void>> = {
  id: "archiveProject",
  method: "PUT",
  path: "projects/{project_id}/archive.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const unarchiveProject: Op<"unarchiveProject", UnarchiveProjectInput, Promise<void>> = {
  id: "unarchiveProject",
  method: "PUT",
  path: "projects/{project_id}/unarchive.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const getMemberships: Op<"getMemberships", GetMembershipsInput, Listing<Membership>> = {
  id: "getMemberships",
  method: "GET",
  path: "projects/{project_id}/memberships.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "memberships", paged: true },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const createMembership: Op<
  "createMembership",
  CreateMembershipInput,
  Promise<Membership>
> = {
  id: "createMembership",
  method: "POST",
  path: "projects/{project_id}/memberships.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "membership", siblings: [] },
  response: { kind: "item", unwrap: "membership" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const getMembership: Op<"getMembership", GetMembershipInput, Promise<Membership>> = {
  id: "getMembership",
  method: "GET",
  path: "memberships/{membership_id}.json",
  pathParams: ["membership_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "membership" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const updateMembership: Op<"updateMembership", UpdateMembershipInput, Promise<void>> = {
  id: "updateMembership",
  method: "PUT",
  path: "memberships/{membership_id}.json",
  pathParams: ["membership_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "membership", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const deleteMembership: Op<"deleteMembership", DeleteMembershipInput, Promise<void>> = {
  id: "deleteMembership",
  method: "DELETE",
  path: "memberships/{membership_id}.json",
  pathParams: ["membership_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const closeProject: Op<"closeProject", CloseProjectInput, Promise<void>> = {
  id: "closeProject",
  method: "PUT",
  path: "projects/{project_id}/close.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const reopenProject: Op<"reopenProject", ReopenProjectInput, Promise<void>> = {
  id: "reopenProject",
  method: "PUT",
  path: "projects/{project_id}/reopen.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const getUsers: Op<"getUsers", GetUsersInput, Listing<UserSummary>> = {
  id: "getUsers",
  method: "GET",
  path: "users.json",
  pathParams: [],
  query: { include: "csv", name: "scalar", group_id: "scalar" },
  filters: {
    status: { ops: ["=", "!", "*", "!*"] },
    auth_source_id: { ops: ["=", "!", "*", "!*"] },
    twofa_scheme: { ops: ["=", "!", "*", "!*"] },
    login: { ops: ["~", "*~", "=", "!~", "!", "^", "$", "*", "!*"] },
    firstname: { ops: ["~", "*~", "=", "!~", "!", "^", "$", "*", "!*"] },
    lastname: { ops: ["~", "*~", "=", "!~", "!", "^", "$", "*", "!*"] },
    mail: { ops: ["~", "*~", "=", "!~", "!", "^", "$", "*", "!*"] },
    created_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        ">t-",
        "<t-",
        "><t-",
        "t-",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "*",
        "!*",
      ],
    },
    last_login_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        ">t-",
        "<t-",
        "><t-",
        "t-",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "*",
        "!*",
      ],
    },
    admin: { ops: ["=", "!"] },
  },
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "users", paged: true },
  includes: ["auth_source"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const createUser: Op<"createUser", CreateUserInput, Promise<User>> = {
  id: "createUser",
  method: "POST",
  path: "users.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "user", siblings: ["send_information", "pref"] },
  response: { kind: "item", unwrap: "user" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const getUser: Op<"getUser", GetUserInput, Promise<User>> = {
  id: "getUser",
  method: "GET",
  path: "users/{user_id}.json",
  pathParams: ["user_id"],
  query: { include: "csv" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "user" },
  includes: ["memberships", "groups", "auth_source"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const updateUser: Op<"updateUser", UpdateUserInput, Promise<void>> = {
  id: "updateUser",
  method: "PUT",
  path: "users/{user_id}.json",
  pathParams: ["user_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "user", siblings: ["send_information", "pref"] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const deleteUser: Op<"deleteUser", DeleteUserInput, Promise<void>> = {
  id: "deleteUser",
  method: "DELETE",
  path: "users/{user_id}.json",
  pathParams: ["user_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "stable",
};

export const getCurrentUser: Op<"getCurrentUser", GetCurrentUserInput, Promise<User>> = {
  id: "getCurrentUser",
  method: "GET",
  path: "users/current.json",
  pathParams: [],
  query: { include: "csv" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "user" },
  includes: ["memberships", "groups", "auth_source"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const getTimeEntries: Op<"getTimeEntries", GetTimeEntriesInput, Listing<TimeEntry>> = {
  id: "getTimeEntries",
  method: "GET",
  path: "time_entries.json",
  pathParams: [],
  query: { from: "scalar", to: "scalar", sort: "scalar" },
  filters: {
    user_id: { ops: ["=", "!", "*", "!*"] },
    project_id: { ops: ["=", "!"] },
    spent_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        ">t-",
        "<t-",
        "><t-",
        "t-",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "*",
        "!*",
      ],
    },
    subproject_id: { ops: ["=", "!", "*", "!*"] },
    issue_id: { ops: ["=", "~", "*", "!*"] },
    "issue.tracker_id": { ops: ["=", "!"] },
    "issue.status_id": { ops: ["=", "!"] },
    "issue.fixed_version_id": { ops: ["=", "!"] },
    "issue.parent_id": { ops: ["=", "~", "*", "!*"] },
    "issue.category_id": { ops: ["=", "!", "*", "!*"] },
    "issue.subject": { ops: ["~", "*~", "!~", "^", "$", "*", "!*"] },
    "user.group": { ops: ["=", "!", "*", "!*"] },
    "user.role": { ops: ["=", "!", "*", "!*"] },
    author_id: { ops: ["=", "!", "*", "!*"] },
    activity_id: { ops: ["=", "!"] },
    "project.status": { ops: ["=", "!"] },
    comments: { ops: ["~", "*~", "!~", "^", "$", "*", "!*"] },
    hours: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
  },
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "time_entries", paged: true },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const createTimeEntry: Op<"createTimeEntry", CreateTimeEntryInput, Promise<TimeEntry>> = {
  id: "createTimeEntry",
  method: "POST",
  path: "time_entries.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "time_entry", siblings: [] },
  response: { kind: "item", unwrap: "time_entry" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const getTimeEntry: Op<"getTimeEntry", GetTimeEntryInput, Promise<TimeEntry>> = {
  id: "getTimeEntry",
  method: "GET",
  path: "time_entries/{time_entry_id}.json",
  pathParams: ["time_entry_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "time_entry" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const updateTimeEntry: Op<"updateTimeEntry", UpdateTimeEntryInput, Promise<void>> = {
  id: "updateTimeEntry",
  method: "PUT",
  path: "time_entries/{time_entry_id}.json",
  pathParams: ["time_entry_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "time_entry", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const deleteTimeEntry: Op<"deleteTimeEntry", DeleteTimeEntryInput, Promise<void>> = {
  id: "deleteTimeEntry",
  method: "DELETE",
  path: "time_entries/{time_entry_id}.json",
  pathParams: ["time_entry_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "stable",
};

export const getTimeEntriesByProject: Op<
  "getTimeEntriesByProject",
  GetTimeEntriesByProjectInput,
  Listing<TimeEntry>
> = {
  id: "getTimeEntriesByProject",
  method: "GET",
  path: "projects/{project_id}/time_entries.json",
  pathParams: ["project_id"],
  query: { from: "scalar", to: "scalar", sort: "scalar" },
  filters: {
    user_id: { ops: ["=", "!", "*", "!*"] },
    spent_on: {
      ops: [
        "=",
        ">=",
        "<=",
        "><",
        ">t-",
        "<t-",
        "><t-",
        "t-",
        "t",
        "ld",
        "w",
        "lw",
        "l2w",
        "m",
        "lm",
        "y",
        "*",
        "!*",
      ],
    },
    subproject_id: { ops: ["=", "!", "*", "!*"] },
    issue_id: { ops: ["=", "~", "*", "!*"] },
    "issue.tracker_id": { ops: ["=", "!"] },
    "issue.status_id": { ops: ["=", "!"] },
    "issue.fixed_version_id": { ops: ["=", "!"] },
    "issue.parent_id": { ops: ["=", "~", "*", "!*"] },
    "issue.category_id": { ops: ["=", "!", "*", "!*"] },
    "issue.subject": { ops: ["~", "*~", "!~", "^", "$", "*", "!*"] },
    "user.group": { ops: ["=", "!", "*", "!*"] },
    "user.role": { ops: ["=", "!", "*", "!*"] },
    author_id: { ops: ["=", "!", "*", "!*"] },
    activity_id: { ops: ["=", "!"] },
    "project.status": { ops: ["=", "!"] },
    comments: { ops: ["~", "*~", "!~", "^", "$", "*", "!*"] },
    hours: { ops: ["=", ">=", "<=", "><", "*", "!*"] },
  },
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "time_entries", paged: true },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const createTimeEntryUnderProject: Op<
  "createTimeEntryUnderProject",
  CreateTimeEntryUnderProjectInput,
  Promise<TimeEntry>
> = {
  id: "createTimeEntryUnderProject",
  method: "POST",
  path: "projects/{project_id}/time_entries.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "time_entry", siblings: [] },
  response: { kind: "item", unwrap: "time_entry" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const createTimeEntryUnderIssue: Op<
  "createTimeEntryUnderIssue",
  CreateTimeEntryUnderIssueInput,
  Promise<TimeEntry>
> = {
  id: "createTimeEntryUnderIssue",
  method: "POST",
  path: "issues/{issue_id}/time_entries.json",
  pathParams: ["issue_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "time_entry", siblings: [] },
  response: { kind: "item", unwrap: "time_entry" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const getNewsList: Op<"getNewsList", GetNewsListInput, Listing<News>> = {
  id: "getNewsList",
  method: "GET",
  path: "news.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "news", paged: true },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const getNews: Op<"getNews", GetNewsInput, Promise<News>> = {
  id: "getNews",
  method: "GET",
  path: "news/{news_id}.json",
  pathParams: ["news_id"],
  query: { include: "csv" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "news" },
  includes: ["attachments", "comments"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const updateNews: Op<"updateNews", UpdateNewsInput, Promise<void>> = {
  id: "updateNews",
  method: "PUT",
  path: "news/{news_id}.json",
  pathParams: ["news_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "news", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const deleteNews: Op<"deleteNews", DeleteNewsInput, Promise<void>> = {
  id: "deleteNews",
  method: "DELETE",
  path: "news/{news_id}.json",
  pathParams: ["news_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "stable",
};

export const getNewsListByProject: Op<
  "getNewsListByProject",
  GetNewsListByProjectInput,
  Listing<News>
> = {
  id: "getNewsListByProject",
  method: "GET",
  path: "projects/{project_id}/news.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "news", paged: true },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
};

export const createNews: Op<"createNews", CreateNewsInput, Promise<void>> = {
  id: "createNews",
  method: "POST",
  path: "projects/{project_id}/news.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "news", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "stable",
};

export const getIssueRelations: Op<
  "getIssueRelations",
  GetIssueRelationsInput,
  Listing<IssueRelation>
> = {
  id: "getIssueRelations",
  method: "GET",
  path: "issues/{issue_id}/relations.json",
  pathParams: ["issue_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "relations", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const createIssueRelation: Op<
  "createIssueRelation",
  CreateIssueRelationInput,
  Promise<IssueRelation>
> = {
  id: "createIssueRelation",
  method: "POST",
  path: "issues/{issue_id}/relations.json",
  pathParams: ["issue_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "relation", siblings: [] },
  response: { kind: "item", unwrap: "relation" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const getIssueRelation: Op<
  "getIssueRelation",
  GetIssueRelationInput,
  Promise<IssueRelation>
> = {
  id: "getIssueRelation",
  method: "GET",
  path: "relations/{issue_relation_id}.json",
  pathParams: ["issue_relation_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "relation" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const deleteIssueRelation: Op<
  "deleteIssueRelation",
  DeleteIssueRelationInput,
  Promise<void>
> = {
  id: "deleteIssueRelation",
  method: "DELETE",
  path: "relations/{issue_relation_id}.json",
  pathParams: ["issue_relation_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const getVersionsByProject: Op<
  "getVersionsByProject",
  GetVersionsByProjectInput,
  Listing<VersionSummary>
> = {
  id: "getVersionsByProject",
  method: "GET",
  path: "projects/{project_id}/versions.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "versions", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const createVersion: Op<"createVersion", CreateVersionInput, Promise<Version>> = {
  id: "createVersion",
  method: "POST",
  path: "projects/{project_id}/versions.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "version", siblings: [] },
  response: { kind: "item", unwrap: "version" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const getVersion: Op<"getVersion", GetVersionInput, Promise<Version>> = {
  id: "getVersion",
  method: "GET",
  path: "versions/{version_id}.json",
  pathParams: ["version_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "version" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const updateVersion: Op<"updateVersion", UpdateVersionInput, Promise<void>> = {
  id: "updateVersion",
  method: "PUT",
  path: "versions/{version_id}.json",
  pathParams: ["version_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "version", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const deleteVersion: Op<"deleteVersion", DeleteVersionInput, Promise<void>> = {
  id: "deleteVersion",
  method: "DELETE",
  path: "versions/{version_id}.json",
  pathParams: ["version_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const getWikiPages: Op<"getWikiPages", GetWikiPagesInput, Listing<WikiPageSummary>> = {
  id: "getWikiPages",
  method: "GET",
  path: "projects/{project_id}/wiki/index.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "wiki_pages", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getWikiPage: Op<"getWikiPage", GetWikiPageInput, Promise<WikiPage>> = {
  id: "getWikiPage",
  method: "GET",
  path: "projects/{project_id}/wiki/{wiki_page_title}.json",
  pathParams: ["project_id", "wiki_page_title"],
  query: { include: "csv" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "wiki_page" },
  includes: ["attachments"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const updateWikiPage: Op<
  "updateWikiPage",
  UpdateWikiPageInput,
  Promise<WikiPage | undefined>
> = {
  id: "updateWikiPage",
  method: "PUT",
  path: "projects/{project_id}/wiki/{wiki_page_title}.json",
  pathParams: ["project_id", "wiki_page_title"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "wiki_page", siblings: [] },
  response: { kind: "item", unwrap: "wiki_page" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const deleteWikiPage: Op<"deleteWikiPage", DeleteWikiPageInput, Promise<void>> = {
  id: "deleteWikiPage",
  method: "DELETE",
  path: "projects/{project_id}/wiki/{wiki_page_title}.json",
  pathParams: ["project_id", "wiki_page_title"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const getWikiPageByVersion: Op<
  "getWikiPageByVersion",
  GetWikiPageByVersionInput,
  Promise<WikiPage>
> = {
  id: "getWikiPageByVersion",
  method: "GET",
  path: "projects/{project_id}/wiki/{wiki_page_title}/{version_id}.json",
  pathParams: ["project_id", "wiki_page_title", "version_id"],
  query: { include: "csv" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "wiki_page" },
  includes: ["attachments"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getQueries: Op<"getQueries", GetQueriesInput, Listing<Query>> = {
  id: "getQueries",
  method: "GET",
  path: "queries.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "queries", paged: true },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getAttachment: Op<"getAttachment", GetAttachmentInput, Promise<Attachment>> = {
  id: "getAttachment",
  method: "GET",
  path: "attachments/{attachment_id}.json",
  pathParams: ["attachment_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "attachment" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const updateAttachment: Op<"updateAttachment", UpdateAttachmentInput, Promise<void>> = {
  id: "updateAttachment",
  method: "PATCH",
  path: "attachments/{attachment_id}.json",
  pathParams: ["attachment_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "attachment", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const deleteAttachment: Op<"deleteAttachment", DeleteAttachmentInput, Promise<void>> = {
  id: "deleteAttachment",
  method: "DELETE",
  path: "attachments/{attachment_id}.json",
  pathParams: ["attachment_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const downloadAttachmentFile: Op<
  "downloadAttachmentFile",
  DownloadAttachmentFileInput,
  Promise<Download>
> = {
  id: "downloadAttachmentFile",
  method: "GET",
  path: "attachments/download/{attachment_id}/{filename}",
  pathParams: ["attachment_id", "filename"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "binary" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const downloadThumbnail: Op<
  "downloadThumbnail",
  DownloadThumbnailInput,
  Promise<Download>
> = {
  id: "downloadThumbnail",
  method: "GET",
  path: "attachments/thumbnail/{attachment_id}",
  pathParams: ["attachment_id"],
  query: { size: "scalar" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "binary" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getIssueStatuses: Op<
  "getIssueStatuses",
  GetIssueStatusesInput,
  Listing<IssueStatus>
> = {
  id: "getIssueStatuses",
  method: "GET",
  path: "issue_statuses.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "issue_statuses", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getTrackers: Op<"getTrackers", GetTrackersInput, Listing<Tracker>> = {
  id: "getTrackers",
  method: "GET",
  path: "trackers.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "trackers", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getIssueCategories: Op<
  "getIssueCategories",
  GetIssueCategoriesInput,
  Listing<IssueCategory>
> = {
  id: "getIssueCategories",
  method: "GET",
  path: "projects/{project_id}/issue_categories.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "issue_categories", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const createIssueCategory: Op<
  "createIssueCategory",
  CreateIssueCategoryInput,
  Promise<IssueCategory>
> = {
  id: "createIssueCategory",
  method: "POST",
  path: "projects/{project_id}/issue_categories.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "issue_category", siblings: [] },
  response: { kind: "item", unwrap: "issue_category" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const getIssuePriorities: Op<
  "getIssuePriorities",
  GetIssuePrioritiesInput,
  Listing<IssuePriority>
> = {
  id: "getIssuePriorities",
  method: "GET",
  path: "enumerations/issue_priorities.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "issue_priorities", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getTimeEntryActivities: Op<
  "getTimeEntryActivities",
  GetTimeEntryActivitiesInput,
  Listing<TimeEntryActivity>
> = {
  id: "getTimeEntryActivities",
  method: "GET",
  path: "enumerations/time_entry_activities.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "time_entry_activities", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getDocumentCategories: Op<
  "getDocumentCategories",
  GetDocumentCategoriesInput,
  Listing<DocumentCategory>
> = {
  id: "getDocumentCategories",
  method: "GET",
  path: "enumerations/document_categories.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "document_categories", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getIssueCategory: Op<
  "getIssueCategory",
  GetIssueCategoryInput,
  Promise<IssueCategory>
> = {
  id: "getIssueCategory",
  method: "GET",
  path: "issue_categories/{issue_category_id}.json",
  pathParams: ["issue_category_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "issue_category" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const updateIssueCategory: Op<
  "updateIssueCategory",
  UpdateIssueCategoryInput,
  Promise<void>
> = {
  id: "updateIssueCategory",
  method: "PUT",
  path: "issue_categories/{issue_category_id}.json",
  pathParams: ["issue_category_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "issue_category", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const deleteIssueCategory: Op<
  "deleteIssueCategory",
  DeleteIssueCategoryInput,
  Promise<void>
> = {
  id: "deleteIssueCategory",
  method: "DELETE",
  path: "issue_categories/{issue_category_id}.json",
  pathParams: ["issue_category_id"],
  query: { reassign_to_id: "scalar" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const getRoles: Op<"getRoles", GetRolesInput, Listing<IdName>> = {
  id: "getRoles",
  method: "GET",
  path: "roles.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "roles", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getRole: Op<"getRole", GetRoleInput, Promise<Role>> = {
  id: "getRole",
  method: "GET",
  path: "roles/{role_id}.json",
  pathParams: ["role_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "role" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getGroups: Op<"getGroups", GetGroupsInput, Listing<GroupSummary>> = {
  id: "getGroups",
  method: "GET",
  path: "groups.json",
  pathParams: [],
  query: { builtin: "scalar" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "groups", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const createGroup: Op<"createGroup", CreateGroupInput, Promise<Group>> = {
  id: "createGroup",
  method: "POST",
  path: "groups.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "group", siblings: [] },
  response: { kind: "item", unwrap: "group" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const getGroup: Op<"getGroup", GetGroupInput, Promise<Group>> = {
  id: "getGroup",
  method: "GET",
  path: "groups/{group_id}.json",
  pathParams: ["group_id"],
  query: { include: "csv" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "group" },
  includes: ["users", "memberships"],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const updateGroup: Op<"updateGroup", UpdateGroupInput, Promise<void>> = {
  id: "updateGroup",
  method: "PUT",
  path: "groups/{group_id}.json",
  pathParams: ["group_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "group", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const deleteGroup: Op<"deleteGroup", DeleteGroupInput, Promise<void>> = {
  id: "deleteGroup",
  method: "DELETE",
  path: "groups/{group_id}.json",
  pathParams: ["group_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const addUserToGroup: Op<"addUserToGroup", AddUserToGroupInput, Promise<void>> = {
  id: "addUserToGroup",
  method: "POST",
  path: "groups/{group_id}/users.json",
  pathParams: ["group_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: null, siblings: ["user_id"] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const removeUsersFromGroup: Op<
  "removeUsersFromGroup",
  RemoveUsersFromGroupInput,
  Promise<void>
> = {
  id: "removeUsersFromGroup",
  method: "DELETE",
  path: "groups/{group_id}/users.json",
  pathParams: ["group_id"],
  query: { user_ids: "brackets" },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "7.0",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const removeUserFromGroup: Op<
  "removeUserFromGroup",
  RemoveUserFromGroupInput,
  Promise<void>
> = {
  id: "removeUserFromGroup",
  method: "DELETE",
  path: "groups/{group_id}/users/{user_id}.json",
  pathParams: ["group_id", "user_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const getCustomFields: Op<"getCustomFields", GetCustomFieldsInput, Listing<CustomField>> = {
  id: "getCustomFields",
  method: "GET",
  path: "custom_fields.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "custom_fields", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getSearch: Op<"getSearch", GetSearchInput, Listing<Search>> = {
  id: "getSearch",
  method: "GET",
  path: "search.json",
  pathParams: [],
  query: {
    q: "scalar",
    scope: "scalar",
    all_words: "scalar",
    titles_only: "scalar",
    issues: "scalar",
    news: "scalar",
    wiki_pages: "scalar",
    projects: "scalar",
    documents: "scalar",
    changesets: "scalar",
    messages: "scalar",
    open_issues: "scalar",
    attachments: "scalar",
  },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "results", paged: true },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getSearchByProject: Op<
  "getSearchByProject",
  GetSearchByProjectInput,
  Listing<Search>
> = {
  id: "getSearchByProject",
  method: "GET",
  path: "projects/{project_id}/search.json",
  pathParams: ["project_id"],
  query: {
    q: "scalar",
    scope: "scalar",
    all_words: "scalar",
    titles_only: "scalar",
    issues: "scalar",
    news: "scalar",
    wiki_pages: "scalar",
    documents: "scalar",
    changesets: "scalar",
    messages: "scalar",
    open_issues: "scalar",
    attachments: "scalar",
  },
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "results", paged: true },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const getFiles: Op<"getFiles", GetFilesInput, Listing<File>> = {
  id: "getFiles",
  method: "GET",
  path: "projects/{project_id}/files.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "list", items: "files", paged: false },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const createFile: Op<"createFile", CreateFileInput, Promise<void>> = {
  id: "createFile",
  method: "POST",
  path: "projects/{project_id}/files.json",
  pathParams: ["project_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "file", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const getMyAccount: Op<"getMyAccount", GetMyAccountInput, Promise<MyAccount>> = {
  id: "getMyAccount",
  method: "GET",
  path: "my/account.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "item", unwrap: "user" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "alpha",
};

export const updateMyAccount: Op<"updateMyAccount", UpdateMyAccountInput, Promise<void>> = {
  id: "updateMyAccount",
  method: "PUT",
  path: "my/account.json",
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "user", siblings: ["pref"] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const updateJournal: Op<"updateJournal", UpdateJournalInput, Promise<void>> = {
  id: "updateJournal",
  method: "PUT",
  path: "journals/{journal_id}.json",
  pathParams: ["journal_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: "journal", siblings: [] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const uploadAttachmentFile: Op<
  "uploadAttachmentFile",
  UploadAttachmentFileInput,
  Promise<{
    id: number;
    token: string;
  }>
> = {
  id: "uploadAttachmentFile",
  method: "POST",
  path: "uploads.json",
  pathParams: [],
  query: { filename: "scalar", content_type: "scalar" },
  filters: {},
  customFieldFilters: false,
  body: { kind: "binary", key: "file" },
  response: { kind: "item", unwrap: "upload" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const addRelatedIssue: Op<"addRelatedIssue", AddRelatedIssueInput, Promise<void>> = {
  id: "addRelatedIssue",
  method: "POST",
  path: "projects/{project_id}/repository/{repository_id}/revisions/{revision}/issues.json",
  pathParams: ["project_id", "repository_id", "revision"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: { kind: "json", envelope: null, siblings: ["issue_id"] },
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "write",
  stability: "alpha",
};

export const removeRelatedIssue: Op<
  "removeRelatedIssue",
  RemoveRelatedIssueInput,
  Promise<void>
> = {
  id: "removeRelatedIssue",
  method: "DELETE",
  path: "projects/{project_id}/repository/{repository_id}/revisions/{revision}/issues/{issue_id}.json",
  pathParams: ["project_id", "repository_id", "revision", "issue_id"],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  response: { kind: "empty" },
  includes: [],
  since: "6.1",
  until: null,
  safety: "idempotent",
  stability: "alpha",
};

export const ops: {
  readonly getIssues: typeof getIssues;
  readonly createIssue: typeof createIssue;
  readonly getIssue: typeof getIssue;
  readonly updateIssue: typeof updateIssue;
  readonly deleteIssue: typeof deleteIssue;
  readonly getIssuesByProject: typeof getIssuesByProject;
  readonly createIssueUnderProject: typeof createIssueUnderProject;
  readonly addWatcher: typeof addWatcher;
  readonly removeWatcher: typeof removeWatcher;
  readonly getProjects: typeof getProjects;
  readonly createProject: typeof createProject;
  readonly getProject: typeof getProject;
  readonly updateProject: typeof updateProject;
  readonly deleteProject: typeof deleteProject;
  readonly archiveProject: typeof archiveProject;
  readonly unarchiveProject: typeof unarchiveProject;
  readonly getMemberships: typeof getMemberships;
  readonly createMembership: typeof createMembership;
  readonly getMembership: typeof getMembership;
  readonly updateMembership: typeof updateMembership;
  readonly deleteMembership: typeof deleteMembership;
  readonly closeProject: typeof closeProject;
  readonly reopenProject: typeof reopenProject;
  readonly getUsers: typeof getUsers;
  readonly createUser: typeof createUser;
  readonly getUser: typeof getUser;
  readonly updateUser: typeof updateUser;
  readonly deleteUser: typeof deleteUser;
  readonly getCurrentUser: typeof getCurrentUser;
  readonly getTimeEntries: typeof getTimeEntries;
  readonly createTimeEntry: typeof createTimeEntry;
  readonly getTimeEntry: typeof getTimeEntry;
  readonly updateTimeEntry: typeof updateTimeEntry;
  readonly deleteTimeEntry: typeof deleteTimeEntry;
  readonly getTimeEntriesByProject: typeof getTimeEntriesByProject;
  readonly createTimeEntryUnderProject: typeof createTimeEntryUnderProject;
  readonly createTimeEntryUnderIssue: typeof createTimeEntryUnderIssue;
  readonly getNewsList: typeof getNewsList;
  readonly getNews: typeof getNews;
  readonly updateNews: typeof updateNews;
  readonly deleteNews: typeof deleteNews;
  readonly getNewsListByProject: typeof getNewsListByProject;
  readonly createNews: typeof createNews;
  readonly getIssueRelations: typeof getIssueRelations;
  readonly createIssueRelation: typeof createIssueRelation;
  readonly getIssueRelation: typeof getIssueRelation;
  readonly deleteIssueRelation: typeof deleteIssueRelation;
  readonly getVersionsByProject: typeof getVersionsByProject;
  readonly createVersion: typeof createVersion;
  readonly getVersion: typeof getVersion;
  readonly updateVersion: typeof updateVersion;
  readonly deleteVersion: typeof deleteVersion;
  readonly getWikiPages: typeof getWikiPages;
  readonly getWikiPage: typeof getWikiPage;
  readonly updateWikiPage: typeof updateWikiPage;
  readonly deleteWikiPage: typeof deleteWikiPage;
  readonly getWikiPageByVersion: typeof getWikiPageByVersion;
  readonly getQueries: typeof getQueries;
  readonly getAttachment: typeof getAttachment;
  readonly updateAttachment: typeof updateAttachment;
  readonly deleteAttachment: typeof deleteAttachment;
  readonly downloadAttachmentFile: typeof downloadAttachmentFile;
  readonly downloadThumbnail: typeof downloadThumbnail;
  readonly getIssueStatuses: typeof getIssueStatuses;
  readonly getTrackers: typeof getTrackers;
  readonly getIssueCategories: typeof getIssueCategories;
  readonly createIssueCategory: typeof createIssueCategory;
  readonly getIssuePriorities: typeof getIssuePriorities;
  readonly getTimeEntryActivities: typeof getTimeEntryActivities;
  readonly getDocumentCategories: typeof getDocumentCategories;
  readonly getIssueCategory: typeof getIssueCategory;
  readonly updateIssueCategory: typeof updateIssueCategory;
  readonly deleteIssueCategory: typeof deleteIssueCategory;
  readonly getRoles: typeof getRoles;
  readonly getRole: typeof getRole;
  readonly getGroups: typeof getGroups;
  readonly createGroup: typeof createGroup;
  readonly getGroup: typeof getGroup;
  readonly updateGroup: typeof updateGroup;
  readonly deleteGroup: typeof deleteGroup;
  readonly addUserToGroup: typeof addUserToGroup;
  readonly removeUsersFromGroup: typeof removeUsersFromGroup;
  readonly removeUserFromGroup: typeof removeUserFromGroup;
  readonly getCustomFields: typeof getCustomFields;
  readonly getSearch: typeof getSearch;
  readonly getSearchByProject: typeof getSearchByProject;
  readonly getFiles: typeof getFiles;
  readonly createFile: typeof createFile;
  readonly getMyAccount: typeof getMyAccount;
  readonly updateMyAccount: typeof updateMyAccount;
  readonly updateJournal: typeof updateJournal;
  readonly uploadAttachmentFile: typeof uploadAttachmentFile;
  readonly addRelatedIssue: typeof addRelatedIssue;
  readonly removeRelatedIssue: typeof removeRelatedIssue;
} = {
  getIssues,
  createIssue,
  getIssue,
  updateIssue,
  deleteIssue,
  getIssuesByProject,
  createIssueUnderProject,
  addWatcher,
  removeWatcher,
  getProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,
  getMemberships,
  createMembership,
  getMembership,
  updateMembership,
  deleteMembership,
  closeProject,
  reopenProject,
  getUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  getCurrentUser,
  getTimeEntries,
  createTimeEntry,
  getTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getTimeEntriesByProject,
  createTimeEntryUnderProject,
  createTimeEntryUnderIssue,
  getNewsList,
  getNews,
  updateNews,
  deleteNews,
  getNewsListByProject,
  createNews,
  getIssueRelations,
  createIssueRelation,
  getIssueRelation,
  deleteIssueRelation,
  getVersionsByProject,
  createVersion,
  getVersion,
  updateVersion,
  deleteVersion,
  getWikiPages,
  getWikiPage,
  updateWikiPage,
  deleteWikiPage,
  getWikiPageByVersion,
  getQueries,
  getAttachment,
  updateAttachment,
  deleteAttachment,
  downloadAttachmentFile,
  downloadThumbnail,
  getIssueStatuses,
  getTrackers,
  getIssueCategories,
  createIssueCategory,
  getIssuePriorities,
  getTimeEntryActivities,
  getDocumentCategories,
  getIssueCategory,
  updateIssueCategory,
  deleteIssueCategory,
  getRoles,
  getRole,
  getGroups,
  createGroup,
  getGroup,
  updateGroup,
  deleteGroup,
  addUserToGroup,
  removeUsersFromGroup,
  removeUserFromGroup,
  getCustomFields,
  getSearch,
  getSearchByProject,
  getFiles,
  createFile,
  getMyAccount,
  updateMyAccount,
  updateJournal,
  uploadAttachmentFile,
  addRelatedIssue,
  removeRelatedIssue,
};
