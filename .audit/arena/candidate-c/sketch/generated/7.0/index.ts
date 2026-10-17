// Excerpt of what scripts/gen.ts emits for one edition, collapsed into one file for the sketch.
// Real output: types.ts, operations.ts, registry.ts, schemas.ts, index.ts (this edition's public entry).

// ---- types.ts --------------------------------------------------------------------------
export interface IdName {
  id: number
  name: string
}

export interface CustomFieldValue {
  id: number
  name: string
  multiple?: boolean
  value: string | null | string[]
}

/**
 * @stability stable
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues
 */
export interface Issue {
  id: number
  project?: IdName
  tracker?: IdName
  status?: { id: number; name: string; is_closed: boolean }
  subject: string
  description: string | null
  start_date: string | null
  due_date: string | null
  done_ratio: number
  is_private: boolean
  estimated_hours: number | null
  created_on: string
  updated_on: string
  closed_on: string | null
  custom_fields?: CustomFieldValue[]
  journals?: Journal[]
  allowed_statuses?: { id: number; name: string; is_closed: boolean }[]
  // … remaining properties
}

export interface Journal {
  id: number
  notes: string
  created_on: string
  updated_on: string
  private_notes: boolean
  /** Ids inside `old_value` / `new_value` are strings on the wire. */
  details: { property: string; name: string; old_value: string | null; new_value: string | null }[]
}

export interface CustomField {
  id: number
  name: string
  /** @since 7.0 */
  is_for_all: boolean
  /** @since 7.0 Only returned for date custom fields. */
  default_value_mode?: 'fixed_date' | 'date_offset'
  /** @since 7.0 */
  projects?: IdName[]
  // …
}

/** Binary request bodies accept any of these. */
export type BinaryBody = Blob | Uint8Array | ReadableStream<Uint8Array>

// ---- operations.ts ---------------------------------------------------------------------
type IssueInclude = 'children' | 'attachments' | 'relations' | 'changesets' | 'journals' | 'watchers' | 'allowed_statuses'

/** A type alias, not an interface: aliases get the implicit index signature `OperationMap` needs. */
export type Operations = {
  getIssue: {
    input: { issue_id: number; include?: readonly IssueInclude[] }
    output: { issue: Issue }
  }
  getIssues: {
    input: {
      offset?: number
      limit?: number
      sort?: string
      include?: readonly ('attachments' | 'relations')[]
      issue_id?: string
      project_id?: string
      status_id?: string
      assigned_to_id?: string
      cf_x?: { readonly [cf: `cf_${number}`]: string }
      // … every query param, raw Redmine operator strings
    }
    output: { issues: Issue[]; total_count: number; offset: number; limit: number }
    item: Issue
  }
  updateIssue: {
    input: { issue_id: number; issue: { subject?: string; status_id?: number; notes?: string; uploads?: readonly { token: string; filename?: string; content_type?: string }[] /* … */ } }
    output: void
  }
  uploadAttachmentFile: {
    input: { filename?: string; content_type?: string; body: BinaryBody }
    output: { upload: { id: number; token: string } }
  }
  /** @since 7.0 */
  removeUsersFromGroup: {
    input: { group_id: number; 'user_ids[]': readonly number[] }
    output: void
  }
  // … ~94 operations
}

// ---- registry.ts -----------------------------------------------------------------------
import type { Registry } from '../../core/operation'

export const operations = {
  getIssue: {
    id: 'getIssue',
    method: 'GET',
    path: '/issues/{issue_id}',
    format: true,
    pathParams: ['issue_id'],
    query: [{ name: 'include', encoding: 'csv' }],
    body: null,
    bodyKeys: [],
    response: 'json',
    list: null,
    since: '1.0',
    stability: 'stable',
    hints: { readOnly: true, destructive: false, idempotent: true },
    summary: 'Show issue',
  },
  removeUsersFromGroup: {
    id: 'removeUsersFromGroup',
    method: 'DELETE',
    path: '/groups/{group_id}/users',
    format: true,
    pathParams: ['group_id'],
    query: [{ name: 'user_ids[]', encoding: 'brackets' }],
    body: null,
    bodyKeys: [],
    response: 'empty',
    list: null,
    since: '7.0',
    stability: 'alpha',
    hints: { readOnly: false, destructive: true, idempotent: true },
    summary: 'Remove users from group',
  },
  // …
} as const satisfies Registry<Operations>

// ---- schemas.ts (not re-exported from the edition entry; reached via /versions/schemas) ----
export const inputSchemas = {
  getIssue: {
    type: 'object',
    required: ['issue_id'],
    additionalProperties: false,
    properties: {
      issue_id: { type: 'integer' },
      include: { type: 'array', items: { enum: ['children', 'attachments', 'relations', 'changesets', 'journals', 'watchers', 'allowed_statuses'] } },
    },
  },
  // …
} as const satisfies { readonly [K in keyof Operations]: object }

// ---- index.ts: the `redmine-ts-sdk/7.0` entry ------------------------------------------
import { createRedmineClient, type RedmineClient } from '../../core/client'
import type { RedmineConfig } from '../../core/transport'

export type Redmine = RedmineClient<'7.0', Operations>

export function createRedmine(config: RedmineConfig): Redmine {
  return createRedmineClient('7.0', operations, config)
}

export type { RedmineConfig, CallOptions, Auth } from '../../core/transport'
export type { IssueWhere, TimeEntryWhere } from '../../core/where'
export { RedmineError, isRedmineError } from '../../core/errors'
