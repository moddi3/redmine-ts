// Uploads and downloads, the only code that touches binary bodies. They go through the engine, so auth,
// timeouts, concurrency, impersonation and redaction match JSON calls.

import type { CallOptions } from "./config.ts";
import type { Engine } from "./engine.ts";

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

export function createAttachmentFiles(_engine: Engine): AttachmentFiles {
  throw new Error("not implemented");
}
