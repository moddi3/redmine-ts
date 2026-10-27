import type { AnyOp, SlotTable } from "../../../src/core/op.ts";

const defaults = {
  pathParams: [],
  query: {},
  filters: {},
  customFieldFilters: false,
  body: null,
  includes: [],
  since: "6.1",
  until: null,
  safety: "read",
  stability: "stable",
} as const;

function op(fields: Pick<AnyOp, "id" | "method" | "path" | "response"> & Partial<AnyOp>): AnyOp {
  return { ...defaults, ...fields };
}

export const getIssue = op({
  id: "getIssue",
  method: "GET",
  path: "issues/{issue_id}.json",
  pathParams: ["issue_id"],
  query: { include: "csv" },
  includes: ["journals", "allowed_statuses", "attachments"],
  response: { kind: "item", unwrap: "issue" },
});

export const getIssues = op({
  id: "getIssues",
  method: "GET",
  path: "issues.json",
  query: { include: "csv" },
  filters: {
    project_id: { ops: ["=", "!"] },
    category_id: { ops: ["=", "!", "*", "!*"] },
    status_id: {
      ops: ["=", "!", "o", "c", "*"],
      words: { open: "o", closed: "c", any: "*" },
    },
    assigned_to_id: { ops: ["=", "!", "*", "!*"] },
    updated_on: { ops: ["=", ">=", "<=", "><", "<t-", "!*", "*"] },
    subject: { ops: ["=", "~", "!~", "^", "$"] },
    issue_id: { ops: ["=", "!", ">="], join: "," },
    done_ratio: { ops: ["=", ">=", "><"], join: "," },
  },
  customFieldFilters: true,
  response: { kind: "list", items: "issues", paged: true, keyset: { param: "issue_id" } },
});

export const getIssueStatuses = op({
  id: "getIssueStatuses",
  method: "GET",
  path: "issue_statuses.json",
  response: { kind: "list", items: "issue_statuses", paged: false },
});

export const getProjects = op({
  id: "getProjects",
  method: "GET",
  path: "projects.json",
  response: { kind: "list", items: "projects", paged: true },
});

export const getTimeEntry = op({
  id: "getTimeEntry",
  method: "GET",
  path: "time_entries/{time_entry_id}.json",
  pathParams: ["time_entry_id"],
  response: { kind: "item", unwrap: "time_entry" },
});

export const getTimeEntries = op({
  id: "getTimeEntries",
  method: "GET",
  path: "time_entries.json",
  filters: { project_id: { ops: ["=", "!"] } },
  response: { kind: "list", items: "time_entries", paged: true },
});

export const updateIssue = op({
  id: "updateIssue",
  method: "PUT",
  path: "issues/{issue_id}.json",
  pathParams: ["issue_id"],
  body: {
    kind: "json",
    envelope: "issue",
    siblings: [],
    clear: ["assigned_to_id"],
    uploads: "uploads",
  },
  response: { kind: "empty" },
  safety: "write",
});

export const createIssue = op({
  id: "createIssue",
  method: "POST",
  path: "issues.json",
  body: { kind: "json", envelope: "issue", siblings: [], uploads: "uploads" },
  response: { kind: "item", unwrap: "issue" },
  safety: "write",
});

export const createNews = op({
  id: "createNews",
  method: "POST",
  path: "projects/{project_id}/news.json",
  pathParams: ["project_id"],
  body: { kind: "json", envelope: "news", siblings: [], uploads: "uploads" },
  response: { kind: "empty" },
  safety: "write",
});

export const updateWikiPage = op({
  id: "updateWikiPage",
  method: "PUT",
  path: "projects/{project_id}/wiki/{wiki_page_title}.json",
  pathParams: ["project_id", "wiki_page_title"],
  body: { kind: "json", envelope: "wiki_page", siblings: [], uploads: "uploads" },
  response: { kind: "item", unwrap: "wiki_page" },
  safety: "write",
});

/** An upload-taking operation newer than the oldest version, like a future Documents API. */
export const createDocument = op({
  id: "createDocument",
  method: "POST",
  path: "projects/{project_id}/documents.json",
  pathParams: ["project_id"],
  body: { kind: "json", envelope: "document", siblings: [], uploads: "uploads" },
  response: { kind: "item", unwrap: "document" },
  since: "7.0",
  safety: "write",
});

export const createUser = op({
  id: "createUser",
  method: "POST",
  path: "users.json",
  body: { kind: "json", envelope: "user", siblings: ["send_information"] },
  response: { kind: "item", unwrap: "user" },
  safety: "write",
});

export const deleteIssue = op({
  id: "deleteIssue",
  method: "DELETE",
  path: "issues/{issue_id}.json",
  pathParams: ["issue_id"],
  response: { kind: "empty" },
  safety: "idempotent",
});

export const removeUsersFromGroup = op({
  id: "removeUsersFromGroup",
  method: "DELETE",
  path: "groups/{group_id}/users.json",
  pathParams: ["group_id"],
  query: { user_ids: "brackets" },
  response: { kind: "empty" },
  since: "7.0",
  safety: "idempotent",
});

export const addWatcher = op({
  id: "addWatcher",
  method: "POST",
  path: "issues/{issue_id}/watchers.json",
  pathParams: ["issue_id"],
  body: { kind: "json", envelope: null, siblings: [] },
  response: { kind: "empty" },
  safety: "write",
});

export const uploadAttachmentFile = op({
  id: "uploadAttachmentFile",
  method: "POST",
  path: "uploads.json",
  query: { filename: "scalar", content_type: "scalar" },
  body: { kind: "binary", key: "file" },
  response: { kind: "item", unwrap: "upload" },
  safety: "write",
});

export const downloadAttachmentFile = op({
  id: "downloadAttachmentFile",
  method: "GET",
  path: "attachments/download/{attachment_id}/{filename}",
  pathParams: ["attachment_id", "filename"],
  response: { kind: "binary" },
});

export const downloadThumbnail = op({
  id: "downloadThumbnail",
  method: "GET",
  path: "attachments/thumbnail/{attachment_id}",
  pathParams: ["attachment_id"],
  query: { size: "scalar" },
  response: { kind: "binary" },
});

export const updateAttachment = op({
  id: "updateAttachment",
  method: "PATCH",
  path: "attachments/{attachment_id}.json",
  pathParams: ["attachment_id"],
  body: { kind: "json", envelope: "attachment", siblings: [] },
  response: { kind: "empty" },
  safety: "write",
});

export const sendValue = op({
  id: "sendValue",
  method: "POST",
  path: "bulk.json",
  body: { kind: "value", key: "payload" },
  response: { kind: "empty" },
  safety: "write",
});

export const ops: Readonly<Record<string, AnyOp>> = {
  getIssue,
  getIssues,
  getIssueStatuses,
  getProjects,
  getTimeEntry,
  getTimeEntries,
  updateIssue,
  createIssue,
  createNews,
  updateWikiPage,
  createDocument,
  createUser,
  deleteIssue,
  removeUsersFromGroup,
  addWatcher,
  uploadAttachmentFile,
  downloadAttachmentFile,
  downloadThumbnail,
  updateAttachment,
  sendValue,
};

export const SLOTS: SlotTable = {
  issues: {
    get: getIssue,
    list: getIssues,
    create: createIssue,
    update: updateIssue,
    remove: deleteIssue,
  },
  news: { create: createNews },
  wiki: { update: updateWikiPage },
  documents: { create: createDocument },
  users: { create: createUser },
  groups: { removeUsers: removeUsersFromGroup },
  timeEntries: { get: getTimeEntry, list: getTimeEntries },
  attachments: { update: updateAttachment },
};
