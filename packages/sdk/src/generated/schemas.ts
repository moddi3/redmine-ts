// Generated from spec/redmine-openapi/*.yaml by `vp run gen`. Do not edit.

export interface IdName {
  id: number;
  name: string;
}

export interface IssueStatusSummary {
  id: number;
  name: string;
  is_closed: boolean;
}

export interface CustomFieldValue {
  id: number;
  name: string;
  multiple?: boolean;
  value: string | null | string[];
}

export interface Attachment {
  id: number;
  filename: string;
  filesize: number;
  content_type: string | null;
  description: string | null;
  content_url: string;
  thumbnail_url?: string;
  author: IdName;
  created_on: string;
}

export interface IssueRelation {
  id: number;
  issue_id: number;
  issue_to_id: number;
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
  delay: number | null;
}

export interface IssueSummary {
  id: number;
  project: IdName;
  tracker: IdName;
  status: IssueStatusSummary;
  priority: IdName;
  author: IdName;
  assigned_to?: IdName;
  category?: IdName;
  fixed_version?: IdName;
  parent?: {
    id: number;
  };
  subject: string;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  done_ratio: number;
  is_private: boolean;
  estimated_hours: number | null;
  total_estimated_hours: number | null;
  spent_hours?: number;
  total_spent_hours?: number;
  custom_fields?: CustomFieldValue[];
  created_on: string;
  updated_on: string;
  closed_on: string | null;
  attachments?: Attachment[];
  relations?: IssueRelation[];
}

export type CustomFields = {
  id: number;
  value?: string | null | string[];
}[];

export type CustomFieldValues = Record<string, string | null | string[]>;

export type Uploads = {
  token?: string;
  filename?: string;
  description?: string;
  content_type?: string;
}[];

export interface IssueChild {
  id: number;
  tracker: IdName;
  subject: string;
  children?: IssueChild[];
}

export interface Issue {
  id: number;
  project: IdName;
  tracker: IdName;
  status: IssueStatusSummary;
  priority: IdName;
  author: IdName;
  assigned_to?: IdName;
  category?: IdName;
  fixed_version?: IdName;
  parent?: {
    id: number;
  };
  subject: string;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  done_ratio: number;
  is_private: boolean;
  estimated_hours: number | null;
  total_estimated_hours: number | null;
  spent_hours?: number;
  total_spent_hours?: number;
  custom_fields?: CustomFieldValue[];
  created_on: string;
  updated_on: string;
  closed_on: string | null;
  changesets?: {
    revision: string;
    user?: IdName;
    comments: string;
    committed_on: string;
  }[];
  children?: IssueChild[];
  attachments?: Attachment[];
  relations?: IssueRelation[];
  journals?: {
    id: number;
    user?: IdName;
    notes: string;
    created_on: string;
    updated_on: string;
    updated_by?: IdName;
    private_notes: boolean;
    details: {
      property: string;
      name: string;
      old_value: string | null;
      new_value: string | null;
    }[];
  }[];
  watchers?: IdName[];
  allowed_statuses?: IssueStatusSummary[];
}

export interface ProjectSummary {
  id: number;
  name: string;
  identifier: string;
  description: string | null;
  homepage: string | null;
  parent?: IdName;
  status: number;
  is_public: boolean;
  inherit_members: boolean;
  custom_fields?: CustomFieldValue[];
  trackers?: IdName[];
  issue_categories?: IdName[];
  time_entry_activities?: IdName[];
  enabled_modules?: IdName[];
  issue_custom_fields?: IdName[];
  created_on: string;
  updated_on: string;
}

export interface Project {
  id: number;
  name: string;
  identifier: string;
  description: string | null;
  homepage: string | null;
  parent?: IdName;
  status: number;
  is_public: boolean;
  inherit_members: boolean;
  default_version?: IdName;
  default_assignee?: IdName;
  custom_fields?: CustomFieldValue[];
  trackers?: IdName[];
  issue_categories?: IdName[];
  time_entry_activities?: IdName[];
  enabled_modules?: IdName[];
  issue_custom_fields?: IdName[];
  created_on: string;
  updated_on: string;
}

/**
 * @stability alpha
 */
export interface MembershipRole {
  id: number;
  name: string;
  inherited?: boolean;
}

/**
 * @stability alpha
 */
export interface Membership {
  id: number;
  project: IdName;
  user?: IdName;
  group?: IdName;
  roles: MembershipRole[];
}

export interface UserSummary {
  id: number;
  login: string;
  admin: boolean;
  firstname: string;
  lastname: string;
  mail: string;
  created_on: string;
  updated_on: string;
  last_login_on: string | null;
  passwd_changed_on: string | null;
  avatar_url?: string;
  twofa_scheme: string | null;
  status: number;
  auth_source?: IdName;
  custom_fields?: CustomFieldValue[];
}

export interface Pref {
  hide_mail?: boolean;
  time_zone?: string | null;
  comments_sorting?: "asc" | "desc";
  warn_on_leaving_unsaved?: boolean;
  no_self_notified?: boolean;
  notify_about_high_priority_issues?: boolean;
  textarea_font?: "monospace" | "proportional" | null;
  recently_used_projects?: number;
  history_default_tab?:
    | "notes"
    | "history"
    | "properties"
    | "time_entries"
    | "changesets"
    | "last_tab_visited";
  toolbar_language_options?: string;
  default_issue_query?: number | null;
  default_project_query?: number | null;
  auto_watch_on?: ("issue_created" | "issue_contributed_to")[];
}

export interface User {
  id: number;
  login: string;
  admin?: boolean;
  firstname: string;
  lastname: string;
  mail?: string;
  created_on: string;
  updated_on: string;
  last_login_on: string | null;
  passwd_changed_on: string | null;
  avatar_url?: string;
  twofa_scheme?: string | null;
  api_key?: string;
  status?: number;
  custom_fields?: CustomFieldValue[];
  auth_source?: IdName;
  groups?: IdName[];
  /**
   * Project memberships visible to the current user. Memberships in archived projects are excluded.
   */
  memberships?: {
    id: number;
    project: IdName;
    roles: {
      id: number;
      name: string;
      inherited?: boolean;
    }[];
  }[];
}

export interface TimeEntry {
  id: number;
  project: IdName;
  issue?: {
    id: number;
  };
  user: IdName;
  activity: IdName;
  hours: number;
  comments: string | null;
  spent_on: string;
  created_on: string;
  updated_on: string;
  custom_fields?: CustomFieldValue[];
}

export interface NewsComment {
  id: number;
  author: IdName;
  content: string;
}

export interface News {
  id: number;
  project: IdName;
  author?: IdName;
  title: string;
  summary?: string;
  description: string;
  created_on: string;
  attachments?: Attachment[];
  comments?: NewsComment[];
}

/**
 * @stability alpha
 */
export interface VersionSummary {
  id: number;
  project: IdName;
  name: string;
  description: string | null;
  status: "open" | "locked" | "closed";
  due_date: string | null;
  sharing: "none" | "descendants" | "hierarchy" | "tree" | "system";
  wiki_page_title: string | null;
  custom_fields?: CustomFieldValue[];
  created_on: string;
  updated_on: string;
}

/**
 * @stability alpha
 */
export interface Version {
  id: number;
  project: IdName;
  name: string;
  description: string | null;
  status: "open" | "locked" | "closed";
  due_date: string | null;
  sharing: "none" | "descendants" | "hierarchy" | "tree" | "system";
  wiki_page_title: string | null;
  estimated_hours?: number;
  spent_hours?: number;
  custom_fields?: CustomFieldValue[];
  created_on: string;
  updated_on: string;
}

/**
 * @stability alpha
 */
export interface WikiPageSummary {
  title: string;
  parent?: {
    title: string;
  };
  version: number;
  /**
   * @since 7.0
   */
  project?: IdName;
  created_on: string;
  updated_on: string;
}

/**
 * @stability alpha
 */
export interface WikiPage {
  title: string;
  parent?: {
    title: string;
  };
  text: string;
  version: number;
  author?: IdName;
  comments: string | null;
  project?: IdName;
  created_on: string;
  updated_on: string;
  attachments?: Attachment[];
}

/**
 * @stability alpha
 */
export interface Query {
  id: number;
  name: string;
  is_public: boolean;
  project_id: number | null;
}

/**
 * @stability alpha
 */
export interface IssueStatus {
  id: number;
  name: string;
  is_closed: boolean;
  description: string | null;
}

/**
 * @stability alpha
 */
export interface Tracker {
  id: number;
  name: string;
  default_status: IdName;
  description: string | null;
  enabled_standard_fields: string[];
}

/**
 * @stability alpha
 */
export interface IssueCategory {
  id: number;
  project: IdName;
  name: string;
  assigned_to?: IdName;
}

/**
 * @stability alpha
 */
export interface IssuePriority {
  id: number;
  name: string;
  is_default: boolean;
  active: boolean;
  custom_fields?: CustomFieldValue[];
}

/**
 * @stability alpha
 */
export interface TimeEntryActivity {
  id: number;
  name: string;
  is_default: boolean;
  active: boolean;
  custom_fields?: CustomFieldValue[];
}

/**
 * @stability alpha
 */
export interface DocumentCategory {
  id: number;
  name: string;
  is_default: boolean;
  active: boolean;
  custom_fields?: CustomFieldValue[];
}

/**
 * @stability alpha
 */
export interface Role {
  id: number;
  name: string;
  assignable: boolean;
  issues_visibility: string;
  time_entries_visibility: string;
  users_visibility: string;
  permissions: string[];
}

/**
 * @stability alpha
 */
export interface GroupSummary {
  id: number;
  name: string;
  builtin?: string;
  custom_fields?: CustomFieldValue[];
}

/**
 * @stability alpha
 */
export interface Group {
  id: number;
  name: string;
  builtin?: string;
  custom_fields?: CustomFieldValue[];
  users?: IdName[];
  /**
   * Project memberships visible to the current user. Memberships in archived projects are excluded.
   */
  memberships?: {
    id: number;
    project: IdName;
    roles: MembershipRole[];
  }[];
}

/**
 * @stability alpha
 */
export interface CustomField {
  id: number;
  name: string;
  description: string | null;
  customized_type?:
    | "issue"
    | "time_entry"
    | "project"
    | "version"
    | "document"
    | "user"
    | "group"
    | "time_entry_activity"
    | "issue_priority"
    | "document_category";
  field_format:
    | "enumeration"
    | "string"
    | "version"
    | "attachment"
    | "user"
    | "list"
    | "link"
    | "float"
    | "int"
    | "date"
    | "bool"
    | "text"
    | "progressbar";
  regexp: string;
  min_length: number | null;
  max_length: number | null;
  is_required: boolean;
  /**
   * @since 7.0
   */
  is_for_all?: boolean;
  is_filter: boolean;
  searchable: boolean;
  multiple: boolean;
  default_value: string | null;
  /**
   * Only returned for date custom fields. When date_offset, default_value holds the offset in days from the current date.
   * @since 7.0
   */
  default_value_mode?: "fixed_date" | "date_offset";
  visible: boolean;
  editable: boolean;
  /**
   * @since 7.0
   */
  projects?: IdName[];
  trackers?: IdName[];
  roles?: IdName[];
  possible_values?: {
    value: string;
    label: string;
  }[];
}

/**
 * @stability alpha
 */
export interface Search {
  id: number;
  title: string;
  type: string;
  url: string;
  description: string | null;
  datetime: string;
}

/**
 * @stability alpha
 */
export interface File {
  id: number;
  filename: string;
  filesize: number;
  content_type: string | null;
  description: string | null;
  content_url: string;
  thumbnail_url?: string;
  author: IdName;
  created_on: string;
  version?: IdName;
  digest: string;
  downloads: number;
}

/**
 * @stability alpha
 */
export interface MyAccount {
  id: number;
  login: string;
  admin: boolean;
  firstname: string;
  lastname: string;
  mail: string;
  created_on: string;
  last_login_on: string | null;
  /**
   * Not returned when the request is authenticated via OAuth.
   */
  api_key?: string;
  custom_fields?: CustomFieldValue[];
}
