// One error class carrying a discriminated, JSON-serializable union. Callers branch on `kind`;
// tool layers serialize `data` as is. Nothing here holds credentials: the SDK never puts the key
// in a URL, and headers are never captured.

import type { RedmineVersion } from "../generated/versions.ts";
import type { Access } from "./config.ts";
import type { UploadEntry } from "./files.ts";
import type { HttpMethod } from "./op.ts";

export type RedmineErrorData =
  /** Messages are raw and localized to the API user's language. Display them, never match on them. */
  | { kind: "validation"; status: 422; messages: readonly string[] }
  | { kind: "unauthorized"; status: 401 }
  /** Also what a disabled REST API looks like. */
  | { kind: "forbidden"; status: 403 }
  /** `hint` explains likely causes, e.g. an operation newer than an undeclared server version. */
  | { kind: "not_found"; status: 404; hint?: string }
  /**
   * A stale edit. A wiki `version` answers 409. An issue `lock_version` answers 422 with an empty errors
   * array, so a 422 is a conflict only when the request carried `lock_version`. Re-read, merge, resend.
   */
  | { kind: "conflict"; status: 409 | 422 }
  /** Nothing was sent: the key is not an admin's, and Redmine would silently run the request as the key's own user. */
  | { kind: "switch_user_rejected"; login: string; reason: "not_admin" }
  /** Redmine answered 412: X-Redmine-Switch-User named an unknown or inactive login. */
  | { kind: "switch_user_rejected"; login: string; reason: "rejected_by_server"; status: 412 }
  | { kind: "not_acceptable"; status: 406 }
  /** Any other status. `body` is truncated to 2 KiB. */
  | { kind: "http"; status: number; body: string }
  | {
      kind: "protocol";
      reason:
        | "non_json"
        | "bad_json"
        | "pagination_stalled"
        | "pagination_offset_mismatch"
        | "page_cap";
      hint: string;
    }
  | { kind: "network"; message: string }
  | { kind: "timeout"; after_ms: number }
  | { kind: "aborted" }
  /** Refused before the network: the declared server version lacks this operation. */
  | {
      kind: "unsupported_version";
      declared: RedmineVersion;
      since: RedmineVersion;
      until: RedmineVersion | null;
    }
  /**
   * Refused before the network: the client's `access` mode does not allow this HTTP method. With `deletes`, the
   * method is allowed, and `deletes` says what this update would make Redmine delete.
   */
  | { kind: "access_denied"; access: Exclude<Access, "full">; method: HttpMethod; deletes?: string }
  /** Refused before the network: bad config, unknown filter key or operator, conflicting paging options. */
  | { kind: "invalid_input"; detail: string }
  | { kind: "transition_not_allowed"; wanted: number; allowed: readonly number[] };

export type ErrorKind = RedmineErrorData["kind"];

export interface ErrorContext {
  /** Operation id in flight, when there was one. */
  op?: string;
  /** X-Request-Id from Rails, for server log lookups. */
  request_id?: string;
  cause?: unknown;
  /** See RedmineError.uploads. */
  uploads?: UploadEntry[];
}

export class RedmineError<D extends RedmineErrorData = RedmineErrorData> extends Error {
  override readonly name = "RedmineError";
  readonly data: D;
  readonly op: string | undefined;
  readonly request_id: string | undefined;
  /**
   * Set when a create or update with `file` entries in `uploads` fails after its checks passed: your entries in
   * order, a fresh array, with each file Redmine acknowledged replaced by its UploadRef. Redmine keeps those
   * uploads unattached until an admin prunes them, so pass this array back as `uploads` to retry without
   * sending them again. An entry that still has `file` was not acknowledged, and Redmine may still have stored
   * it if the response was lost. Left out of toJSON and of the enumerable properties, because a token lets any
   * user who can edit some record attach the file and read it.
   */
  declare readonly uploads: UploadEntry[] | undefined;

  constructor(data: D, context: ErrorContext = {}) {
    super(describe(data, context.op), { cause: context.cause });
    this.data = data;
    this.op = context.op;
    this.request_id = context.request_id;
    Object.defineProperty(this, "uploads", { value: context.uploads, enumerable: false });
  }

  get kind(): D["kind"] {
    return this.data.kind;
  }

  /** `if (RedmineError.is(e, "validation")) e.data.messages` */
  static is<K extends ErrorKind>(
    e: unknown,
    kind: K,
  ): e is RedmineError<Extract<RedmineErrorData, { kind: K }>> {
    return e instanceof RedmineError && e.data.kind === kind;
  }

  /** `cause` is dropped: exotic fetch implementations may attach request details to it. `uploads` is dropped too. */
  toJSON(): {
    name: string;
    message: string;
    op: string | undefined;
    request_id: string | undefined;
  } & D {
    return {
      name: this.name,
      message: this.message,
      op: this.op,
      request_id: this.request_id,
      ...this.data,
    };
  }
}

function describe(data: RedmineErrorData, op: string | undefined): string {
  const where = op ? ` on ${op}` : "";
  switch (data.kind) {
    case "validation":
      return `Redmine rejected the request${where}: ${data.messages.join("; ")}`;
    case "unauthorized":
    case "forbidden":
    case "not_acceptable":
      return `Redmine answered ${data.status} (${data.kind})${where}`;
    case "not_found":
      return `Redmine answered 404${where}${data.hint ? `: ${data.hint}` : ""}`;
    case "conflict":
      return `Redmine reported a conflicting edit${where} (${data.status}): re-read the record and retry`;
    case "switch_user_rejected":
      return data.reason === "not_admin"
        ? `Cannot act as ${data.login}${where}: the API key does not belong to an admin, so Redmine would ignore the switch`
        : `Redmine refused to switch to user ${data.login}${where} (412)`;
    case "http":
      return `Redmine answered ${data.status}${where}`;
    case "protocol":
      return `Unexpected response${where} (${data.reason}): ${data.hint}`;
    case "network":
      return `Network error${where}: ${data.message}`;
    case "timeout":
      return `Timed out after ${data.after_ms} ms${where}`;
    case "aborted":
      return `Aborted${where}`;
    case "unsupported_version":
      return `${op ?? "This operation"} needs Redmine ${data.since}${data.until ? ` to ${data.until}` : "+"}, but the client declared ${data.declared}`;
    case "access_denied":
      return data.deletes === undefined
        ? `${op ?? "This request"} sends ${data.method}, which a client with access "${data.access}" refuses; nothing was sent`
        : `${op ?? "This request"} would delete in Redmine (${data.deletes}), which a client with access "${data.access}" refuses; nothing was sent`;
    case "invalid_input":
      return `Invalid input${where}: ${data.detail}`;
    case "transition_not_allowed":
      return `Status ${data.wanted} is not an allowed transition (allowed: ${data.allowed.join(", ") || "none"})`;
    default: {
      const exhaustive: never = data;
      return String(exhaustive);
    }
  }
}
