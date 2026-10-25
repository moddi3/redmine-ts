// Files over MCP: uploads take text, base64 or a path in the files directory; downloads return images
// and text inline when they are small, and otherwise the metadata, or a saved file in the directory.

import type { Attachment } from "@redmine-ts/sdk";
import { catalog } from "@redmine-ts/sdk/catalog";
import { z } from "zod";
import { BY_METHOD, toolName } from "../catalog-tools.ts";
import type { Annotations, LocalFiles, ToolSpec } from "../tools.ts";
import { defineTool, invalidInput } from "./define.ts";

/** Redmine's default attachment size limit. A larger upload is refused before it is sent. */
export const MAX_UPLOAD_BYTES: number = 5 * 1024 * 1024;
/** Images up to this size come back as image content. */
const MAX_IMAGE_BYTES = 1024 * 1024;
/** Text files up to this size come back as text. */
const MAX_TEXT_BYTES = 100 * 1024;

const IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
]);
const TEXT_TYPES =
  /^(text\/|application\/(json|xml|x-yaml|yaml|csv|x-ndjson)$|application\/.+\+(json|xml)$)/;
const TEXT_EXTENSIONS = new Set(["txt", "log", "md", "json", "xml", "csv", "tsv", "yaml", "yml"]);

const takingUploads = catalog
  .filter((entry) => entry.inlineUploads !== null)
  .map(toolName)
  .toSorted();
const ATTACH_TOOLS = `${takingUploads.slice(0, -1).join(", ")} or ${takingUploads.at(-1)}`;

const UploadRef = z.object({
  token: z.string(),
  filename: z.string(),
  content_type: z.string().optional(),
  description: z.string().optional(),
});

const Metadata = z.object({
  id: z.int(),
  filename: z.string(),
  filesize: z.int(),
  content_type: z.string().nullable(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  created_on: z.string(),
});

const AttachmentId = z
  .int()
  .positive()
  .describe("The attachment id, from issue_context or issues_get.");

export function uploadTool(files: boolean): ToolSpec {
  const sources = files
    ? "exactly one of content_text (UTF-8 text, such as a log), content_base64 (any bytes) or path (a file in the server's files directory)"
    : "exactly one of content_text (UTF-8 text, such as a log) or content_base64 (any bytes)";
  return defineTool({
    name: "attachments_upload",
    title: "Upload a file",
    description: [
      `Uploads a file to Redmine, the first step of attaching it. Give filename and ${sources}, at most ${humanSize(MAX_UPLOAD_BYTES)}.`,
      "Returns the upload reference {token, filename, content_type, description}.",
      `Next: attach it by passing the reference in the uploads array of ${ATTACH_TOOLS}, such as issues_update with {issue_id: 7, notes: "Log attached", uploads: [reference]}.`,
      "Redmine keeps an unattached upload until an admin prunes it, so upload only what you attach.",
    ].join(" "),
    input: z.strictObject({
      filename: z.string().min(1).describe("The name the attachment gets, such as build.log."),
      content_type: z
        .string()
        .optional()
        .describe("Such as text/plain. Redmine may infer it from the filename instead."),
      description: z.string().optional().describe("Kept on the attachment once it is attached."),
      content_text: z.string().optional().describe("The file as UTF-8 text."),
      content_base64: z.string().optional().describe("The file's bytes, base64-encoded."),
      ...(files
        ? {
            path: z
              .string()
              .min(1)
              .optional()
              .describe("A file in the server's files directory, relative to it."),
          }
        : {}),
    }),
    output: UploadRef,
    ...BY_METHOD.POST,
    run: async (rm, input, { files }) => {
      const { filename, content_type, description } = input;
      // The schema offers path, as a string, only with a files directory.
      const bytes = await content(input as Sources, files);
      const ref = await rm.attachments.upload({
        file: bytes,
        filename,
        ...(content_type === undefined ? {} : { content_type }),
        ...(description === undefined ? {} : { description }),
      });
      return { structured: ref };
    },
  });
}

type Sources = { content_text?: string; content_base64?: string; path?: string };

async function content(input: Sources, files: LocalFiles | undefined): Promise<Uint8Array> {
  const given = (["content_text", "content_base64", "path"] as const).filter(
    (key) => input[key] !== undefined,
  );
  if (given.length !== 1) {
    throw invalidInput(
      `give exactly one of content_text, content_base64${files === undefined ? "" : " or path"}, got ${given.length === 0 ? "none" : given.join(" and ")}`,
    );
  }
  let bytes: Uint8Array;
  if (input.content_text !== undefined) {
    bytes = new TextEncoder().encode(input.content_text);
  } else if (input.content_base64 !== undefined) {
    const base64 = input.content_base64.replace(/\s+/g, "");
    if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw invalidInput("content_base64 is not valid base64");
    }
    // Uint8Array.from with a callback holds about 30 bytes per byte of the file; the loop holds one.
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  } else {
    const file = await files!.open(input.path!);
    tooLarge(file.size);
    bytes = await file.bytes();
  }
  tooLarge(bytes.byteLength);
  return bytes;
}

function tooLarge(size: number): void {
  if (size > MAX_UPLOAD_BYTES) {
    throw invalidInput(
      `the file is ${humanSize(size)}, over this server's ${humanSize(MAX_UPLOAD_BYTES)} upload limit`,
    );
  }
}

export function downloadTool(files: boolean): ToolSpec {
  const save = files ? " Save it with attachments_save to read it as a local file." : "";
  return defineTool({
    name: "attachments_download",
    title: "Download an attachment",
    description: [
      `Reads an attachment's content. Images (PNG, JPEG, GIF, WebP) up to ${humanSize(MAX_IMAGE_BYTES)} come back as image content, and text files (text/*, JSON, XML, CSV, YAML, logs) up to ${humanSize(MAX_TEXT_BYTES)} as text.`,
      "thumbnail: true returns Redmine's thumbnail of an image instead, which also works for larger images.",
      `Any other or larger file returns its metadata and a note.${save}`,
      'Returns {attachment, content: "image", "text" or "none", text, note}.',
    ].join(" "),
    input: z.strictObject({
      id: AttachmentId,
      thumbnail: z
        .boolean()
        .default(false)
        .describe("Return the thumbnail of an image attachment."),
      size: z
        .int()
        .min(1)
        .max(800)
        .optional()
        .describe("Thumbnail size in pixels, at most 800. Defaults to the server setting."),
    }),
    output: z.object({
      attachment: Metadata,
      content: z
        .enum(["image", "text", "none"])
        .describe("What the result carries besides the metadata."),
      text: z.string().optional().describe("The file's text, when content is text."),
      note: z.string().optional(),
    }),
    ...BY_METHOD.GET,
    run: async (rm, { id, thumbnail, size }) => {
      const attachment = await rm.attachments.get({ attachment_id: id });
      const metadata = metadataOf(attachment);
      const none = (note: string) => ({
        structured: { attachment: metadata, content: "none" as const, note: `${note}${save}` },
      });
      const kind = thumbnail ? "image" : kindOf(attachment);
      if (kind === "other") {
        return none(
          `${attachment.filename} (${attachment.content_type ?? "unknown type"}) is neither an image nor text, so only its metadata is returned.`,
        );
      }
      const cap = kind === "image" ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
      const tooLarge = (size: number) =>
        none(
          `${attachment.filename} is ${humanSize(size)}, over the ${humanSize(cap)} limit for inline ${kind === "image" ? "images. thumbnail: true returns a smaller version." : "text."}`,
        );
      if (!thumbnail && attachment.filesize > cap) return tooLarge(attachment.filesize);
      const download = thumbnail
        ? await rm.attachments.thumbnail({ id, ...(size === undefined ? {} : { size }) })
        : await rm.attachments.download(attachment);
      const bytes = await download.bytes();
      if (bytes.byteLength > cap) return tooLarge(bytes.byteLength);
      if (kind === "text") {
        return {
          structured: {
            attachment: metadata,
            content: "text" as const,
            text: new TextDecoder().decode(bytes),
          },
        };
      }
      const mimeType = thumbnail
        ? (mediaType(download.content_type ?? null) ?? "image/png")
        : imageType(attachment)!;
      return {
        structured: {
          attachment: metadata,
          content: "image" as const,
          note: "The image is the next content block.",
        },
        extra: [{ type: "image" as const, data: base64Of(bytes), mimeType }],
      };
    },
  });
}

const SAVE: Annotations = {
  ...BY_METHOD.GET.annotations,
  // It reads Redmine only, but writes a new local file on every call.
  readOnlyHint: false,
  idempotentHint: false,
};

export const saveTool: ToolSpec = defineTool({
  name: "attachments_save",
  title: "Save an attachment to the files directory",
  description: [
    "Saves an attachment into the server's files directory and returns the absolute path, for files attachments_download does not return inline, such as archives, PDFs or large logs.",
    'A file that exists is never replaced: a taken name gets " (1)", " (2)" and so on.',
    "It only reads from Redmine, so read-only mode lists it too.",
    "Returns {path, bytes, attachment}.",
  ].join(" "),
  input: z.strictObject({ id: AttachmentId }),
  output: z.object({ path: z.string(), bytes: z.int(), attachment: Metadata }),
  tier: "read",
  annotations: SAVE,
  run: async (rm, { id }, { files }) => {
    const attachment = await rm.attachments.get({ attachment_id: id });
    const download = await rm.attachments.download(attachment);
    // Listed only with a files directory.
    const { path, bytes } = await files!.save(
      attachment.filename,
      `attachment-${id}`,
      download.body,
    );
    return { structured: { path, bytes, attachment: metadataOf(attachment) } };
  },
});

function metadataOf(attachment: Attachment): z.output<typeof Metadata> {
  return {
    id: attachment.id,
    filename: attachment.filename,
    filesize: attachment.filesize,
    content_type: attachment.content_type,
    description: attachment.description,
    author: attachment.author?.name ?? null,
    created_on: attachment.created_on,
  };
}

function kindOf(attachment: Attachment): "image" | "text" | "other" {
  if (imageType(attachment) !== undefined) return "image";
  const type = mediaType(attachment.content_type);
  if (type !== undefined && TEXT_TYPES.test(type)) return "text";
  return TEXT_EXTENSIONS.has(extension(attachment.filename)) ? "text" : "other";
}

/** The image type to send, from the content type or, when Redmine has none, the extension. */
function imageType(attachment: Attachment): string | undefined {
  const type = mediaType(attachment.content_type);
  if (type !== undefined) return [...IMAGE_TYPES.values()].find((known) => known === type);
  return IMAGE_TYPES.get(extension(attachment.filename));
}

function mediaType(contentType: string | null): string | undefined {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  return type === "" || type === "application/octet-stream" ? undefined : type;
}

function extension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** btoa takes one character per byte; chunks keep the spread under the argument limit. */
function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

function humanSize(size: number): string {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(size / 1024)} KB`;
}
