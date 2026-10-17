// Package entry `redmine-ts-sdk`. The whole public runtime surface: createRedmine, RedmineError, raw.

export { createRedmine } from './client.ts'
export type { Redmine, RedmineOptions, CallOptions, Auth, Method } from './client.ts'
export { RedmineError } from './errors.ts'
export type { Problem } from './errors.ts'
export { raw } from './filters.ts'
export type { Filter, DateFilter, OperatorName } from './filters.ts'
export type { Listing, Page } from './listing.ts'
export type { Download, FileInput, UploadToken } from './files.ts'
export type { RedmineEvent } from './execute.ts'
export type { RedmineVersion } from './generated/versions.ts'
export type { OperationId, Operations } from './generated/operations.ts'
export type * from './generated/model.ts'

// Not exported: def.ts, registry.ts, request.ts, execute internals. package.json `exports`
// lists only ".", "./operations", "./schemas", "./testing", so deep imports fail to resolve.
