// src/core/config.ts. Everything a caller can configure, and the boundary that validates it once.
// Convention: DATA is snake_case (wire = domain). SDK OPTIONS are camelCase (they are SDK concepts, not Redmine's).

import type { Version } from "./version.ts";
import type { RedmineError } from "./errors.ts";

// ---------- auth: a sealed union, compiled once into an Authenticator ----------

export type Auth =
  | { apiKey: string } // X-Redmine-API-Key header ONLY. The ?key= query form is not offered.
  | { basic: { login: string; password: string } } // UTF-8 safe base64, no btoa on raw strings
  | { bearer: string | BearerSource }; // OAuth2 (Redmine >= 6.1, Doorkeeper)

export interface BearerSource {
  token(): string | Promise<string>;
  /** Called at most once per request after a 401, then the request is replayed once (if replayable). Serialize in userland. */
  refresh?(): string | Promise<string>;
}

/** What the engine actually uses. Built by `authenticator(auth)`; the union above never leaks past config. */
export interface Authenticator {
  headers(): Promise<Record<string, string>>;
  /** true when credentials changed and a replay is worthwhile */
  onUnauthorized(): Promise<boolean>;
}
export function authenticator(auth: Auth | undefined): Authenticator {
  throw new Error("not implemented");
}

// ---------- retry ----------

export interface RetryPolicy {
  /** extra attempts after the first. default 2 */
  attempts: number;
  baseMs: number; // default 250, full-jitter exponential
  maxMs: number; // default 5_000; Retry-After is honored up to this cap
}
// What is retried (decided in core/wire.ts `retryDecision`, pure, table-tested):
//   429                                  : any method. The request provably was not executed.
//   502 / 503 / 504 / network / timeout  : read (GET) and idempotent (DELETE) ops only.
//   POST / PUT / PATCH                   : never. A repeated PUT with `notes` appends a second journal.
//   streamed request bodies              : never (not replayable).

// ---------- client config ----------

export interface RedmineConfig<V extends Version = Version> {
  /** Subpath preserved: "https://host/redmine" and "https://host/redmine/" are identical. Userinfo in the URL is rejected. */
  baseUrl: string | URL;
  auth?: Auth;
  /** Declared, never detected (Redmine does not report its version). Narrows the TYPE and arms the runtime guard.
   *  Omit for "latest superset, no guard". */
  version?: V;
  /** Inject for proxies, internal CAs (undici dispatcher), browsers behind a CORS proxy, tests. default globalThis.fetch */
  fetch?: typeof fetch;
  timeoutMs?: number; // per attempt. default 30_000
  maxConcurrent?: number; // in-flight requests per client family. default 8
  retry?: Partial<RetryPolicy> | false;
  /** Symptom-based response normalizers (hours "8/1" -> 8, ...). default true */
  normalize?: boolean;
  /** One observation point. Events are redacted by construction. */
  onEvent?: (event: SdkEvent) => void;
}

export type SdkEvent =
  | { type: "request"; op: string; method: string; url: string; attempt: number }
  | { type: "response"; op: string; status: number; ms: number; attempt: number }
  | { type: "retry"; op: string; attempt: number; delay_ms: number; reason: string }
  | { type: "error"; op: string; error: RedmineError };

/** Per-call overrides. `with()` bakes a set of these into a derived client. Never global state. */
export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** X-Redmine-Switch-User. Admin-only; a bad login surfaces as kind "switch_user_rejected". */
  as?: string;
  retry?: Partial<RetryPolicy> | false;
}

/** Resolved + validated once at createRedmine. Everything downstream trusts it. */
export interface ResolvedConfig {
  readonly base: URL; // always ends with "/", http(s) only
  readonly version: Version | undefined;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
  readonly maxConcurrent: number;
  readonly retry: RetryPolicy | null;
  readonly normalize: boolean;
  readonly auth: Authenticator;
  readonly onEvent: ((event: SdkEvent) => void) | undefined;
}
export function resolveConfig(config: RedmineConfig): ResolvedConfig {
  throw new Error("not implemented"); // TODO: boundary. URL parse, strip userinfo -> invalid_input, ensure trailing "/", parseVersion, defaults
}
