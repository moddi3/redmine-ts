// src/facade/*.ts — hand-written once, instantiated per edition through `O`.
// Each `*Ops` interface is the structural floor the facade relies on. A generated `Operations`
// that stops satisfying it fails to compile in that edition's entry, naming the broken operation.
import type { RedmineCore, PaginateOptions } from '../core/client'
import type { CallOptions } from '../core/transport'
import type { IssueWhere, TimeEntryWhere } from '../core/where'
import type { OperationMap } from '../core/operation'

type Entity = { readonly id: number }

export interface IssuesOps extends OperationMap {
  getIssues: { input: { sort?: string; offset?: number; limit?: number }; output: unknown; item: Entity }
  getIssue: { input: { issue_id: number; include?: readonly string[] }; output: { issue: Entity } }
  createIssue: { input: { issue: object }; output: { issue: Entity } }
  updateIssue: { input: { issue_id: number; issue: object }; output: unknown }
  deleteIssue: { input: { issue_id: number }; output: unknown }
}
export interface ProjectsOps extends OperationMap {
  getProjects: { input: { offset?: number; limit?: number }; output: unknown; item: Entity }
  getProject: { input: { project_id: number | string; include?: readonly string[] }; output: { project: Entity } }
  createProject: { input: { project: object }; output: { project: Entity } }
  updateProject: { input: { project_id: number | string; project: object }; output: unknown }
  deleteProject: { input: { project_id: number | string }; output: unknown }
}
export interface UsersOps extends OperationMap {
  getUsers: { input: { offset?: number; limit?: number }; output: unknown; item: Entity }
  getUser: { input: { user_id: number; include?: readonly string[] }; output: { user: Entity } }
  getCurrentUser: { input: object; output: { user: Entity } }
  createUser: { input: { user: object }; output: { user: Entity } }
  updateUser: { input: { user_id: number; user: object }; output: unknown }
  deleteUser: { input: { user_id: number }; output: unknown }
}
export interface TimeEntriesOps extends OperationMap {
  getTimeEntries: { input: { offset?: number; limit?: number }; output: unknown; item: Entity }
  getTimeEntry: { input: { time_entry_id: number }; output: { time_entry: Entity } }
  createTimeEntry: { input: { time_entry: object }; output: { time_entry: Entity } }
  updateTimeEntry: { input: { time_entry_id: number; time_entry: object }; output: unknown }
  deleteTimeEntry: { input: { time_entry_id: number }; output: unknown }
}
export interface AttachmentsOps extends OperationMap {
  uploadAttachmentFile: { input: { filename?: string; content_type?: string }; output: { upload: { id: number; token: string } } }
  getAttachment: { input: { attachment_id: number }; output: { attachment: Entity } }
}
export type FacadeOps = IssuesOps & ProjectsOps & UsersOps & TimeEntriesOps & AttachmentsOps

/** Narrows properties named by `include` to present. `include: ['journals']` makes `journals` non-optional. */
export type WithIncluded<T, I extends string> = T & { readonly [K in I & keyof T]-?: NonNullable<T[K]> }

type Out<O extends OperationMap, K extends keyof O> = O[K]['output']
type In<O extends OperationMap, K extends keyof O> = O[K]['input']
type IssueOf<O extends IssuesOps> = Out<O, 'getIssue'>['issue']
type IssueInclude<O extends IssuesOps> = NonNullable<In<O, 'getIssue'>['include']>[number]

export interface IssueListQuery<O extends IssuesOps> {
  readonly where?: IssueWhere
  readonly sort?: string
  readonly include?: In<O, 'getIssues'> extends { include?: infer I } ? I : never
}

export interface IssuesFacade<O extends IssuesOps> {
  get<I extends IssueInclude<O> = never>(
    id: number,
    opts?: CallOptions & { readonly include?: readonly I[] },
  ): Promise<WithIncluded<IssueOf<O>, I & string>>
  /** Async iterable of items; pages of 100. `strategy: 'keyset'` for full exports that must not skip rows. */
  list(query?: IssueListQuery<O>, opts?: PaginateOptions): AsyncIterable<NonNullable<O['getIssues']['item']>>
  create(issue: In<O, 'createIssue'>['issue'], opts?: CallOptions): Promise<IssueOf<O>>
  /** Redmine answers 204; there is no updated issue to return. */
  update(id: number, changes: In<O, 'updateIssue'>['issue'], opts?: CallOptions): Promise<void>
  delete(id: number, opts?: CallOptions): Promise<void>
}

export interface ProjectsFacade<O extends ProjectsOps> {
  get(idOrIdentifier: number | string, opts?: CallOptions & { readonly include?: In<O, 'getProject'>['include'] }): Promise<Out<O, 'getProject'>['project']>
  list(opts?: PaginateOptions): AsyncIterable<NonNullable<O['getProjects']['item']>>
  create(project: In<O, 'createProject'>['project'], opts?: CallOptions): Promise<Out<O, 'createProject'>['project']>
  update(idOrIdentifier: number | string, changes: In<O, 'updateProject'>['project'], opts?: CallOptions): Promise<void>
  delete(idOrIdentifier: number | string, opts?: CallOptions): Promise<void>
}

export interface UsersFacade<O extends UsersOps> {
  get(id: number | 'current', opts?: CallOptions): Promise<Out<O, 'getUser'>['user']>
  list(opts?: PaginateOptions): AsyncIterable<NonNullable<O['getUsers']['item']>>
  create(user: In<O, 'createUser'>['user'], opts?: CallOptions): Promise<Out<O, 'createUser'>['user']>
  update(id: number, changes: In<O, 'updateUser'>['user'], opts?: CallOptions): Promise<void>
  delete(id: number, opts?: CallOptions): Promise<void>
}

export interface TimeEntriesFacade<O extends TimeEntriesOps> {
  get(id: number, opts?: CallOptions): Promise<Out<O, 'getTimeEntry'>['time_entry']>
  list(query?: { readonly where?: TimeEntryWhere }, opts?: PaginateOptions): AsyncIterable<NonNullable<O['getTimeEntries']['item']>>
  create(entry: In<O, 'createTimeEntry'>['time_entry'], opts?: CallOptions): Promise<Out<O, 'createTimeEntry'>['time_entry']>
  update(id: number, changes: In<O, 'updateTimeEntry'>['time_entry'], opts?: CallOptions): Promise<void>
  delete(id: number, opts?: CallOptions): Promise<void>
}

/** Element of an `uploads[]` array on issue, project-file, or wiki writes. */
export interface UploadRef {
  readonly token: string
  readonly filename: string
  readonly content_type?: string
  readonly description?: string
}

export interface UploadsFacade {
  /**
   * Step one of Redmine's two-step attach. Body is sent as application/octet-stream (anything else is 406).
   * `content_type` defaults to `Blob.type`. Over the server's size limit → `validation` error (422).
   */
  create(
    data: Blob | Uint8Array | ReadableStream<Uint8Array>,
    meta: { readonly filename: string; readonly content_type?: string; readonly description?: string },
    opts?: CallOptions,
  ): Promise<UploadRef>
}

export interface AttachmentsFacade<O extends AttachmentsOps> {
  get(id: number, opts?: CallOptions): Promise<Out<O, 'getAttachment'>['attachment']>
  /** Streams from `${baseUrl}attachments/download/{id}/{filename}`; never follows the absolute `content_url`. */
  download(
    attachment: { readonly id: number; readonly filename: string },
    opts?: CallOptions,
  ): Promise<{ readonly body: ReadableStream<Uint8Array>; readonly contentType: string | null; readonly size: number | null }>
}

export function createIssuesFacade<O extends IssuesOps>(core: RedmineCore<never, O>): IssuesFacade<O> {
  // TODO:
  //   get:    core.call('getIssue', { issue_id, include }, opts).then(r => r.issue)
  //   list:   core.paginate('getIssues', { ...compileIssueWhere(where), sort, include }, opts)
  //           where.project → project_id query param (spec's /issues accepts project_id filter)
  //   create: core.call('createIssue', { issue }).then(r => r.issue)
  //   update/delete: core.call(...).then(() => undefined)
  throw new Error('not implemented')
}
