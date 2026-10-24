// `@redmine-ts/sdk/catalog`: every method a tool layer can expose, with JSON Schemas for its input and
// result. A separate entrypoint, so clients that never build tools do not load the schemas.

import type { CatalogEntry, JsonSchema } from "./core/catalog.ts";
import { CATALOG } from "./generated/catalog.ts";
import { ops } from "./generated/ops.ts";

export type { CatalogEntry, CatalogOutput, JsonSchema, JsonType } from "./core/catalog.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

const attachmentId: JsonSchema = { type: "integer", description: "The attachment id." };

function object(
  properties: Readonly<Record<string, JsonSchema>>,
  required: readonly string[],
  closed: boolean,
): JsonSchema {
  return {
    $schema: DRAFT,
    type: "object",
    properties,
    required,
    ...(closed ? { additionalProperties: false } : {}),
  };
}

function docsOf(id: string): string | null {
  return CATALOG.find((entry) => entry.id === id)?.docsUrl ?? null;
}

const takingUploads = CATALOG.filter((entry) => entry.inlineUploads !== null)
  .map((entry) => `${entry.namespace}.${entry.verb}`)
  .toSorted();
const uploadTargets =
  takingUploads.length < 2
    ? takingUploads.join("")
    : `${takingUploads.slice(0, -1).join(", ")} or ${takingUploads.at(-1)}`;

/** The hand-written Extras in `redmine.ts` and `core/files.ts`, whose inputs the spec does not describe. */
const extras: readonly CatalogEntry[] = [
  {
    id: "transitionIssue",
    namespace: "issues",
    verb: "transition",
    title: "Change issue status",
    description:
      'Reads the issue with include=allowed_statuses and refuses locally with kind "transition_not_allowed" when the workflow does not allow the status, then updates it. Sends no update when the issue already has the status and there are no notes.',
    docsUrl: docsOf("updateIssue"),
    method: ops.updateIssue.method,
    safety: ops.updateIssue.safety,
    since: ops.updateIssue.since,
    until: ops.updateIssue.until,
    stability: ops.updateIssue.stability,
    inputSchema: object(
      {
        issue_id: { type: "integer" },
        status_id: { type: "integer" },
        notes: { type: "string", description: "Added as a journal entry with the change." },
      },
      ["issue_id", "status_id"],
      true,
    ),
    inlineUploads: null,
    output: { kind: "empty" },
  },
  {
    id: "uploadAttachment",
    namespace: "attachments",
    verb: "upload",
    title: "Upload a file",
    description: `Step one of Redmine's two-step upload. Returns a reference to pass in \`uploads\` of ${uploadTargets}. Over the size limit is a 422.`,
    docsUrl: "https://www.redmine.org/projects/redmine/wiki/Rest_api#Attaching-files",
    method: ops.uploadAttachmentFile.method,
    safety: ops.uploadAttachmentFile.safety,
    since: ops.uploadAttachmentFile.since,
    until: ops.uploadAttachmentFile.until,
    stability: ops.uploadAttachmentFile.stability,
    inputSchema: object(
      {
        file: {
          description:
            "The bytes: a Blob, Uint8Array, ArrayBuffer or ReadableStream. JSON has no binary type, so a tool layer decides how to carry them, such as base64 text or a path it reads.",
        },
        filename: { type: "string" },
        content_type: { type: "string" },
        description: { type: "string", description: "Kept on the attachment once it is attached." },
      },
      ["file", "filename"],
      true,
    ),
    inlineUploads: null,
    output: {
      kind: "item",
      optional: false,
      schema: object(
        {
          token: { type: "string" },
          filename: { type: "string" },
          content_type: { type: "string" },
          description: { type: "string" },
        },
        ["token", "filename"],
        false,
      ),
    },
  },
  {
    id: "downloadAttachment",
    namespace: "attachments",
    verb: "download",
    title: "Download an attachment",
    description:
      "Streams the file from baseUrl and the attachment id. The attachment's content_url is ignored, because behind a proxy it can name another host.",
    docsUrl: docsOf("getAttachment"),
    method: ops.downloadAttachmentFile.method,
    safety: ops.downloadAttachmentFile.safety,
    since: ops.downloadAttachmentFile.since,
    until: ops.downloadAttachmentFile.until,
    stability: ops.downloadAttachmentFile.stability,
    inputSchema: object(
      { id: attachmentId, filename: { type: "string" } },
      ["id", "filename"],
      true,
    ),
    inlineUploads: null,
    output: { kind: "binary" },
  },
  {
    id: "downloadAttachmentThumbnail",
    namespace: "attachments",
    verb: "thumbnail",
    title: "Download an attachment thumbnail",
    description: "Streams the thumbnail of an image attachment.",
    docsUrl: docsOf("getAttachment"),
    method: ops.downloadThumbnail.method,
    safety: ops.downloadThumbnail.safety,
    since: ops.downloadThumbnail.since,
    until: ops.downloadThumbnail.until,
    stability: ops.downloadThumbnail.stability,
    inputSchema: object(
      {
        id: attachmentId,
        size: {
          type: "integer",
          description: "Thumbnail size in pixels, at most 800. Defaults to the server setting.",
        },
      },
      ["id"],
      true,
    ),
    inlineUploads: null,
    output: { kind: "binary" },
  },
];

/** One entry per method on the client: the generated namespace methods, then the hand-written extras. */
export const catalog: readonly CatalogEntry[] = [...CATALOG, ...extras];
