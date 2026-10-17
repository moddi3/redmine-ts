// Hand-written generator input. The only place a human decides anything per operation.
// generate.ts fails on: an operation whose derived namespace.verb collides or cannot be derived,
// an override naming an unknown operation, or unacknowledged non-additive drift.

/** Default rule: tag -> camelCase namespace ("Time Entries" -> timeEntries, "Project Memberships" -> memberships);
 *  getXs -> list, getX -> get, createX -> create, updateX -> update, deleteX -> delete, otherwise
 *  the operationId minus the resource noun (archiveProject -> archive, addWatcher -> addWatcher). */
export const verbs: Record<string, readonly [namespace: string, verb: string]> = {
  getIssuesByProject: ['issues', 'listInProject'],
  createIssueUnderProject: ['issues', 'createInProject'],
  getTimeEntriesByProject: ['timeEntries', 'listInProject'],
  createTimeEntryUnderProject: ['timeEntries', 'createInProject'],
  createTimeEntryUnderIssue: ['timeEntries', 'createOnIssue'],
  getNewsListByProject: ['news', 'listInProject'],
  getCurrentUser: ['users', 'current'],
  getMyAccount: ['myAccount', 'get'],
  uploadAttachmentFile: ['attachments', 'upload'],
  downloadAttachmentFile: ['attachments', 'download'],
  downloadThumbnail: ['attachments', 'thumbnail'],
  removeUsersFromGroup: ['groups', 'removeUsers'],
  getSearch: ['search', 'list'],
  getSearchByProject: ['search', 'listInProject'],
  // ...
}

/** Method-derived default: GET/PUT/DELETE/PATCH 'safe', POST 'never'. */
export const retry: Record<string, 'never' | { readonly unlessFields: readonly string[] }> = {
  updateIssue: { unlessFields: ['notes', 'uploads'] },
  updateWikiPage: 'never', // a replay may create a second page version (unverified; see open questions)
}

/** Field-specific names for symbols that mean different things per field. */
export const operatorAliases: Record<string, Readonly<Record<string, string>>> = {
  parent_id: { '~': 'descendantOf' },
  child_id: { '~': 'ancestorOf' },
}

/** Non-additive drift the maintainer has reviewed, with the SDK major that ships it. */
export const acknowledgedDrift: readonly { readonly change: string; readonly sdkMajor: number }[] = []
