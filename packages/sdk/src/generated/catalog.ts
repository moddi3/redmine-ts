// Generated from spec/redmine-openapi/*.yaml by `vp run gen`. Do not edit.

import type { CatalogEntry, JsonSchema } from "../core/catalog.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

const scalar: JsonSchema = { type: ["string", "number"] };

const scalars: JsonSchema = { type: "array", items: scalar, minItems: 1 };

const many: JsonSchema = { anyOf: [scalar, scalars] };

const pair: JsonSchema = { type: "array", prefixItems: [scalar, scalar], minItems: 2, maxItems: 2 };

const text: JsonSchema = { type: "string" };

const yes: JsonSchema = { const: true };

const opRaw: JsonSchema = {
  type: "object",
  properties: { raw: text },
  required: ["raw"],
  additionalProperties: false,
};

const opNot: JsonSchema = {
  type: "object",
  properties: { not: many },
  required: ["not"],
  additionalProperties: false,
};

const opGte: JsonSchema = {
  type: "object",
  properties: { gte: scalar },
  required: ["gte"],
  additionalProperties: false,
};

const opLte: JsonSchema = {
  type: "object",
  properties: { lte: scalar },
  required: ["lte"],
  additionalProperties: false,
};

const opBetween: JsonSchema = {
  type: "object",
  properties: { between: pair },
  required: ["between"],
  additionalProperties: false,
};

const opContains: JsonSchema = {
  type: "object",
  properties: { contains: text },
  required: ["contains"],
  additionalProperties: false,
};

const opNotContains: JsonSchema = {
  type: "object",
  properties: { not_contains: text },
  required: ["not_contains"],
  additionalProperties: false,
};

const opStartsWith: JsonSchema = {
  type: "object",
  properties: { starts_with: text },
  required: ["starts_with"],
  additionalProperties: false,
};

const opEndsWith: JsonSchema = {
  type: "object",
  properties: { ends_with: text },
  required: ["ends_with"],
  additionalProperties: false,
};

const opAny: JsonSchema = {
  type: "object",
  properties: { any: yes },
  required: ["any"],
  additionalProperties: false,
};

const opNone: JsonSchema = {
  type: "object",
  properties: { none: yes },
  required: ["none"],
  additionalProperties: false,
};

const outIdName: JsonSchema = {
  type: "object",
  properties: { id: { type: "integer" }, name: { type: "string" } },
  required: ["id", "name"],
};

const outIssueStatusSummary: JsonSchema = {
  type: "object",
  properties: { id: { type: "integer" }, name: { type: "string" }, is_closed: { type: "boolean" } },
  required: ["id", "name", "is_closed"],
};

const outCustomFieldValue: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    multiple: { type: "boolean" },
    value: { anyOf: [{ type: ["string", "null"] }, { type: "array", items: { type: "string" } }] },
  },
  required: ["id", "name", "value"],
};

const outAttachment: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    filename: { type: "string" },
    filesize: { type: "integer" },
    content_type: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    content_url: { type: "string" },
    thumbnail_url: { type: "string" },
    author: outIdName,
    created_on: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "filename",
    "filesize",
    "content_type",
    "description",
    "content_url",
    "created_on",
  ],
};

const outIssueSummary: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    project: outIdName,
    tracker: outIdName,
    status: outIssueStatusSummary,
    priority: outIdName,
    author: outIdName,
    assigned_to: outIdName,
    category: outIdName,
    fixed_version: outIdName,
    parent: { type: "object", properties: { id: { type: "integer" } } },
    subject: { type: "string" },
    description: { type: ["string", "null"] },
    start_date: { type: ["string", "null"], format: "date" },
    due_date: { type: ["string", "null"], format: "date" },
    done_ratio: { type: "integer", minimum: 0, maximum: 100 },
    is_private: { type: "boolean" },
    estimated_hours: { type: ["number", "null"] },
    total_estimated_hours: { type: ["number", "null"] },
    spent_hours: { type: "number" },
    total_spent_hours: { type: "number" },
    custom_fields: { type: "array", items: outCustomFieldValue },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
    closed_on: { type: ["string", "null"], format: "date-time" },
    attachments: { type: "array", items: outAttachment },
    relations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          issue_id: { type: "integer" },
          issue_to_id: { type: "integer" },
          relation_type: {
            type: "string",
            enum: [
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
          delay: { type: ["integer", "null"] },
        },
      },
    },
  },
  required: [
    "id",
    "subject",
    "description",
    "start_date",
    "due_date",
    "done_ratio",
    "is_private",
    "estimated_hours",
    "total_estimated_hours",
    "created_on",
    "updated_on",
    "closed_on",
  ],
};

const inCustomFields: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "integer" },
      value: {
        anyOf: [{ type: ["string", "null"] }, { type: "array", items: { type: "string" } }],
      },
    },
    required: ["id"],
    additionalProperties: false,
  },
};

const inCustomFieldValues: JsonSchema = {
  type: "object",
  additionalProperties: {
    anyOf: [{ type: ["string", "null"] }, { type: "array", items: { type: "string" } }],
  },
};

const inUploads: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      token: { type: "string" },
      filename: { type: "string" },
      description: { type: "string" },
      content_type: { type: "string" },
    },
    additionalProperties: false,
  },
};

const outIssue: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    project: outIdName,
    tracker: outIdName,
    status: outIssueStatusSummary,
    priority: outIdName,
    author: outIdName,
    assigned_to: outIdName,
    category: outIdName,
    fixed_version: outIdName,
    parent: { type: "object", properties: { id: { type: "integer" } } },
    subject: { type: "string" },
    description: { type: ["string", "null"] },
    start_date: { type: ["string", "null"], format: "date" },
    due_date: { type: ["string", "null"], format: "date" },
    done_ratio: { type: "integer", minimum: 0, maximum: 100 },
    is_private: { type: "boolean" },
    estimated_hours: { type: ["number", "null"] },
    total_estimated_hours: { type: ["number", "null"] },
    spent_hours: { type: "number" },
    total_spent_hours: { type: "number" },
    custom_fields: { type: "array", items: outCustomFieldValue },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
    closed_on: { type: ["string", "null"], format: "date-time" },
    changesets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          revision: { type: "string" },
          user: outIdName,
          comments: { type: "string" },
          committed_on: { type: "string", format: "date-time" },
        },
      },
    },
    children: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, tracker: outIdName, subject: { type: "string" } },
      },
    },
    attachments: { type: "array", items: outAttachment },
    relations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          issue_id: { type: "integer" },
          issue_to_id: { type: "integer" },
          relation_type: {
            type: "string",
            enum: [
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
          delay: { type: ["integer", "null"] },
        },
      },
    },
    journals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          user: outIdName,
          notes: { type: "string" },
          created_on: { type: "string", format: "date-time" },
          updated_on: { type: "string", format: "date-time" },
          updated_by: outIdName,
          private_notes: { type: "boolean" },
          details: {
            type: "array",
            items: {
              type: "object",
              properties: {
                property: { type: "string" },
                name: { type: "string" },
                old_value: { type: ["string", "null"] },
                new_value: { type: ["string", "null"] },
              },
              required: ["property", "name", "old_value", "new_value"],
            },
          },
        },
        required: ["id", "notes", "created_on", "updated_on", "private_notes", "details"],
      },
    },
    watchers: { type: "array", items: outIdName },
    allowed_statuses: { type: "array", items: outIssueStatusSummary },
  },
  required: [
    "id",
    "subject",
    "description",
    "start_date",
    "due_date",
    "done_ratio",
    "is_private",
    "estimated_hours",
    "total_estimated_hours",
    "created_on",
    "updated_on",
    "closed_on",
  ],
};

const outProjectSummary: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    identifier: { type: "string" },
    description: { type: ["string", "null"] },
    homepage: { type: ["string", "null"] },
    parent: outIdName,
    status: { type: "integer" },
    is_public: { type: "boolean" },
    inherit_members: { type: "boolean" },
    custom_fields: { type: "array", items: outCustomFieldValue },
    trackers: { type: "array", items: outIdName },
    issue_categories: { type: "array", items: outIdName },
    time_entry_activities: { type: "array", items: outIdName },
    enabled_modules: { type: "array", items: outIdName },
    issue_custom_fields: { type: "array", items: outIdName },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "name",
    "identifier",
    "description",
    "homepage",
    "status",
    "is_public",
    "inherit_members",
    "created_on",
    "updated_on",
  ],
};

const outProject: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    identifier: { type: "string" },
    description: { type: ["string", "null"] },
    homepage: { type: ["string", "null"] },
    parent: outIdName,
    status: { type: "integer" },
    is_public: { type: "boolean" },
    inherit_members: { type: "boolean" },
    default_version: outIdName,
    default_assignee: outIdName,
    custom_fields: { type: "array", items: outCustomFieldValue },
    trackers: { type: "array", items: outIdName },
    issue_categories: { type: "array", items: outIdName },
    time_entry_activities: { type: "array", items: outIdName },
    enabled_modules: { type: "array", items: outIdName },
    issue_custom_fields: { type: "array", items: outIdName },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "name",
    "identifier",
    "description",
    "homepage",
    "status",
    "is_public",
    "inherit_members",
    "created_on",
    "updated_on",
  ],
};

const outMembershipRole: JsonSchema = {
  type: "object",
  properties: { id: { type: "integer" }, name: { type: "string" }, inherited: { type: "boolean" } },
  required: ["id", "name"],
};

const outMembership: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    project: outIdName,
    user: outIdName,
    group: outIdName,
    roles: { type: "array", items: outMembershipRole },
  },
  required: ["id", "project", "roles"],
};

const outUserSummary: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    login: { type: "string" },
    admin: { type: "boolean" },
    firstname: { type: "string" },
    lastname: { type: "string" },
    mail: { type: "string" },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
    last_login_on: { type: ["string", "null"], format: "date-time" },
    passwd_changed_on: { type: ["string", "null"], format: "date-time" },
    avatar_url: { type: "string" },
    twofa_scheme: { type: ["string", "null"] },
    status: { type: "integer" },
    auth_source: outIdName,
    custom_fields: { type: "array", items: outCustomFieldValue },
  },
  required: [
    "id",
    "login",
    "admin",
    "firstname",
    "lastname",
    "mail",
    "created_on",
    "updated_on",
    "last_login_on",
    "passwd_changed_on",
    "twofa_scheme",
    "status",
  ],
};

const inPref: JsonSchema = {
  type: "object",
  properties: {
    hide_mail: { type: "boolean" },
    time_zone: { type: ["string", "null"] },
    comments_sorting: { type: "string", enum: ["asc", "desc"] },
    warn_on_leaving_unsaved: { type: "boolean" },
    no_self_notified: { type: "boolean" },
    notify_about_high_priority_issues: { type: "boolean" },
    textarea_font: { type: ["string", "null"], enum: ["monospace", "proportional", null] },
    recently_used_projects: { type: "integer" },
    history_default_tab: {
      type: "string",
      enum: ["notes", "history", "properties", "time_entries", "changesets", "last_tab_visited"],
    },
    toolbar_language_options: { type: "string" },
    default_issue_query: { type: ["integer", "null"] },
    default_project_query: { type: ["integer", "null"] },
    auto_watch_on: {
      type: "array",
      items: { type: "string", enum: ["issue_created", "issue_contributed_to"] },
    },
  },
  additionalProperties: false,
};

const outUser: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    login: { type: "string" },
    admin: { type: "boolean" },
    firstname: { type: "string" },
    lastname: { type: "string" },
    mail: { type: "string" },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
    last_login_on: { type: ["string", "null"], format: "date-time" },
    passwd_changed_on: { type: ["string", "null"], format: "date-time" },
    avatar_url: { type: "string" },
    twofa_scheme: { type: ["string", "null"] },
    api_key: { type: "string" },
    status: { type: "integer" },
    custom_fields: { type: "array", items: outCustomFieldValue },
    auth_source: outIdName,
    groups: { type: "array", items: outIdName },
    memberships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          project: outIdName,
          roles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
                inherited: { type: "boolean" },
              },
              required: ["id", "name"],
            },
          },
        },
        required: ["id", "project", "roles"],
      },
    },
  },
  required: [
    "id",
    "login",
    "firstname",
    "lastname",
    "created_on",
    "updated_on",
    "last_login_on",
    "passwd_changed_on",
  ],
};

const outTimeEntry: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    project: outIdName,
    issue: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    user: outIdName,
    activity: outIdName,
    hours: { type: "number" },
    comments: { type: ["string", "null"] },
    spent_on: { type: "string", format: "date" },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
    custom_fields: { type: "array", items: outCustomFieldValue },
  },
  required: ["id", "hours", "comments", "spent_on", "created_on", "updated_on"],
};

const outNewsComment: JsonSchema = {
  type: "object",
  properties: { id: { type: "integer" }, author: outIdName, content: { type: "string" } },
  required: ["id", "content"],
};

const outNews: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    project: outIdName,
    author: outIdName,
    title: { type: "string" },
    summary: { type: "string" },
    description: { type: "string" },
    created_on: { type: "string", format: "date-time" },
    attachments: { type: "array", items: outAttachment },
    comments: { type: "array", items: outNewsComment },
  },
  required: ["id", "title", "description", "created_on"],
};

const outIssueRelation: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    issue_id: { type: "integer" },
    issue_to_id: { type: "integer" },
    relation_type: {
      type: "string",
      enum: [
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
    delay: { type: ["integer", "null"] },
  },
  required: ["id", "issue_id", "issue_to_id", "relation_type", "delay"],
};

const outVersionSummary: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    project: outIdName,
    name: { type: "string" },
    description: { type: ["string", "null"] },
    status: { type: "string", enum: ["open", "locked", "closed"] },
    due_date: { type: ["string", "null"], format: "date" },
    sharing: { type: "string", enum: ["none", "descendants", "hierarchy", "tree", "system"] },
    wiki_page_title: { type: ["string", "null"] },
    custom_fields: { type: "array", items: outCustomFieldValue },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "name",
    "description",
    "status",
    "due_date",
    "sharing",
    "wiki_page_title",
    "created_on",
    "updated_on",
  ],
};

const outVersion: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    project: outIdName,
    name: { type: "string" },
    description: { type: ["string", "null"] },
    status: { type: "string", enum: ["open", "locked", "closed"] },
    due_date: { type: ["string", "null"], format: "date" },
    sharing: { type: "string", enum: ["none", "descendants", "hierarchy", "tree", "system"] },
    wiki_page_title: { type: ["string", "null"] },
    estimated_hours: { type: "number" },
    spent_hours: { type: "number" },
    custom_fields: { type: "array", items: outCustomFieldValue },
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "name",
    "description",
    "status",
    "due_date",
    "sharing",
    "wiki_page_title",
    "created_on",
    "updated_on",
  ],
};

const outWikiPageSummary: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    parent: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    version: { type: "integer" },
    project: outIdName,
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
  },
  required: ["title", "version", "created_on", "updated_on"],
};

const outWikiPage: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    parent: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    text: { type: "string" },
    version: { type: "integer" },
    author: outIdName,
    comments: { type: ["string", "null"] },
    project: outIdName,
    created_on: { type: "string", format: "date-time" },
    updated_on: { type: "string", format: "date-time" },
    attachments: { type: "array", items: outAttachment },
  },
  required: ["title", "text", "version", "comments", "created_on", "updated_on"],
};

const outQuery: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    is_public: { type: "boolean" },
    project_id: { type: ["integer", "null"] },
  },
  required: ["id", "name", "is_public", "project_id"],
};

const outIssueStatus: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    is_closed: { type: "boolean" },
    description: { type: ["string", "null"] },
  },
  required: ["id", "name", "is_closed", "description"],
};

const outTracker: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    default_status: outIdName,
    description: { type: ["string", "null"] },
    enabled_standard_fields: { type: "array", items: { type: "string" } },
  },
  required: ["id", "name", "description", "enabled_standard_fields"],
};

const outIssueCategory: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    project: outIdName,
    name: { type: "string" },
    assigned_to: outIdName,
  },
  required: ["id", "name"],
};

const outIssuePriority: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    is_default: { type: "boolean" },
    active: { type: "boolean" },
    custom_fields: { type: "array", items: outCustomFieldValue },
  },
  required: ["id", "name", "is_default", "active"],
};

const outTimeEntryActivity: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    is_default: { type: "boolean" },
    active: { type: "boolean" },
    custom_fields: { type: "array", items: outCustomFieldValue },
  },
  required: ["id", "name", "is_default", "active"],
};

const outDocumentCategory: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    is_default: { type: "boolean" },
    active: { type: "boolean" },
    custom_fields: { type: "array", items: outCustomFieldValue },
  },
  required: ["id", "name", "is_default", "active"],
};

const outRole: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    assignable: { type: "boolean" },
    issues_visibility: { type: "string" },
    time_entries_visibility: { type: "string" },
    users_visibility: { type: "string" },
    permissions: { type: "array", items: { type: "string" } },
  },
  required: [
    "id",
    "name",
    "assignable",
    "issues_visibility",
    "time_entries_visibility",
    "users_visibility",
    "permissions",
  ],
};

const outGroupSummary: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    builtin: { type: "string" },
    custom_fields: { type: "array", items: outCustomFieldValue },
  },
  required: ["id", "name"],
};

const outGroup: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    builtin: { type: "string" },
    custom_fields: { type: "array", items: outCustomFieldValue },
    users: { type: "array", items: outIdName },
    memberships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          project: outIdName,
          roles: { type: "array", items: outMembershipRole },
        },
        required: ["id", "project", "roles"],
      },
    },
  },
  required: ["id", "name"],
};

const outCustomField: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    description: { type: ["string", "null"] },
    customized_type: {
      type: "string",
      enum: [
        "issue",
        "time_entry",
        "project",
        "version",
        "document",
        "user",
        "group",
        "time_entry_activity",
        "issue_priority",
        "document_category",
      ],
    },
    field_format: {
      type: "string",
      enum: [
        "enumeration",
        "string",
        "version",
        "attachment",
        "user",
        "list",
        "link",
        "float",
        "int",
        "date",
        "bool",
        "text",
        "progressbar",
      ],
    },
    regexp: { type: "string" },
    min_length: { type: ["integer", "null"] },
    max_length: { type: ["integer", "null"] },
    is_required: { type: "boolean" },
    is_for_all: { type: "boolean" },
    is_filter: { type: "boolean" },
    searchable: { type: "boolean" },
    multiple: { type: "boolean" },
    default_value: { type: ["string", "null"] },
    default_value_mode: {
      description:
        "Only returned for date custom fields. When date_offset, default_value holds the offset in days from the current date.",
      type: "string",
      enum: ["fixed_date", "date_offset"],
    },
    visible: { type: "boolean" },
    editable: { type: "boolean" },
    projects: { type: "array", items: outIdName },
    trackers: { type: "array", items: outIdName },
    roles: { type: "array", items: outIdName },
    possible_values: {
      type: "array",
      items: {
        type: "object",
        properties: { value: { type: "string" }, label: { type: "string" } },
      },
    },
  },
  required: [
    "id",
    "name",
    "description",
    "field_format",
    "regexp",
    "min_length",
    "max_length",
    "is_required",
    "is_filter",
    "searchable",
    "multiple",
    "default_value",
    "visible",
    "editable",
  ],
};

const outSearch: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    title: { type: "string" },
    type: { type: "string" },
    url: { type: "string" },
    description: { type: ["string", "null"] },
    datetime: { type: "string", format: "date-time" },
  },
  required: ["id", "title", "type", "url", "description", "datetime"],
};

const outFile: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    filename: { type: "string" },
    filesize: { type: "integer" },
    content_type: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    content_url: { type: "string" },
    thumbnail_url: { type: "string" },
    author: outIdName,
    created_on: { type: "string", format: "date-time" },
    version: outIdName,
    digest: { type: "string" },
    downloads: { type: "integer" },
  },
  required: [
    "id",
    "filename",
    "filesize",
    "content_type",
    "description",
    "content_url",
    "created_on",
    "digest",
    "downloads",
  ],
};

/** One entry per generated namespace method, in spec order. */
export const CATALOG: readonly CatalogEntry[] = [
  {
    id: "getIssues",
    namespace: "issues",
    verb: "list",
    title: "List issues",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Listing-issues",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        include: {
          type: "array",
          items: { type: "string", enum: ["attachments", "relations"] },
          description:
            "Comma-separated list of associated data to include for each issue.\nValues: `attachments` (file attachments), `relations` (issue relations)",
        },
        query_id: {
          type: "integer",
          description:
            "ID of a saved query to apply. When specified, the saved query's filter criteria are used.\nOther filter parameters in the same request are ignored.\nUse GET /queries.json to retrieve available saved queries.",
        },
        where: {
          description:
            "Filters, keyed by Redmine's filter parameter names. A value or an array of values means equals; an object with one operator picks another.",
          type: "object",
          properties: {
            issue_id: {
              description:
                "Filter by issue ID.\nFormat: `[operator]value`\nOperators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)\nExamples: `1`, `>=100`, `><1|100`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            project_id: {
              description:
                "Filter by project.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nSpecial values: `mine` (projects where current user is a member), `bookmarks` (bookmarked projects)\nExamples: `1|2`, `mine`, `!mine`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            subproject_id: {
              description:
                "Filter by subproject.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nExamples: `1|2`, `*`, `!*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            tracker_id: {
              description:
                "Filter by tracker.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)\nExamples: `1|2`, `!3`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            status_id: {
              description:
                "Filter by issue status.\nFormat: `[operator]value[|value2|...]`\nOperators: `o` (open), `=` (default), `!` (not equal), `c` (closed), `*` (any), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)\nExamples: `o`, `1|2`, `c`, `!3`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny],
            },
            priority_id: {
              description:
                "Filter by priority.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)\nExamples: `1|2`, `!3`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            assigned_to_id: {
              description:
                "Filter by assignee.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)\nSpecial values: `me` (current user)\nExamples: `1`, `me`, `!*`, `!me`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            author_id: {
              description:
                "Filter by author.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nSpecial values: `me` (current user)\nExamples: `1`, `me`, `!me`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            "author.group": {
              description:
                "Filter by author's group.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nExamples: `1|2`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            "author.role": {
              description:
                "Filter by author's role.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nExamples: `1|2`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            member_of_group: {
              description:
                "Filter by assignee's group membership.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nExamples: `1`, `*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            assigned_to_role: {
              description:
                "Filter by assignee's role.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nExamples: `1`, `*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            fixed_version_id: {
              description:
                "Filter by target version.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)\nExamples: `1|2`, `!*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            "fixed_version.due_date": {
              description:
                "Filter by target version's due date.\nFormat: `<operator>[value]`\nOperators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `t`, `>t-7`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            "fixed_version.status": {
              description:
                "Filter by target version's status.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nValues: `open`, `locked`, `closed`\nExamples: `open`, `open|locked`, `!closed`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            category_id: {
              description:
                "Filter by category.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none), `ev` (has ever been), `!ev` (has never been), `cf` (changed from)\nExamples: `1|2`, `!*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            parent_id: {
              description:
                "Filter by parent issue.\nFormat: `[operator]value`\nOperators: `=` (exact parent ID), `~` (descendant of, subtree search), `*` (any, i.e. is a subtask), `!*` (none, i.e. is a root issue)\nExamples: `123`, `~123`, `*`, `!*`",
              anyOf: [scalar, scalars, opRaw, opContains, opAny, opNone],
            },
            child_id: {
              description:
                "Filter by child issue.\nFormat: `[operator]value`\nOperators: `=` (exact child ID), `~` (ancestor of, subtree search), `*` (any, i.e. has subtasks), `!*` (none, i.e. is a leaf issue)\nExamples: `123`, `~123`, `*`, `!*`",
              anyOf: [scalar, scalars, opRaw, opContains, opAny, opNone],
            },
            subject: {
              description:
                "Filter by subject.\nFormat: `<operator>value`\nOperators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~keyword`, `^prefix`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            description: {
              description:
                "Filter by description.\nFormat: `<operator>value`\nOperators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~keyword`, `!~excluded`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            notes: {
              description:
                "Filter by journal notes.\nFormat: `<operator>value`\nOperators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~keyword`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            created_on: {
              description:
                "Filter by creation date.\nFormat: `<operator>[value]`\nOperators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `t`, `>t-7`, `lm`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            updated_on: {
              description:
                "Filter by last updated date.\nFormat: `<operator>[value]`\nOperators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `t`, `>t-7`, `lm`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            closed_on: {
              description:
                "Filter by closed date.\nFormat: `<operator>[value]`\nOperators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `t`, `>t-7`, `lm`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            start_date: {
              description:
                "Filter by start date.\nFormat: `<operator>[value]`\nOperators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `t`, `>t-7`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            due_date: {
              description:
                "Filter by due date.\nFormat: `<operator>[value]`\nOperators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `nd` (tomorrow), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `nw` (next week), `m` (this month), `lm` (last month), `nm` (next month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `t+` (in n days), `>t+` (in more than n days), `<t+` (in less than n days), `><t+` (between n1 and n2 days from now), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `t`, `>t-7`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            estimated_hours: {
              description:
                "Filter by estimated hours.\nFormat: `[operator]value`\nOperators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)\nExamples: `>=5`, `><1|10`, `!*`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            spent_time: {
              description:
                "Filter by total spent time.\nFormat: `[operator]value`\nOperators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)\nExamples: `>=5`, `><1|10`, `!*`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            done_ratio: {
              description:
                "Filter by done ratio (percentage).\nFormat: `[operator]value`\nOperators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)\nExamples: `>=50`, `><0|99`, `100`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            is_private: {
              description:
                "Filter by private flag.\nFormat: `[operator]value`\nOperators: `=` (default), `!` (not equal)\nValues: `1` (private), `0` (not private)\nExamples: `1`, `0`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            attachment: {
              description:
                "Filter by attachment filename.\nFormat: `<operator>value`\nOperators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~report`, `*.pdf`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            attachment_description: {
              description:
                "Filter by attachment description.\nFormat: `<operator>value`\nOperators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~screenshot`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            watcher_id: {
              description:
                "Filter by watcher.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nSpecial values: `me` (current user)\nExamples: `1`, `me`, `!me`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            updated_by: {
              description:
                "Filter by user who updated the issue.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nSpecial values: `me` (current user)\nExamples: `1`, `me`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            last_updated_by: {
              description:
                "Filter by user who last updated the issue.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nSpecial values: `me` (current user)\nExamples: `1`, `me`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            "project.status": {
              description:
                "Filter by project status.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nValues: `1` (active), `5` (closed)\nExamples: `1`, `!5`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            relates: {
              description:
                'Filter by "relates to" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `=p` (same project), `=!p` (different project), `!p` (not in project), `*o` (related to open issue), `!o` (related to closed issue), `*` (any), `!*` (none)\nExamples: `123`, `=p`, `*o`, `*`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            duplicates: {
              description:
                'Filter by "duplicates" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`\nExamples: `123`, `*`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            duplicated: {
              description:
                'Filter by "duplicated by" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`\nExamples: `123`, `*`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            blocks: {
              description:
                'Filter by "blocks" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`\nExamples: `123`, `*o`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            blocked: {
              description:
                'Filter by "blocked by" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`\nExamples: `123`, `*o`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            precedes: {
              description:
                'Filter by "precedes" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`\nExamples: `123`, `*`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            follows: {
              description:
                'Filter by "follows" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`\nExamples: `123`, `*`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            copied_to: {
              description:
                'Filter by "copied to" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`\nExamples: `123`, `*`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            copied_from: {
              description:
                'Filter by "copied from" relation.\nFormat: `[operator]value[|value2|...]`\nOperators: `=`, `!`, `=p`, `=!p`, `!p`, `*o`, `!o`, `*`, `!*`\nExamples: `123`, `*`',
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            any_searchable: {
              description:
                "Full-text search across all searchable fields.\nFormat: `<operator>value`\nOperators: `~` (contains all words), `*~` (contains any word), `!~` (not contains)\nExamples: `~keyword`, `*~foo bar`",
              anyOf: [scalar, scalars, opRaw, opContains, opNotContains],
            },
          },
          patternProperties: {
            "^cf_\\d+$": {
              description:
                "Custom field filter by id, e.g. `cf_12`. Operators depend on the field format.",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opNot,
                opGte,
                opLte,
                opBetween,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
          },
          additionalProperties: false,
        },
        sort: {
          type: "string",
          description:
            "Sort order. Comma-separated list of `field` or `field:desc`. Default direction is ascending.\nExamples: `id:desc`, `status:desc,id`",
        },
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
        paging: {
          description:
            '"keyset" walks by ascending id, immune to inserts and deletes during the walk. It conflicts with `sort`.',
          enum: ["offset", "keyset"],
        },
      },
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outIssueSummary, $schema: DRAFT } },
  },
  {
    id: "createIssue",
    namespace: "issues",
    verb: "create",
    title: "Create issue",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Creating-an-issue",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        tracker_id: { type: "integer" },
        status_id: { type: "integer" },
        priority_id: { type: "integer" },
        subject: { type: "string" },
        description: { type: ["string", "null"] },
        start_date: { type: ["string", "null"], format: "date" },
        due_date: { type: ["string", "null"], format: "date" },
        done_ratio: { type: "integer", minimum: 0, maximum: 100 },
        category_id: { type: ["integer", "null"] },
        fixed_version_id: { type: ["integer", "null"] },
        assigned_to_id: { type: ["integer", "null"] },
        parent_issue_id: { type: ["integer", "null"] },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
        watcher_user_ids: { type: "array", items: { type: "integer" } },
        is_private: { type: "boolean" },
        estimated_hours: { type: ["number", "null"] },
        uploads: inUploads,
      },
      required: ["project_id", "subject"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outIssueSummary, $schema: DRAFT }, optional: false },
  },
  {
    id: "getIssue",
    namespace: "issues",
    verb: "get",
    title: "Show issue",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Showing-an-issue",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        issue_id: { type: "integer" },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "children",
              "attachments",
              "relations",
              "changesets",
              "journals",
              "watchers",
              "allowed_statuses",
            ],
          },
          description:
            "Comma-separated list of associated data to include in the response.\nValues: `children` (child issues), `attachments` (file attachments), `relations` (issue relations), `changesets` (associated VCS changesets), `journals` (change history and notes), `watchers` (users watching the issue), `allowed_statuses` (status transitions available for the current user)",
        },
      },
      required: ["issue_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outIssue, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateIssue",
    namespace: "issues",
    verb: "update",
    title: "Update issue",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Updating-an-issue",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        issue_id: { type: "integer" },
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        tracker_id: { type: "integer" },
        status_id: { type: "integer" },
        priority_id: { type: "integer" },
        subject: { type: "string" },
        description: { type: ["string", "null"] },
        start_date: { type: ["string", "null"], format: "date" },
        due_date: { type: ["string", "null"], format: "date" },
        done_ratio: { type: "integer", minimum: 0, maximum: 100 },
        category_id: { type: ["integer", "null"] },
        fixed_version_id: { type: ["integer", "null"] },
        assigned_to_id: { type: ["integer", "null"] },
        parent_issue_id: { type: ["integer", "null"] },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
        is_private: { type: "boolean" },
        estimated_hours: { type: ["number", "null"] },
        notes: { type: "string" },
        private_notes: {
          description:
            'Mark the notes as private. Only visible to users with the "View private notes" permission.',
          type: "boolean",
        },
        deleted_attachment_ids: {
          description: "IDs of existing attachments to remove from this issue.",
          type: "array",
          items: { type: "integer" },
        },
        uploads: inUploads,
      },
      required: ["issue_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteIssue",
    namespace: "issues",
    verb: "delete",
    title: "Delete issue",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Deleting-an-issue",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { issue_id: { type: "integer" } },
      required: ["issue_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "addWatcher",
    namespace: "issues",
    verb: "addWatcher",
    title: "Add watcher",
    description:
      "Returns 204 even when the user_id does not exist (the watcher is silently not added). A nonexistent issue yields 403, not 404.",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Adding-a-watcher",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { issue_id: { type: "integer" }, user_id: { type: "integer" } },
      required: ["issue_id", "user_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "removeWatcher",
    namespace: "issues",
    verb: "removeWatcher",
    title: "Remove watcher",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Removing-a-watcher",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { issue_id: { type: "integer" }, user_id: { type: "integer" } },
      required: ["issue_id", "user_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getProjects",
    namespace: "projects",
    verb: "list",
    title: "List projects",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Listing-projects",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        include: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "trackers",
              "issue_categories",
              "time_entry_activities",
              "enabled_modules",
              "issue_custom_fields",
            ],
          },
          description:
            "Comma-separated list of associated data to include for each project.\nValues: `trackers` (available issue trackers), `issue_categories` (issue categories), `time_entry_activities` (time entry activity types), `enabled_modules` (enabled modules/features), `issue_custom_fields` (custom fields for issues)",
        },
        where: {
          description:
            "Filters, keyed by Redmine's filter parameter names. A value or an array of values means equals; an object with one operator picks another.",
          type: "object",
          properties: {
            status: {
              description:
                "Filter by project status.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nValues: `1` (active), `5` (closed)\nExamples: `1`, `1|5`, `!1`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            id: {
              description:
                "Filter by project ID.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nSpecial values: `mine` (projects where current user is a member), `bookmarks` (bookmarked projects)\nExamples: `1|2|3`, `mine`, `!mine`, `mine|bookmarks`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            name: {
              description:
                "Filter by project name.\nFormat: `<operator>value`\nOperators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~keyword`, `^prefix`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            description: {
              description:
                "Filter by project description.\nFormat: `<operator>value`\nOperators: `~` (contains), `!~` (not contains), `*~` (contains any word), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~keyword`, `!~excluded`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            parent_id: {
              description:
                "Filter by parent project.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any, i.e. is a subproject), `!*` (none, i.e. is a root project)\nSpecial values: `mine` (projects where current user is a member), `bookmarks` (bookmarked projects)\nExamples: `1|2`, `mine`, `*`, `!*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            is_public: {
              description:
                "Filter by public/private status.\nFormat: `[operator]value`\nOperators: `=` (default), `!` (not equal)\nValues: `1` (public), `0` (private)\nExamples: `1`, `!1`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            created_on: {
              description:
                "Filter by creation date.\nFormat: `<operator>[value]`\nOperators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `><2024-01-01|2024-12-31`, `t`, `>t-7`, `lm`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            updated_on: {
              description:
                "Filter by last updated date.\nFormat: `<operator>[value]`\nOperators: `=` (on date), `>=` (on or after), `<=` (on or before), `><` (between, pipe-separated), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `t-` (n days ago), `>t-` (less than n days ago), `<t-` (more than n days ago), `><t-` (between n1 and n2 days ago), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `><2024-01-01|2024-12-31`, `t`, `>t-7`, `lm`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
          },
          additionalProperties: false,
        },
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outProjectSummary, $schema: DRAFT } },
  },
  {
    id: "createProject",
    namespace: "projects",
    verb: "create",
    title: "Create project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Creating-a-project",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        name: { type: "string" },
        identifier: { type: "string" },
        description: { type: ["string", "null"] },
        homepage: { type: ["string", "null"] },
        is_public: { type: "boolean" },
        parent_id: { type: ["integer", "null"] },
        inherit_members: {
          description:
            "Inherit members from the parent project. Only effective for subprojects (parent_id is set).",
          type: "boolean",
        },
        default_assigned_to_id: {
          description: "Default assignee for new issues in this project. Set to null to clear.",
          type: ["integer", "null"],
        },
        default_version_id: {
          description:
            "Default target version for new issues in this project. Set to null to clear.",
          type: ["integer", "null"],
        },
        default_issue_query_id: {
          description:
            "Default saved query for the project's issue list page. Set to null to clear.",
          type: ["integer", "null"],
        },
        tracker_ids: {
          description: "IDs of trackers available in this project.",
          type: "array",
          items: { type: "integer" },
        },
        enabled_module_names: {
          description:
            "Enabled module names for this project.\nValues: `issue_tracking`, `time_tracking`, `news`, `documents`, `files`, `wiki`, `repository`, `boards`, `calendar`, `gantt`",
          type: "array",
          items: { type: "string" },
        },
        issue_custom_field_ids: {
          description:
            "IDs of issue custom fields enabled for this project. Custom fields with `is_for_all=true` are always available regardless of this setting.",
          type: "array",
          items: { type: "integer" },
        },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
      },
      required: ["name", "identifier"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outProject, $schema: DRAFT }, optional: false },
  },
  {
    id: "getProject",
    namespace: "projects",
    verb: "get",
    title: "Show project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Showing-a-project",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "trackers",
              "issue_categories",
              "time_entry_activities",
              "enabled_modules",
              "issue_custom_fields",
            ],
          },
          description:
            "Comma-separated list of associated data to include in the response.\nValues: `trackers` (available issue trackers), `issue_categories` (issue categories), `time_entry_activities` (time entry activity types), `enabled_modules` (enabled modules/features), `issue_custom_fields` (custom fields for issues)",
        },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outProject, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateProject",
    namespace: "projects",
    verb: "update",
    title: "Update project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Updating-a-project",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        identifier: {
          description:
            "Accepted but ignored: a project's identifier cannot be changed\nonce the project exists, and the request still succeeds.",
          type: "string",
        },
        name: { type: "string" },
        description: { type: ["string", "null"] },
        homepage: { type: ["string", "null"] },
        is_public: { type: "boolean" },
        parent_id: { type: ["integer", "null"] },
        inherit_members: {
          description:
            "Inherit members from the parent project. Only effective for subprojects (parent_id is set).",
          type: "boolean",
        },
        default_assigned_to_id: {
          description: "Default assignee for new issues in this project. Set to null to clear.",
          type: ["integer", "null"],
        },
        default_version_id: {
          description:
            "Default target version for new issues in this project. Set to null to clear.",
          type: ["integer", "null"],
        },
        default_issue_query_id: {
          description:
            "Default saved query for the project's issue list page. Set to null to clear.",
          type: ["integer", "null"],
        },
        tracker_ids: {
          description: "IDs of trackers available in this project.",
          type: "array",
          items: { type: "integer" },
        },
        enabled_module_names: {
          description:
            "Enabled module names for this project.\nValues: `issue_tracking`, `time_tracking`, `news`, `documents`, `files`, `wiki`, `repository`, `boards`, `calendar`, `gantt`",
          type: "array",
          items: { type: "string" },
        },
        issue_custom_field_ids: {
          description:
            "IDs of issue custom fields enabled for this project. Custom fields with `is_for_all=true` are always available regardless of this setting.",
          type: "array",
          items: { type: "integer" },
        },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteProject",
    namespace: "projects",
    verb: "delete",
    title: "Delete project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Deleting-a-project",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "archiveProject",
    namespace: "projects",
    verb: "archive",
    title: "Archive project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Archiving-a-project",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "unarchiveProject",
    namespace: "projects",
    verb: "unarchive",
    title: "Unarchive project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Unarchiving-a-project",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getMemberships",
    namespace: "memberships",
    verb: "list",
    title: "List memberships",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outMembership, $schema: DRAFT } },
  },
  {
    id: "createMembership",
    namespace: "memberships",
    verb: "create",
    title: "Create membership",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#POST",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        user_id: { type: "integer" },
        role_ids: { type: "array", items: { type: "integer" } },
      },
      required: ["project_id", "user_id", "role_ids"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outMembership, $schema: DRAFT }, optional: false },
  },
  {
    id: "getMembership",
    namespace: "memberships",
    verb: "get",
    title: "Show membership",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { membership_id: { type: "integer" } },
      required: ["membership_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outMembership, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateMembership",
    namespace: "memberships",
    verb: "update",
    title: "Update membership",
    description:
      "Warning: sending an empty role_ids returns 422 but still destroys the membership — role assignments are saved immediately and a member left without roles is removed.",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#PUT",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        membership_id: { type: "integer" },
        role_ids: { type: "array", items: { type: "integer" } },
      },
      required: ["membership_id", "role_ids"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteMembership",
    namespace: "memberships",
    verb: "delete",
    title: "Delete membership",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#DELETE",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { membership_id: { type: "integer" } },
      required: ["membership_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "closeProject",
    namespace: "projects",
    verb: "close",
    title: "Close project",
    description: "Undocumented: This operation is not listed in the official documentation.",
    docsUrl: null,
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "reopenProject",
    namespace: "projects",
    verb: "reopen",
    title: "Reopen project",
    description: "Undocumented: This operation is not listed in the official documentation.",
    docsUrl: null,
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getUsers",
    namespace: "users",
    verb: "list",
    title: "List users",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Users#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        include: {
          type: "array",
          items: { type: "string", enum: ["auth_source"] },
          description:
            "Comma-separated list of associated data to include for each user.\nValues: `auth_source` (authentication source information)",
        },
        name: {
          type: "string",
          description:
            "Filter by name, login, or email (contains search).\nThe API always uses the `~` (contains) operator regardless of any operator prefix.\nExamples: `john`, `admin`",
        },
        group_id: {
          type: "string",
          description:
            "Filter by group membership (legacy parameter).\nInternally converted to `is_member_of_group` filter with `=` operator.\nValue is the group ID.",
        },
        where: {
          description:
            "Filters, keyed by Redmine's filter parameter names. A value or an array of values means equals; an object with one operator picks another.",
          type: "object",
          properties: {
            status: {
              description:
                "Filter by user status.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nValues: `1` (active), `2` (registered), `3` (locked)\nExamples: `1`, `1|2`, `!3`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            auth_source_id: {
              description:
                "Filter by authentication source. Undocumented\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nExamples: `1`, `!1`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            twofa_scheme: {
              description:
                "Filter by two-factor authentication scheme. Undocumented\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nOnly available when two-factor authentication is enabled in Redmine settings.",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            login: {
              description:
                "Filter by login. Undocumented\nFormat: `[operator]value`\nOperators: `~` (contains, default), `*~` (contains any word), `=` (exact match), `!~` (does not contain), `!` (not equal), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~admin`, `^john`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opNot,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            firstname: {
              description:
                "Filter by first name. Undocumented\nFormat: `[operator]value`\nOperators: `~` (contains, default), `*~` (contains any word), `=` (exact match), `!~` (does not contain), `!` (not equal), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~John`, `=John`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opNot,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            lastname: {
              description:
                "Filter by last name. Undocumented\nFormat: `[operator]value`\nOperators: `~` (contains, default), `*~` (contains any word), `=` (exact match), `!~` (does not contain), `!` (not equal), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~Doe`, `=Doe`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opNot,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            mail: {
              description:
                "Filter by email address. Undocumented\nFormat: `[operator]value`\nOperators: `~` (contains, default), `*~` (contains any word), `=` (exact match), `!~` (does not contain), `!` (not equal), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~example.com`, `$@example.com`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opNot,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            created_on: {
              description:
                "Filter by creation date. Undocumented\nFormat: `[operator]value`\nOperators: `=` (on date), `>=`, `<=`, `><` (between, pipe-separated), `>t-` (more than N days ago), `<t-` (less than N days ago), `><t-` (between N and M days ago), `t-` (N days ago), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `>t-30`, `lm`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            last_login_on: {
              description:
                "Filter by last login date. Undocumented\nFormat: `[operator]value`\nOperators: `=` (on date), `>=`, `<=`, `><` (between, pipe-separated), `>t-` (more than N days ago), `<t-` (less than N days ago), `><t-` (between N and M days ago), `t-` (N days ago), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `*` (any), `!*` (none)\nExamples: `>=2024-01-01`, `>t-30`, `!*`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            admin: {
              description:
                "Filter by admin privilege. Undocumented\nFormat: `[operator]value`\nOperators: `=` (default), `!` (not equal)\nValues: `1` (admin), `0` (non-admin)\nExamples: `1`, `!1`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
          },
          additionalProperties: false,
        },
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outUserSummary, $schema: DRAFT } },
  },
  {
    id: "createUser",
    namespace: "users",
    verb: "create",
    title: "Create user",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Users#POST",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        login: { type: "string" },
        admin: { type: "boolean" },
        password: { type: "string" },
        firstname: { type: "string" },
        lastname: { type: "string" },
        mail: { type: "string" },
        language: { type: "string" },
        auth_source_id: {
          description:
            "External authentication source ID (e.g., LDAP). When set, the user authenticates via the external source and the password field is ignored. Set to null for local authentication.",
          type: ["integer", "null"],
        },
        mail_notification: {
          description:
            "Email notification preference.\nValues: `all` (for any event on all projects), `selected` (for any event on selected projects only), `only_my_events` (only for things I watch or am involved in), `only_assigned` (only for things I am assigned to), `only_owner` (only for things I am the owner of), `none` (no events)",
          type: "string",
          enum: ["all", "selected", "only_my_events", "only_assigned", "only_owner", "none"],
        },
        notified_project_ids: {
          description:
            "Project IDs for which to receive email notifications. Only effective when mail_notification is set to `selected`.",
          type: "array",
          items: { type: "integer" },
        },
        must_change_passwd: {
          description: "Force the user to change their password at next login.",
          type: "boolean",
        },
        generate_password: {
          description:
            "Generate a random password automatically. When true, the password field is ignored. Only effective for locally authenticated users (auth_source_id is null).",
          type: "boolean",
        },
        status: {
          description: "User account status: `1` (active), `2` (registered), `3` (locked).",
          type: "integer",
        },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
        send_information: {
          description:
            "Set to true to send an account information email to the user. Not stored; only triggers email delivery.",
          type: "boolean",
        },
        pref: inPref,
      },
      required: ["login", "firstname", "lastname", "mail"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outUser, $schema: DRAFT }, optional: false },
  },
  {
    id: "getUser",
    namespace: "users",
    verb: "get",
    title: "Show user",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Users#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        user_id: { type: "integer" },
        include: {
          type: "array",
          items: { type: "string", enum: ["memberships", "groups", "auth_source"] },
          description:
            "Comma-separated list of associated data to include in the response.\nValues: `memberships` (project memberships with roles), `groups` (groups the user belongs to), `auth_source` (authentication source information)",
        },
      },
      required: ["user_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outUser, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateUser",
    namespace: "users",
    verb: "update",
    title: "Update user",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Users#PUT",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        user_id: { type: "integer" },
        login: { type: "string" },
        admin: { type: "boolean" },
        password: { type: "string" },
        firstname: { type: "string" },
        lastname: { type: "string" },
        mail: { type: "string" },
        language: { type: "string" },
        auth_source_id: {
          description:
            "External authentication source ID (e.g., LDAP). When set, the user authenticates via the external source and the password field is ignored. Set to null for local authentication.",
          type: ["integer", "null"],
        },
        mail_notification: {
          description:
            "Email notification preference.\nValues: `all` (for any event on all projects), `selected` (for any event on selected projects only), `only_my_events` (only for things I watch or am involved in), `only_assigned` (only for things I am assigned to), `only_owner` (only for things I am the owner of), `none` (no events)",
          type: "string",
          enum: ["all", "selected", "only_my_events", "only_assigned", "only_owner", "none"],
        },
        notified_project_ids: {
          description:
            "Project IDs for which to receive email notifications. Only effective when mail_notification is set to `selected`.",
          type: "array",
          items: { type: "integer" },
        },
        must_change_passwd: {
          description: "Force the user to change their password at next login.",
          type: "boolean",
        },
        generate_password: {
          description:
            "Generate a random password automatically. When true, the password field is ignored. Only effective for locally authenticated users (auth_source_id is null).",
          type: "boolean",
        },
        status: {
          description: "User account status: `1` (active), `2` (registered), `3` (locked).",
          type: "integer",
        },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
        group_ids: {
          description:
            "Group IDs to assign the user to. Admin-only. Replaces all current group memberships (not append).",
          type: "array",
          items: { type: "integer" },
        },
        send_information: {
          description:
            "Set to true to send an account information email to the user. Not stored; only triggers email delivery.",
          type: "boolean",
        },
        pref: inPref,
      },
      required: ["user_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteUser",
    namespace: "users",
    verb: "delete",
    title: "Delete user",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Users#DELETE",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { user_id: { type: "integer" } },
      required: ["user_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getCurrentUser",
    namespace: "users",
    verb: "current",
    title: "Show current user",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Users#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        include: {
          type: "array",
          items: { type: "string", enum: ["memberships", "groups", "auth_source"] },
          description:
            "Comma-separated list of associated data to include in the response.\nValues: `memberships` (project memberships with roles), `groups` (groups the user belongs to), `auth_source` (authentication source information)",
        },
      },
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outUser, $schema: DRAFT }, optional: false },
  },
  {
    id: "getTimeEntries",
    namespace: "timeEntries",
    verb: "list",
    title: "List time entries",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Listing-time-entries",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        from: {
          type: "string",
          format: "date",
          description:
            "Shortcut for `spent_on` filter. When used with `to`, filters as between (`>=from` and `<=to`). When used alone, filters as `>=from`.\nFormat: `YYYY-MM-DD`",
        },
        to: {
          type: "string",
          format: "date",
          description:
            "Shortcut for `spent_on` filter. When used with `from`, filters as between (`>=from` and `<=to`). When used alone, filters as `<=to`.\nFormat: `YYYY-MM-DD`",
        },
        where: {
          description:
            "Filters, keyed by Redmine's filter parameter names. A value or an array of values means equals; an object with one operator picks another.",
          type: "object",
          properties: {
            user_id: {
              description:
                "Filter by user.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nSpecial values: `me` (current user)\nExamples: `1`, `me`, `!*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            project_id: {
              description:
                "Filter by project.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nSpecial values: `mine` (projects where current user is a member), `bookmarks` (bookmarked projects)\nExamples: `1|2`, `mine`, `!mine`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            spent_on: {
              description:
                "Filter by date spent.\nFormat: `[operator]value`\nOperators: `=` (on date), `>=`, `<=`, `><` (between, pipe-separated), `>t-` (more than N days ago), `<t-` (less than N days ago), `><t-` (between N and M days ago), `t-` (N days ago), `t` (today), `ld` (yesterday), `w` (this week), `lw` (last week), `l2w` (last 2 weeks), `m` (this month), `lm` (last month), `y` (this year), `*` (any), `!*` (none)\nExamples: `=2024-01-01`, `>=2024-01-01`, `><2024-01-01|2024-12-31`, `>t-7`, `t`, `lw`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
            subproject_id: {
              description:
                "Filter by subproject.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nExamples: `1|2`, `*`, `!*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            issue_id: {
              description:
                "Filter by issue.\nFormat: `[operator]value`\nOperators: `=` (exact match), `~` (issue and its subtasks), `*` (any), `!*` (none)\nExamples: `=1`, `~1`, `*`, `!*`",
              anyOf: [scalar, scalars, opRaw, opContains, opAny, opNone],
            },
            "issue.tracker_id": {
              description:
                "Filter by issue's tracker.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nExamples: `1|2`, `!3`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            "issue.status_id": {
              description:
                "Filter by issue's status.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nExamples: `1|2`, `!3`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            "issue.fixed_version_id": {
              description:
                "Filter by issue's target version.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nExamples: `1|2`, `!3`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            "issue.parent_id": {
              description:
                "Filter by issue's parent.\nFormat: `[operator]value`\nOperators: `=` (exact match), `~` (issue and its subtasks), `*` (any), `!*` (none)\nExamples: `=1`, `~1`, `*`, `!*`",
              anyOf: [scalar, scalars, opRaw, opContains, opAny, opNone],
            },
            "issue.category_id": {
              description:
                "Filter by issue's category.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nExamples: `1|2`, `!*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            "issue.subject": {
              description:
                "Filter by issue's subject.\nFormat: `[operator]value`\nOperators: `~` (contains, default), `*~` (contains any word), `!~` (does not contain), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~keyword`, `^prefix`, `$suffix`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            "user.group": {
              description:
                "Filter by user's group.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nExamples: `1|2`, `*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            "user.role": {
              description:
                "Filter by user's role.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nExamples: `1|2`, `*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            author_id: {
              description:
                "Filter by author.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal), `*` (any), `!*` (none)\nSpecial values: `me` (current user)\nExamples: `1`, `me`, `!*`",
              anyOf: [scalar, scalars, opRaw, opNot, opAny, opNone],
            },
            activity_id: {
              description:
                "Filter by activity.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nExamples: `1|2`, `!3`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            "project.status": {
              description:
                "Filter by project's status.\nFormat: `[operator]value[|value2|...]`\nOperators: `=` (default), `!` (not equal)\nValues: `1` (active), `5` (closed)\nExamples: `1`, `!5`",
              anyOf: [scalar, scalars, opRaw, opNot],
            },
            comments: {
              description:
                "Filter by comments.\nFormat: `[operator]value`\nOperators: `~` (contains, default), `*~` (contains any word), `!~` (does not contain), `^` (starts with), `$` (ends with), `*` (any), `!*` (none)\nExamples: `~keyword`, `^prefix`",
              anyOf: [
                scalar,
                scalars,
                opRaw,
                opContains,
                opNotContains,
                opStartsWith,
                opEndsWith,
                opAny,
                opNone,
              ],
            },
            hours: {
              description:
                "Filter by hours.\nFormat: `[operator]value`\nOperators: `=` (default), `>=`, `<=`, `><` (between, pipe-separated), `*` (any), `!*` (none)\nExamples: `=8`, `>=4`, `><1|8`",
              anyOf: [scalar, scalars, opRaw, opGte, opLte, opBetween, opAny, opNone],
            },
          },
          additionalProperties: false,
        },
        sort: {
          type: "string",
          description:
            "Sort order. Comma-separated list of `field` or `field:desc`. Default direction is ascending.\nExamples: `spent_on:desc`, `hours:desc,spent_on`",
        },
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outTimeEntry, $schema: DRAFT } },
  },
  {
    id: "createTimeEntry",
    namespace: "timeEntries",
    verb: "create",
    title: "Create time entry",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Creating-a-time-entry",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        issue_id: { type: "integer" },
        project_id: { type: "integer" },
        spent_on: { type: "string", format: "date" },
        hours: { type: "number" },
        activity_id: { type: "integer" },
        comments: { type: "string" },
        user_id: { type: "integer" },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
      },
      required: ["hours"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outTimeEntry, $schema: DRAFT }, optional: false },
  },
  {
    id: "getTimeEntry",
    namespace: "timeEntries",
    verb: "get",
    title: "Show time entry",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Showing-a-time-entry",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { time_entry_id: { type: "integer" } },
      required: ["time_entry_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outTimeEntry, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateTimeEntry",
    namespace: "timeEntries",
    verb: "update",
    title: "Update time entry",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Updating-a-time-entry",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        time_entry_id: { type: "integer" },
        issue_id: { type: "integer" },
        project_id: { type: "integer" },
        spent_on: { type: "string", format: "date" },
        hours: { type: "number" },
        activity_id: { type: "integer" },
        comments: { type: "string" },
        user_id: { type: "integer" },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
      },
      required: ["time_entry_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteTimeEntry",
    namespace: "timeEntries",
    verb: "delete",
    title: "Delete time entry",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Deleting-a-time-entry",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { time_entry_id: { type: "integer" } },
      required: ["time_entry_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getNewsList",
    namespace: "news",
    verb: "list",
    title: "List news",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_News#Listing-news",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outNews, $schema: DRAFT } },
  },
  {
    id: "getNews",
    namespace: "news",
    verb: "get",
    title: "Show news",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_News#Showing-a-news-item",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        news_id: { type: "integer" },
        include: {
          type: "array",
          items: { type: "string", enum: ["attachments", "comments"] },
          description:
            "Comma-separated list of associated data to include in the response.\nValues: `attachments` (file attachments), `comments` (comments/replies on the news item)",
        },
      },
      required: ["news_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outNews, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateNews",
    namespace: "news",
    verb: "update",
    title: "Update news",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_News#Updating-a-news-item",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        news_id: { type: "integer" },
        title: { type: "string" },
        summary: { type: "string" },
        description: { type: "string" },
        uploads: inUploads,
      },
      required: ["news_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteNews",
    namespace: "news",
    verb: "delete",
    title: "Delete news",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_News#Deleting-a-news-item",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { news_id: { type: "integer" } },
      required: ["news_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getNewsListByProject",
    namespace: "news",
    verb: "listByProject",
    title: "List news by project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_News#Listing-news",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outNews, $schema: DRAFT } },
  },
  {
    id: "createNews",
    namespace: "news",
    verb: "create",
    title: "Create news",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_News#Creating-a-news-item",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "stable",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        title: { type: "string" },
        summary: { type: "string" },
        description: { type: "string" },
        uploads: inUploads,
      },
      required: ["project_id", "title", "description"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getIssueRelations",
    namespace: "relations",
    verb: "list",
    title: "List issue relations",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { issue_id: { type: "integer" } },
      required: ["issue_id"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outIssueRelation, $schema: DRAFT } },
  },
  {
    id: "createIssueRelation",
    namespace: "relations",
    verb: "create",
    title: "Create issue relation",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations#POST",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        issue_id: { type: "integer" },
        issue_to_id: { type: "integer" },
        relation_type: {
          description:
            "Type of relation from this issue to the target issue.\nValues: `relates` (related to), `duplicates` (this duplicates target), `duplicated` (this is duplicated by target), `blocks` (this blocks target), `blocked` (this is blocked by target), `precedes` (this must finish before target starts), `follows` (this must start after target finishes), `copied_to` (this was copied to target), `copied_from` (this was copied from target)",
          type: "string",
          enum: [
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
        delay: {
          description:
            "Number of days of delay for `precedes`/`follows` relations. Ignored for other relation types.",
          type: ["integer", "null"],
        },
      },
      required: ["issue_id", "issue_to_id", "relation_type"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outIssueRelation, $schema: DRAFT }, optional: false },
  },
  {
    id: "getIssueRelation",
    namespace: "relations",
    verb: "get",
    title: "Show issue relation",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { issue_relation_id: { type: "integer" } },
      required: ["issue_relation_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outIssueRelation, $schema: DRAFT }, optional: false },
  },
  {
    id: "deleteIssueRelation",
    namespace: "relations",
    verb: "delete",
    title: "Delete issue relation",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations#DELETE",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { issue_relation_id: { type: "integer" } },
      required: ["issue_relation_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getVersionsByProject",
    namespace: "versions",
    verb: "list",
    title: "List versions by project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Versions#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outVersionSummary, $schema: DRAFT } },
  },
  {
    id: "createVersion",
    namespace: "versions",
    verb: "create",
    title: "Create version",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Versions#POST",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        name: { type: "string" },
        status: { type: "string", enum: ["open", "locked", "closed"] },
        sharing: {
          description:
            "Version sharing scope.\nValues: `none` (not shared), `descendants` (with subprojects), `hierarchy` (with ancestors and descendants), `tree` (with entire project tree), `system` (with all projects)",
          type: "string",
          enum: ["none", "descendants", "hierarchy", "tree", "system"],
        },
        due_date: { type: ["string", "null"], format: "date" },
        description: { type: "string" },
        wiki_page_title: {
          description: "Title of a wiki page to associate with this version. Set to null to clear.",
          type: ["string", "null"],
        },
        default_project_version: {
          description:
            "Set to true to make this the default target version for new issues in the project.",
          type: "boolean",
        },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
      },
      required: ["project_id", "name"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outVersion, $schema: DRAFT }, optional: false },
  },
  {
    id: "getVersion",
    namespace: "versions",
    verb: "get",
    title: "Show version",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Versions#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { version_id: { type: "integer" } },
      required: ["version_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outVersion, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateVersion",
    namespace: "versions",
    verb: "update",
    title: "Update version",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Versions#PUT",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        version_id: { type: "integer" },
        name: { type: "string" },
        status: { type: "string", enum: ["open", "locked", "closed"] },
        sharing: {
          description:
            "Version sharing scope.\nValues: `none` (not shared), `descendants` (with subprojects), `hierarchy` (with ancestors and descendants), `tree` (with entire project tree), `system` (with all projects)",
          type: "string",
          enum: ["none", "descendants", "hierarchy", "tree", "system"],
        },
        due_date: { type: ["string", "null"], format: "date" },
        description: { type: "string" },
        wiki_page_title: {
          description: "Title of a wiki page to associate with this version. Set to null to clear.",
          type: ["string", "null"],
        },
        default_project_version: {
          description:
            "Set to true to make this the default target version for new issues in the project.",
          type: "boolean",
        },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
      },
      required: ["version_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteVersion",
    namespace: "versions",
    verb: "delete",
    title: "Delete version",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Versions#DELETE",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { version_id: { type: "integer" } },
      required: ["version_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getWikiPages",
    namespace: "wiki",
    verb: "list",
    title: "List wiki pages",
    description: "",
    docsUrl:
      "https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Getting-the-pages-list-of-a-wiki",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outWikiPageSummary, $schema: DRAFT } },
  },
  {
    id: "getWikiPage",
    namespace: "wiki",
    verb: "get",
    title: "Show wiki page",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Getting-a-wiki-page",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        wiki_page_title: { type: "string" },
        include: {
          type: "array",
          items: { type: "string", enum: ["attachments"] },
          description:
            "Comma-separated list of associated data to include in the response.\nValues: `attachments` (file attachments)",
        },
      },
      required: ["project_id", "wiki_page_title"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outWikiPage, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateWikiPage",
    namespace: "wiki",
    verb: "update",
    title: "Create or update wiki page",
    description: "",
    docsUrl:
      "https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Creating-or-updating-a-wiki-page",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        wiki_page_title: { type: "string" },
        text: { type: "string" },
        comments: { type: "string" },
        version: {
          description:
            "Content version for optimistic locking. If specified and it does not match the current version, the server returns 409 Conflict to prevent overwriting concurrent changes.",
          type: "integer",
        },
        parent_title: {
          description:
            "Title of the parent wiki page. Sets this page as a child in the page hierarchy.",
          type: "string",
        },
        title: {
          description:
            "New title for the page (rename). Requires the rename_wiki_pages permission.",
          type: "string",
        },
        redirect_existing_links: {
          description:
            'When renaming with title, controls whether the old title keeps redirecting to the new one. Only the string "0" disables the redirect; any other value (including boolean false) leaves it enabled.',
          type: "string",
          enum: ["0", "1"],
        },
        is_start_page: {
          description:
            "Make this page the start page of the wiki. Requires the manage_wiki permission.",
          type: "boolean",
        },
        deleted_attachment_ids: { type: "array", items: { type: "integer" } },
        uploads: inUploads,
      },
      required: ["project_id", "wiki_page_title", "text"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outWikiPage, $schema: DRAFT }, optional: true },
  },
  {
    id: "deleteWikiPage",
    namespace: "wiki",
    verb: "delete",
    title: "Delete wiki page",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Deleting-a-wiki-page",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        wiki_page_title: { type: "string" },
      },
      required: ["project_id", "wiki_page_title"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getWikiPageByVersion",
    namespace: "wiki",
    verb: "getVersion",
    title: "Show wiki page by specific version",
    description: "",
    docsUrl:
      "https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Getting-an-old-version-of-a-wiki-page",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        wiki_page_title: { type: "string" },
        version_id: { type: "integer" },
        include: {
          type: "array",
          items: { type: "string", enum: ["attachments"] },
          description:
            "Comma-separated list of associated data to include in the response.\nValues: `attachments` (file attachments)",
        },
      },
      required: ["project_id", "wiki_page_title", "version_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outWikiPage, $schema: DRAFT }, optional: false },
  },
  {
    id: "getQueries",
    namespace: "queries",
    verb: "list",
    title: "List queries",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Queries#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outQuery, $schema: DRAFT } },
  },
  {
    id: "getAttachment",
    namespace: "attachments",
    verb: "get",
    title: "Show attachment",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Attachments#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { attachment_id: { type: "integer" } },
      required: ["attachment_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outAttachment, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateAttachment",
    namespace: "attachments",
    verb: "update",
    title: "Update attachment",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Attachments#PATCH",
    method: "PATCH",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        attachment_id: { type: "integer" },
        filename: { type: "string" },
        content_type: { type: "string" },
        description: { type: "string" },
      },
      required: ["attachment_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteAttachment",
    namespace: "attachments",
    verb: "delete",
    title: "Delete attachment",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Attachments#DELETE",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { attachment_id: { type: "integer" } },
      required: ["attachment_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getIssueStatuses",
    namespace: "issueStatuses",
    verb: "list",
    title: "List issue statuses",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueStatuses#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: { $schema: DRAFT, type: "object", properties: {}, additionalProperties: false },
    output: { kind: "list", schema: { ...outIssueStatus, $schema: DRAFT } },
  },
  {
    id: "getTrackers",
    namespace: "trackers",
    verb: "list",
    title: "List trackers",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Trackers#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: { $schema: DRAFT, type: "object", properties: {}, additionalProperties: false },
    output: { kind: "list", schema: { ...outTracker, $schema: DRAFT } },
  },
  {
    id: "getIssueCategories",
    namespace: "issueCategories",
    verb: "list",
    title: "List issue categories",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outIssueCategory, $schema: DRAFT } },
  },
  {
    id: "createIssueCategory",
    namespace: "issueCategories",
    verb: "create",
    title: "Create issue category",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#POST",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        name: { type: "string" },
        assigned_to_id: { type: "integer" },
      },
      required: ["project_id", "name"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outIssueCategory, $schema: DRAFT }, optional: false },
  },
  {
    id: "getIssuePriorities",
    namespace: "enumerations",
    verb: "listIssuePriorities",
    title: "List issue priorities",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Enumerations#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: { $schema: DRAFT, type: "object", properties: {}, additionalProperties: false },
    output: { kind: "list", schema: { ...outIssuePriority, $schema: DRAFT } },
  },
  {
    id: "getTimeEntryActivities",
    namespace: "enumerations",
    verb: "listTimeEntryActivities",
    title: "List time entry activities",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Enumerations#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: { $schema: DRAFT, type: "object", properties: {}, additionalProperties: false },
    output: { kind: "list", schema: { ...outTimeEntryActivity, $schema: DRAFT } },
  },
  {
    id: "getDocumentCategories",
    namespace: "enumerations",
    verb: "listDocumentCategories",
    title: "List document categories",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Enumerations#GET-3",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: { $schema: DRAFT, type: "object", properties: {}, additionalProperties: false },
    output: { kind: "list", schema: { ...outDocumentCategory, $schema: DRAFT } },
  },
  {
    id: "getIssueCategory",
    namespace: "issueCategories",
    verb: "get",
    title: "Show issue category",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { issue_category_id: { type: "integer" } },
      required: ["issue_category_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outIssueCategory, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateIssueCategory",
    namespace: "issueCategories",
    verb: "update",
    title: "Update issue category",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#PUT",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        issue_category_id: { type: "integer" },
        name: { type: "string" },
        assigned_to_id: { type: "integer" },
      },
      required: ["issue_category_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteIssueCategory",
    namespace: "issueCategories",
    verb: "delete",
    title: "Delete issue category",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#DELETE",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        issue_category_id: { type: "integer" },
        reassign_to_id: {
          type: "integer",
          description:
            "ID of another issue category to reassign issues to before deleting this category.\nIf the category has associated issues and this parameter is not provided, the issues will have their category unset.",
        },
      },
      required: ["issue_category_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getRoles",
    namespace: "roles",
    verb: "list",
    title: "List roles",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Roles#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: { $schema: DRAFT, type: "object", properties: {}, additionalProperties: false },
    output: { kind: "list", schema: { ...outIdName, $schema: DRAFT } },
  },
  {
    id: "getRole",
    namespace: "roles",
    verb: "get",
    title: "Show role",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Roles#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { role_id: { type: "integer" } },
      required: ["role_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outRole, $schema: DRAFT }, optional: false },
  },
  {
    id: "getGroups",
    namespace: "groups",
    verb: "list",
    title: "List groups",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Groups#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        builtin: {
          type: "string",
          enum: ["1"],
          description:
            'Include built-in groups (e.g., "Anonymous", "Non member") in the response.\nSet to `1` to include built-in groups. Without this parameter, only user-created groups are returned.',
        },
      },
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outGroupSummary, $schema: DRAFT } },
  },
  {
    id: "createGroup",
    namespace: "groups",
    verb: "create",
    title: "Create group",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Groups#POST",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        name: { type: "string" },
        user_ids: {
          description: "User IDs to add as members of this group.",
          type: "array",
          items: { type: "integer" },
        },
        twofa_required: {
          description: "Require two-factor authentication for all members of this group.",
          type: "boolean",
        },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
      },
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outGroup, $schema: DRAFT }, optional: false },
  },
  {
    id: "getGroup",
    namespace: "groups",
    verb: "get",
    title: "Show group",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Groups#GET-2",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        group_id: { type: "integer" },
        include: {
          type: "array",
          items: { type: "string", enum: ["users", "memberships"] },
          description:
            "Comma-separated list of associated data to include in the response.\nValues: `users` (list of users in the group), `memberships` (project memberships with roles)",
        },
      },
      required: ["group_id"],
      additionalProperties: false,
    },
    output: { kind: "item", schema: { ...outGroup, $schema: DRAFT }, optional: false },
  },
  {
    id: "updateGroup",
    namespace: "groups",
    verb: "update",
    title: "Update group",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Groups#PUT",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        group_id: { type: "integer" },
        name: { type: "string" },
        user_ids: { type: "array", items: { type: "integer" } },
        twofa_required: { type: "boolean" },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
      },
      required: ["group_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "deleteGroup",
    namespace: "groups",
    verb: "delete",
    title: "Delete group",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Groups#DELETE",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { group_id: { type: "integer" } },
      required: ["group_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "addUserToGroup",
    namespace: "groups",
    verb: "addUser",
    title: "Add user to group",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Groups#POST-2",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { group_id: { type: "integer" }, user_id: { type: "integer" } },
      required: ["group_id", "user_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "removeUsersFromGroup",
    namespace: "groups",
    verb: "removeUsers",
    title: "Remove users from group",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Groups",
    method: "DELETE",
    safety: "idempotent",
    since: "7.0",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        group_id: { type: "integer" },
        user_ids: { type: "array", items: { type: "integer" } },
      },
      required: ["group_id", "user_ids"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "removeUserFromGroup",
    namespace: "groups",
    verb: "removeUser",
    title: "Remove user from group",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Groups#DELETE-2",
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { group_id: { type: "integer" }, user_id: { type: "integer" } },
      required: ["group_id", "user_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getCustomFields",
    namespace: "customFields",
    verb: "list",
    title: "List custom fields",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_CustomFields#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: { $schema: DRAFT, type: "object", properties: {}, additionalProperties: false },
    output: { kind: "list", schema: { ...outCustomField, $schema: DRAFT } },
  },
  {
    id: "getSearch",
    namespace: "search",
    verb: "list",
    title: "Search",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Search#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Search query string. Tokenized into words for matching.\nWhen `all_words` is enabled (default), all tokens must match. Otherwise, any token can match.",
        },
        scope: {
          type: "string",
          enum: ["all", "my_projects", "bookmarks", "subprojects"],
          description:
            "Search scope.\nValues: `all` (all projects), `my_projects` (projects where current user is a member), `bookmarks` (bookmarked projects), `subprojects` (include subprojects, only effective for project-scoped search)",
        },
        all_words: {
          type: "string",
          description:
            "Require all words to match. Default is `true` (all words must match).\nSet to empty string to disable (any word matches). Any non-empty value enables this option.",
        },
        titles_only: {
          type: "string",
          description:
            "Search titles only. Default is `false`.\nAny non-empty value enables this option.",
        },
        issues: {
          type: "integer",
          enum: [1],
          description:
            "Include issues in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        news: {
          type: "integer",
          enum: [1],
          description:
            "Include news in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        wiki_pages: {
          type: "integer",
          enum: [1],
          description:
            "Include wiki pages in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        projects: {
          type: "integer",
          enum: [1],
          description:
            "Include projects in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.\nNot available when searching within a specific project.",
        },
        documents: {
          type: "integer",
          enum: [1],
          description:
            "Include documents in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        changesets: {
          type: "integer",
          enum: [1],
          description:
            "Include changesets in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        messages: {
          type: "integer",
          enum: [1],
          description:
            "Include forum messages in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        open_issues: {
          type: "string",
          description:
            "Only return open issues. Default is `false`.\nAny non-empty value enables this option.",
        },
        attachments: {
          type: "string",
          enum: ["0", "1", "only"],
          description:
            "Search attachments. Default is `0` (do not search attachments).\nValues: `0` (disabled), `1` (search attachments and content), `only` (search attachments only)",
        },
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      required: ["q"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outSearch, $schema: DRAFT } },
  },
  {
    id: "getSearchByProject",
    namespace: "search",
    verb: "listByProject",
    title: "Search within project",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Search#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        q: {
          type: "string",
          description:
            "Search query string. Tokenized into words for matching.\nWhen `all_words` is enabled (default), all tokens must match. Otherwise, any token can match.",
        },
        scope: {
          type: "string",
          enum: ["subprojects"],
          description:
            "Search scope.\nValues: `subprojects` (include subprojects of the specified project)\nWhen not specified, only the specified project is searched.",
        },
        all_words: {
          type: "string",
          description:
            "Require all words to match. Default is `true` (all words must match).\nSet to empty string to disable (any word matches). Any non-empty value enables this option.",
        },
        titles_only: {
          type: "string",
          description:
            "Search titles only. Default is `false`.\nAny non-empty value enables this option.",
        },
        issues: {
          type: "integer",
          enum: [1],
          description:
            "Include issues in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        news: {
          type: "integer",
          enum: [1],
          description:
            "Include news in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        wiki_pages: {
          type: "integer",
          enum: [1],
          description:
            "Include wiki pages in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        documents: {
          type: "integer",
          enum: [1],
          description:
            "Include documents in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        changesets: {
          type: "integer",
          enum: [1],
          description:
            "Include changesets in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        messages: {
          type: "integer",
          enum: [1],
          description:
            "Include forum messages in search results. Any non-empty value enables this search type.\nIf no search type parameters are specified, all types are searched.",
        },
        open_issues: {
          type: "string",
          description:
            "Only return open issues. Default is `false`.\nAny non-empty value enables this option.",
        },
        attachments: {
          type: "string",
          enum: ["0", "1", "only"],
          description:
            "Search attachments. Default is `0` (do not search attachments).\nValues: `0` (disabled), `1` (search attachments and content), `only` (search attachments only)",
        },
        pageSize: {
          description: "Items per request. Default 100, the server maximum.",
          type: "integer",
          minimum: 1,
        },
      },
      required: ["project_id", "q"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outSearch, $schema: DRAFT } },
  },
  {
    id: "getFiles",
    namespace: "files",
    verb: "list",
    title: "List files",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Files#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: { project_id: { anyOf: [{ type: "integer" }, { type: "string" }] } },
      required: ["project_id"],
      additionalProperties: false,
    },
    output: { kind: "list", schema: { ...outFile, $schema: DRAFT } },
  },
  {
    id: "createFile",
    namespace: "files",
    verb: "create",
    title: "Create file",
    description:
      "An invalid or unknown upload token results in 404, not 400 — the controller's 400 render references an API template that does not exist, and the MissingTemplate handler responds with 404.",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Files#POST",
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        token: { type: "string" },
        version_id: { type: "integer" },
        filename: { type: "string" },
        description: { type: "string" },
        content_type: { type: "string" },
      },
      required: ["project_id", "token"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "getMyAccount",
    namespace: "myAccount",
    verb: "get",
    title: "Show my account",
    description: "",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_MyAccount#GET",
    method: "GET",
    safety: "read",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: { $schema: DRAFT, type: "object", properties: {}, additionalProperties: false },
    output: {
      kind: "item",
      schema: {
        type: "object",
        properties: {
          id: { type: "integer" },
          login: { type: "string" },
          admin: { type: "boolean" },
          firstname: { type: "string" },
          lastname: { type: "string" },
          mail: { type: "string" },
          created_on: { type: "string", format: "date-time" },
          last_login_on: { type: ["string", "null"], format: "date-time" },
          api_key: {
            description: "Not returned when the request is authenticated via OAuth.",
            type: "string",
          },
          custom_fields: { type: "array", items: outCustomFieldValue },
        },
        required: [
          "id",
          "login",
          "admin",
          "firstname",
          "lastname",
          "mail",
          "created_on",
          "last_login_on",
        ],
        $schema: DRAFT,
      },
      optional: false,
    },
  },
  {
    id: "updateMyAccount",
    namespace: "myAccount",
    verb: "update",
    title: "Update my account",
    description:
      "Requests authenticated via OAuth are rejected with 403, regardless of the token's scopes.",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_MyAccount#PUT",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        login: { type: "string" },
        admin: { type: "boolean" },
        firstname: { type: "string" },
        lastname: { type: "string" },
        mail: { type: "string" },
        language: { type: "string" },
        auth_source_id: { type: ["integer", "null"] },
        mail_notification: {
          type: "string",
          enum: ["all", "selected", "only_my_events", "only_assigned", "only_owner", "none"],
        },
        notified_project_ids: { type: "array", items: { type: "integer" } },
        must_change_passwd: { type: "boolean" },
        generate_password: { type: "boolean" },
        status: { type: "integer" },
        custom_fields: inCustomFields,
        custom_field_values: inCustomFieldValues,
        group_ids: { type: "array", items: { type: "integer" } },
        pref: inPref,
      },
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "updateJournal",
    namespace: "journals",
    verb: "update",
    title: "Update journal",
    description:
      "A journal left with empty `notes` and no property changes (`details`) is kept and can still be updated, but is omitted from the issue's `include=journals` response until it has notes again.",
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_Journals#Updating-a-journal",
    method: "PUT",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        journal_id: { type: "integer" },
        notes: { type: ["string", "null"] },
        private_notes: {
          description:
            'Mark the journal notes as private. Only visible to users with the "View private notes" permission.',
          type: "boolean",
        },
      },
      required: ["journal_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "addRelatedIssue",
    namespace: "repositories",
    verb: "addRelatedIssue",
    title: "Add related issue",
    description: "Undocumented: This operation is not listed in the official documentation.",
    docsUrl: null,
    method: "POST",
    safety: "write",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        repository_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        revision: { type: "string" },
        issue_id: { type: "integer" },
      },
      required: ["project_id", "repository_id", "revision", "issue_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
  {
    id: "removeRelatedIssue",
    namespace: "repositories",
    verb: "removeRelatedIssue",
    title: "Remove related issue",
    description: "Undocumented: This operation is not listed in the official documentation.",
    docsUrl: null,
    method: "DELETE",
    safety: "idempotent",
    since: "6.1",
    until: null,
    stability: "alpha",
    inputSchema: {
      $schema: DRAFT,
      type: "object",
      properties: {
        project_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        repository_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
        revision: { type: "string" },
        issue_id: { type: "integer" },
      },
      required: ["project_id", "repository_id", "revision", "issue_id"],
      additionalProperties: false,
    },
    output: { kind: "empty" },
  },
];
