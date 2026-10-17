import type { OperationDef } from './def.ts'

export type FileBody = Blob | Uint8Array | ReadableStream<Uint8Array>

/** A file to upload as part of a create/update. Swapped for an UploadToken before the main request. */
export interface FileInput {
  readonly file: FileBody
  readonly filename: string
  readonly description?: string
  /** Sent on upload. Redmine 7.1+ ignores it and sniffs the type itself. */
  readonly content_type?: string
}

/** What `uploads.json` returns, shaped for the `uploads` array of issue/wiki/project bodies. */
export interface UploadToken {
  readonly token: string
  readonly filename?: string
  readonly description?: string
  readonly content_type?: string
}

export interface Download {
  readonly body: ReadableStream<Uint8Array>
  readonly content_type: string | null
  readonly filename: string | null
  readonly size: number | null
  blob(): Promise<Blob>
  arrayBuffer(): Promise<ArrayBuffer>
}

/**
 * For inputs with `uploads` (or createFile's `file`): uploads each FileInput sequentially as
 * application/octet-stream (anything else gets 406) and returns the input with tokens in place.
 * Uploads are POSTs and never retried. A failure in the main request leaves orphan uploads;
 * cleanup policy is an open question in design.md.
 */
export async function resolveInlineUploads(
  def: OperationDef,
  input: Record<string, unknown>,
  upload: (file: FileInput) => Promise<UploadToken>,
): Promise<Record<string, unknown>> {
  throw new Error('not implemented')
}

/** ReadableStream bodies need `duplex: 'half'` on fetch; Blob and Uint8Array are sent as is. */
export function uploadInit(body: FileBody): { body: BodyInit; duplex?: 'half' } {
  throw new Error('not implemented')
}

export function toDownload(res: Response): Download {
  // TODO: filename from Content-Disposition (RFC 5987 filename*), size from Content-Length.
  throw new Error('not implemented')
}
