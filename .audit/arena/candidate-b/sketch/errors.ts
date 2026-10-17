// src/core/errors.ts. The typed error model. One class, one discriminated union, JSON-serializable data.
// Callers branch on `e.kind`; tools (MCP) serialize `e.data` as-is. Nothing here ever holds credentials:
// URLs are stored without query (the SDK never sends the key in the query), headers are never captured.

import type { Version } from "./version.ts";

export type RedmineErrorData =
  // server answered
  | { kind: "validation"; status: 422; messages: readonly string[] } // raw, localized: DISPLAY them, never match them
  | { kind: "unauthorized"; status: 401 } // after one bearer refresh attempt, if configured
  | { kind: "forbidden"; status: 403 } // also what a disabled REST API looks like
  | { kind: "not_found"; status: 404 }
  | { kind: "switch_user_rejected"; status: 412; login: string | undefined } // X-Redmine-Switch-User: unknown/inactive/non-admin
  | { kind: "not_acceptable"; status: 406 } // wrong upload content-type
  | { kind: "http"; status: number; body: string } // anything else; body truncated to 2 KiB
  // answered, but not with what the contract says
  | { kind: "protocol"; reason: "non_json" | "bad_json" | "pagination_stalled" | "pagination_offset_mismatch" | "page_cap"; hint: string }
  // never answered
  | { kind: "network"; cause: unknown }
  | { kind: "timeout"; after_ms: number }
  | { kind: "aborted" }
  // refused before the network
  | { kind: "unsupported_version"; declared: Version; since: Version; until: Version | null }
  | { kind: "invalid_input"; detail: string } // bad where-key/operator, keyset+sort conflict, bad baseUrl
  | { kind: "transition_not_allowed"; wanted: number; allowed: readonly number[] };

export type ErrorKind = RedmineErrorData["kind"];

export class RedmineError<D extends RedmineErrorData = RedmineErrorData> extends Error {
  readonly data: D;
  readonly op: string | undefined; // operation id, when one was in flight
  readonly request_id: string | undefined; // X-Request-Id from Rails, for server-log lookups

  constructor(data: D, ctx: { op?: string; request_id?: string; message?: string; cause?: unknown } = {}) {
    super(ctx.message ?? describe(data, ctx.op), { cause: ctx.cause });
    throw new Error("not implemented"); // TODO: assign fields, set this.name = "RedmineError"
  }

  get kind(): D["kind"] {
    return this.data.kind;
  }

  /** Narrowing guard: `if (RedmineError.is(e, "validation")) e.data.messages`. */
  static is<K extends ErrorKind>(e: unknown, kind: K): e is RedmineError<Extract<RedmineErrorData, { kind: K }>> {
    throw new Error("not implemented"); // TODO: e instanceof RedmineError && e.data.kind === kind
  }

  /** Whether re-sending the same request is sane. Retry policy consults this, callers may too. */
  get retryable(): boolean {
    throw new Error("not implemented"); // TODO: network/timeout/http 502,503,504,429. Never validation/forbidden/etc.
  }

  toJSON(): { name: string; op: string | undefined; request_id: string | undefined } & D {
    throw new Error("not implemented"); // TODO: spread data; `cause` dropped (may carry secrets in exotic fetch impls)
  }
}

function describe(data: RedmineErrorData, op: string | undefined): string {
  throw new Error("not implemented"); // TODO: "Redmine 422 on updateIssue: Subject cannot be blank, ..."
}
