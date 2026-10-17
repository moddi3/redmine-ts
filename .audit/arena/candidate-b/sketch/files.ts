// src/core/files.ts. Uploads and downloads: the only place that touches binary bodies.
// Hand-written because streams, replayability and "never trust content_url" are policy, not spec.
// Both go through Engine.send, so auth, timeouts, concurrency, switch-user and redaction are identical to JSON calls.

import type { CallOptions } from "./config.ts";
import type { Engine } from "./engine.ts";

export type BinarySource = Blob | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;

/** What goes into `uploads: [...]` on issue create/update, wiki, files. Produced by `files.upload`. */
export interface UploadRef {
  token: string;
  filename: string;
  content_type: string | undefined;
  description?: string;
}

export interface Download {
  filename: string;
  content_type: string | undefined;
  size: number | undefined;
  /** Streamed. Consume once. */
  body: ReadableStream<Uint8Array>;
  bytes(): Promise<Uint8Array>;
}

export interface Files {
  /**
   * Step 1 of Redmine's two-step upload. POST /uploads.json, body octet-stream (any other content-type is a 406),
   * `filename` and `content_type` as query params. Over-limit is a 422 -> RedmineError kind "validation".
   * A ReadableStream source is sent once and never retried or 401-replayed (not replayable).
   * Note: from 7.1 the server ignores the client's content_type; we still send it, harmless on <= 7.0.
   */
  upload(source: BinarySource, meta: { filename: string; content_type?: string; description?: string }, opts?: CallOptions): Promise<UploadRef>;

  /**
   * GET attachments/download/{id}/{filename} resolved against baseUrl. The absolute `content_url` Redmine puts in
   * attachment JSON is IGNORED: behind a proxy it carries a foreign host/scheme and would leak the credential.
   */
  download(attachment: { id: number; filename: string }, opts?: CallOptions): Promise<Download>;
  thumbnail(attachment: { id: number }, size?: number, opts?: CallOptions): Promise<Download>;
}

export function createFiles(engine: Engine): Files {
  throw new Error("not implemented");
  // TODO upload   -> engine.send(ops.uploadAttachmentFile, {filename, content_type, content: source}) ; JSON-parse body ; {token: upload.token, filename, ...}
  //      download -> engine.send(ops.downloadAttachmentFile, {attachment_id, filename}) ; wrap Response.body; 404 here is an HTML page -> kind not_found
}
