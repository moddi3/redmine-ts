// Uploads and downloads, the only code that touches binary bodies. They go through the engine, so auth,
// timeouts, concurrency, impersonation and redaction match JSON calls.

import type { CallOptions } from "./config.ts";
import type { Engine } from "./engine.ts";
import { RedmineError } from "./errors.ts";
import type { AnyOp } from "./op.ts";
import { isRecord } from "./util.ts";

export type BinarySource = Blob | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;

/** An entry for `uploads: [...]` on issue create/update, wiki pages and project files. */
export interface UploadRef {
  token: string;
  filename: string;
  content_type?: string;
  description?: string;
}

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
  if (upload.body?.kind !== "binary") {
    throw new Error(`${upload.id} must have a binary request body`);
  }
  const fileKey = upload.body.key;
  // AnyOp erases the return type, so state what the upload resolves to.
  const call = (
    op: AnyOp,
    input: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<unknown> => engine.call(op, input, options);
  return {
    async upload({ file, filename, content_type, description }, options) {
      const created = await call(upload, { [fileKey]: file, filename, content_type }, options);
      if (!isRecord(created) || typeof created.token !== "string") {
        throw new RedmineError(
          { kind: "protocol", reason: "bad_json", hint: "the upload response carries no token" },
          { op: upload.id },
        );
      }
      return {
        token: created.token,
        filename,
        ...(content_type === undefined ? {} : { content_type }),
        ...(description === undefined ? {} : { description }),
      };
    },
    // Built from baseUrl and the id, never from the attachment's content_url.
    download: ({ id, filename }, options) =>
      engine.call(download, { attachment_id: id, filename }, options),
    thumbnail: ({ id, size }, options) =>
      engine.call(thumbnail, { attachment_id: id, size }, options),
  };
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
