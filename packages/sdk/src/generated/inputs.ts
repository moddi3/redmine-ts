// Generated from spec/redmine-openapi/*.yaml by `vp run gen`. Do not edit.

import type { UploadEntry } from "../core/files.ts";
import type { Cond, ListInput } from "../core/listing.ts";
import type { CustomFieldValues, CustomFields, Pref } from "./schemas.ts";

export type GetIssuesInclude = "attachments" | "relations";

export interface GetIssuesWhere {
  /**
   * Filter by issue ID.
   * Format: `[operator]value`
   * Operators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)
   * For equality, separate multiple IDs with commas. A pipe separates range bounds, not IDs in an equality list.
   * Examples: `1`, `1,2`, `>=100`, `><1|100`
   */
  issue_id?: Cond<string | number, "range" | "presence">;
  /**
   * Filter by project. One id or identifier also matches subprojects by default; two or more ids do not, and {not: id} excludes only that project. An identifier works only alone.
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
  /**
   * ID of the assignee. If omitted or null, Redmine uses the first assignable default assignee, checking the category before the project.
   * Default assignees that cannot be assigned (e.g. locked users) are skipped.
   */
  assigned_to_id?: number | null;
  parent_issue_id?: number | null;
  custom_fields?: CustomFields;
  custom_field_values?: CustomFieldValues;
  watcher_user_ids?: number[];
  is_private?: boolean;
  estimated_hours?: number | null;
  /**
   * Files to attach, in order. An entry is an UploadRef from `attachments.upload`, or
   * `{ file, filename, content_type?, description? }`, which the call uploads first, one file at a time.
   * After a failure, `RedmineError.uploads` holds the entries to retry with.
   */
  uploads?: UploadEntry[];
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
   * Values: `children` (child issues and their descendants, limited to issues visible to the current user), `attachments` (file attachments), `relations` (issue relations), `changesets` (associated VCS changesets), `journals` (change history and notes), `watchers` (users watching the issue), `allowed_statuses` (status transitions available for the current user)
   * The `children` field is omitted for leaf issues. For non-leaf issues, it may be empty when none of their children are visible.
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
  /**
   * Files to attach, in order. An entry is an UploadRef from `attachments.upload`, or
   * `{ file, filename, content_type?, description? }`, which the call uploads first, one file at a time.
   * After a failure, `RedmineError.uploads` holds the entries to retry with.
   */
  uploads?: UploadEntry[];
}

export interface DeleteIssueInput {
  issue_id: number;
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
   * Values: `memberships` (project memberships with roles, limited to projects visible to the current user), `groups` (groups the user belongs to), `auth_source` (authentication source information)
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
   * Values: `memberships` (project memberships with roles, limited to projects visible to the current user), `groups` (groups the user belongs to), `auth_source` (authentication source information)
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
   * Filter by project. One id or identifier also matches subprojects by default; two or more ids do not, and {not: id} excludes only that project. An identifier works only alone.
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
  /**
   * Files to attach, in order. An entry is an UploadRef from `attachments.upload`, or
   * `{ file, filename, content_type?, description? }`, which the call uploads first, one file at a time.
   * After a failure, `RedmineError.uploads` holds the entries to retry with.
   */
  uploads?: UploadEntry[];
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
  /**
   * Files to attach, in order. An entry is an UploadRef from `attachments.upload`, or
   * `{ file, filename, content_type?, description? }`, which the call uploads first, one file at a time.
   * After a failure, `RedmineError.uploads` holds the entries to retry with.
   */
  uploads?: UploadEntry[];
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
  /**
   * Files to attach, in order. An entry is an UploadRef from `attachments.upload`, or
   * `{ file, filename, content_type?, description? }`, which the call uploads first, one file at a time.
   * After a failure, `RedmineError.uploads` holds the entries to retry with.
   */
  uploads?: UploadEntry[];
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
   * Values: `users` (list of users in the group), `memberships` (project memberships with roles, limited to projects visible to the current user)
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
