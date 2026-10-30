// Uploads and downloads, the only code that touches binary bodies. They go through the engine, so auth,
// timeouts, concurrency, impersonation and redaction match JSON calls.

import type { Uploads } from "../generated/schemas.ts";
import type { CallOptions } from "./config.ts";
import type { Engine } from "./engine.ts";
import { RedmineError } from "./errors.ts";
import { uploadKey, type AnyOp } from "./op.ts";
import { invalidInput, isRecord } from "./util.ts";
import { planRequest } from "./wire.ts";

export type BinarySource = Blob | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;

/** What `attachments.upload` returns: an entry for `uploads` on issues, news and wiki pages. */
export interface UploadRef {
  token: string;
  filename: string;
  content_type?: string;
  description?: string;
}

/** A file that a create or update uploads to uploads.json before it sends the record. */
export interface InlineUpload {
  /** A ReadableStream is read once and never retried. */
  file: BinarySource;
  filename: string;
  /** Redmine 7.1 ignores it on the upload. Redmine 6.1 and 7.0 also take it from the entry. */
  content_type?: string;
  /** Kept on the attachment once it is attached. */
  description?: string;
  token?: never;
}

/** One entry of `uploads`: an upload Redmine already holds, by token, or a file the call uploads first. */
export type UploadEntry = (Uploads[number] & { file?: never }) | InlineUpload;

export interface Download {
  filename: string;
  content_type: string | undefined;
  size: number | undefined;
  /** Streamed; consume once. */
  body: ReadableStream<Uint8Array>;
  bytes(): Promise<Uint8Array>;
}

/** Hand-written additions to the generated `attachments` namespace. */
export interface AttachmentFiles {
  /**
   * Step 1 of Redmine's two-step upload: POST uploads.json with an application/octet-stream body
   * (anything else is a 406). Over the size limit is a 422 (kind "validation"). A ReadableStream is
   * sent once and never retried. Redmine 7.1 ignores the client content_type; sending it is harmless.
   */
  upload(
    input: { file: BinarySource; filename: string; content_type?: string; description?: string },
    options?: CallOptions,
  ): Promise<UploadRef>;
  /**
   * GET attachments/download/{id}/{filename} resolved against baseUrl. The absolute `content_url` in
   * attachment JSON is ignored: behind a proxy it can carry a foreign host and leak the credential.
   * Accepts any attachment object as returned by the API.
   */
  download(attachment: { id: number; filename: string }, options?: CallOptions): Promise<Download>;
  thumbnail(attachment: { id: number; size?: number }, options?: CallOptions): Promise<Download>;
}

/** The generated descriptors, passed in because core never imports generated data. */
export interface AttachmentOps {
  /** uploadAttachmentFile */
  upload: AnyOp;
  /** downloadAttachmentFile */
  download: AnyOp;
  /** downloadThumbnail */
  thumbnail: AnyOp;
}

export function createAttachmentFiles(
  engine: Engine,
  { upload, download, thumbnail }: AttachmentOps,
): AttachmentFiles {
  const send = createUploader(engine, upload);
  return {
    upload: send,
    // Built from baseUrl and the id, never from the attachment's content_url.
    download: ({ id, filename }, options) =>
      engine.call(download, { attachment_id: id, filename }, options),
    thumbnail: ({ id, size }, options) =>
      engine.call(thumbnail, { attachment_id: id, size }, options),
  };
}

/**
 * Streams the engine has handed to fetch, from any client. A stream is read once, so an inline upload refuses
 * one of these before it sends anything. Module-wide, because a stream is no less used when another client sent
 * it, and a WeakSet keeps no stream alive.
 */
const sentStreams = new WeakSet<ReadableStream>();

/** The engine calls this as it hands a request body to fetch, so a call refused before that leaves the stream unused. */
export function markSent(body: RequestInit["body"]): void {
  if (body instanceof ReadableStream) sentStreams.add(body);
}

type Uploader = (file: Omit<InlineUpload, "token">, options?: CallOptions) => Promise<UploadRef>;

/** Step one of the upload, shared by `attachments.upload` and inline uploads. */
function createUploader(engine: Engine, upload: AnyOp): Uploader {
  const fileKey = binaryKey(upload);
  return async ({ file, filename, content_type, description }, options) => {
    // AnyOp erases the return type, so state what the upload resolves to.
    const created: unknown = await engine.call(
      upload,
      { [fileKey]: file, filename, content_type },
      options,
    );
    if (!isRecord(created) || typeof created.token !== "string") {
      throw new RedmineError(
        { kind: "protocol", reason: "bad_json", hint: "the upload response carries no token" },
        { op: upload.id },
      );
    }
    return refOf(created.token, { filename, content_type, description });
  };
}

function refOf(
  token: string,
  { filename, content_type, description }: Omit<InlineUpload, "file" | "token">,
): UploadRef {
  return {
    token,
    filename,
    ...(content_type === undefined ? {} : { content_type }),
    ...(description === undefined ? {} : { description }),
  };
}

function binaryKey(upload: AnyOp): string {
  if (upload.body?.kind !== "binary") {
    throw new Error(`${upload.id} must have a binary request body`);
  }
  return upload.body.key;
}

export type UploadingCall = (op: AnyOp, input: unknown, options: CallOptions) => Promise<unknown>;

/**
 * Without a file entry this is `engine.call`. With one, every check that needs no network runs before the
 * first byte: access and version of both operations, each file entry, and the record's own input. The files
 * then upload one at a time in list order, and the record goes out with each replaced by its reference. A
 * RedmineError after that point carries `uploads`: the list as far as it got, for a retry.
 */
export function createUploadingCall(engine: Engine, upload: AnyOp): UploadingCall {
  const send = createUploader(engine, upload);
  const fileKey = binaryKey(upload);
  return async (op, input, options) => {
    const key = uploadKey(op);
    const list = key === undefined || !isRecord(input) ? undefined : input[key];
    if (key === undefined || !isRecord(input) || !Array.isArray(list) || !list.some(isInline)) {
      return engine.call(op, input, options);
    }
    const refused = engine.refusal(op) ?? engine.refusal(upload);
    if (refused) throw refused;

    const streams = new Map<ReadableStream, string>();
    const checked = (entry: unknown, where: string): UploadEntry => {
      if (!isInline(entry)) return entry as UploadEntry;
      if (entry.token !== undefined) throw invalidInput(`${where} has both file and token`, op.id);
      if (typeof entry.filename !== "string" || entry.filename === "") {
        throw invalidInput(`${where}.filename is required with file`, op.id);
      }
      if (entry.file instanceof ReadableStream) {
        const stream = entry.file;
        const twin = streams.get(stream);
        if (sentStreams.has(stream)) {
          throw invalidInput(
            `${where}.file is a ReadableStream that an earlier upload already sent. A stream is read once, so pass the file again as a new stream, a Blob or bytes`,
            op.id,
          );
        }
        if (twin !== undefined) {
          throw invalidInput(
            `${where}.file is the same ReadableStream as ${twin}.file, and a stream is read once`,
            op.id,
          );
        }
        if (stream.locked) {
          throw invalidInput(`${where}.file is a ReadableStream locked to a reader`, op.id);
        }
        streams.set(stream, where);
      }
      try {
        const { file, filename, content_type } = entry;
        planRequest(engine.config.base, upload, { [fileKey]: file, filename, content_type }, {});
      } catch (error) {
        if (!RedmineError.is(error, "invalid_input")) throw error;
        throw invalidInput(`${where}: ${error.data.detail}`, op.id);
      }
      return entry as InlineUpload;
    };
    const entries = list.map((entry: unknown, at) => checked(entry, `${key}[${at}]`));
    const placeholders = entries.map((e) => (e.file === undefined ? e : refOf("0.0", e)));
    planRequest(engine.config.base, op, { ...input, [key]: placeholders }, {});

    const resolved = [...entries];
    try {
      for (const [at, entry] of entries.entries()) {
        if (entry.file !== undefined) resolved[at] = await send(entry, options);
      }
      return await engine.call(op, { ...input, [key]: resolved }, options);
    } catch (error) {
      if (!(error instanceof RedmineError)) throw error;
      throw new RedmineError(error.data, {
        ...(error.op === undefined ? {} : { op: error.op }),
        ...(error.request_id === undefined ? {} : { request_id: error.request_id }),
        cause: error.cause,
        uploads: resolved,
      });
    }
  };
}

/** An entry with `file`, before its fields are checked. */
interface FileEntry {
  file: unknown;
  filename?: unknown;
  content_type?: unknown;
  token?: unknown;
}

/** An entry with `file` is one the call uploads. Anything else goes to Redmine as given. */
function isInline(entry: unknown): entry is FileEntry {
  return isRecord(entry) && entry.file !== undefined;
}

/** A streamed Download over a successful response. `filename` wins over the server's Content-Disposition. */
export function toDownload(response: Response, filename: string | undefined): Download {
  const length = Number(response.headers.get("content-length") ?? Number.NaN);
  return {
    filename:
      filename ?? dispositionFilename(response.headers.get("content-disposition")) ?? "download",
    content_type: response.headers.get("content-type") ?? undefined,
    size: Number.isFinite(length) ? length : undefined,
    body: response.body ?? new ReadableStream({ start: (controller) => controller.close() }),
    bytes: async () => new Uint8Array(await response.arrayBuffer()),
  };
}

function dispositionFilename(header: string | null): string | undefined {
  const encoded = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(header ?? "")?.[1];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return undefined;
    }
  }
  return /filename="?([^";]+)"?/.exec(header ?? "")?.[1];
}
