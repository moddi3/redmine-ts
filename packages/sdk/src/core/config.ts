// Everything a caller configures, validated once at createRedmine. Data is snake_case (the wire is the
// domain); SDK options are camelCase (they are SDK concepts, not Redmine's).

import type { RedmineVersion } from "../generated/versions.ts";
import type { RedmineError } from "./errors.ts";

export type Auth =
  /** Sent only as the X-Redmine-API-Key header. The `?key=` query form is not offered. */
  | { apiKey: string }
  | { basic: { login: string; password: string } }
  /** OAuth2 (Redmine 6.1+). */
  | { bearer: string | BearerSource };

export interface BearerSource {
  token(): string | Promise<string>;
  /**
   * Called after a 401. Single-flight: concurrent 401s share one refresh. The failed request replays
   * once, and only when its body is replayable.
   */
  refresh?(): string | Promise<string>;
}

/** What the engine uses. The Auth union never travels past config. */
export interface Authenticator {
  headers(): Promise<Record<string, string>>;
  /** Resolves true when credentials changed and a replay is worthwhile. */
  onUnauthorized(): Promise<boolean>;
}

export function authenticator(_auth: Auth | undefined): Authenticator {
  throw new Error("not implemented");
  // apiKey -> { "X-Redmine-API-Key": key }
  // basic  -> "Basic " + base64(utf8(login:password)), no btoa on raw strings
  // bearer -> "Bearer " + await token(); onUnauthorized runs refresh() single-flight, returns false without refresh
}

export interface RetryPolicy {
  /** Extra attempts after the first. Default 2. */
  attempts: number;
  /** Full-jitter exponential backoff base. Default 250. */
  baseMs: number;
  /** Cap for backoff and for Retry-After. Default 5000. */
  maxMs: number;
}

export interface RedmineConfig<V extends RedmineVersion = RedmineVersion> {
  /** "https://host/redmine" and "https://host/redmine/" are the same; the subpath is kept. Userinfo is rejected. */
  baseUrl: string | URL;
  auth?: Auth;
  /**
   * The server's Redmine version, declared because Redmine never reports it. Narrows the client type and
   * refuses operations the version lacks before any request. Omit it to get every operation, unguarded.
   */
  version?: V;
  /** For proxies, internal CAs, browsers behind a CORS proxy, and tests. Default globalThis.fetch. */
  fetch?: typeof fetch;
  /** Per attempt. Default 30000. */
  timeoutMs?: number;
  /** In-flight requests per client (shared with clients derived through `with`). Default 4. */
  maxConcurrent?: number;
  retry?: Partial<RetryPolicy> | false;
  /** Symptom-based response fixes, such as hours arriving as "8/1". Default true. */
  normalize?: boolean;
  /** One observation point for logging and audit. Events never carry credentials. */
  onEvent?: (event: SdkEvent) => void;
}

export type SdkEvent =
  | { type: "request"; op: string; method: string; url: string; attempt: number }
  | { type: "response"; op: string; status: number; ms: number; attempt: number }
  | { type: "retry"; op: string; attempt: number; delay_ms: number; reason: string }
  | { type: "error"; op: string; error: RedmineError };

/** Per-call options. `rm.with(options)` bakes them into a derived client. Never global state. */
export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** X-Redmine-Switch-User. Admin only; a bad login fails with kind "switch_user_rejected". */
  as?: string;
  retry?: Partial<RetryPolicy> | false;
}

/** Validated config. Everything downstream trusts it. */
export interface ResolvedConfig {
  /** Always ends with "/", http or https only. */
  readonly base: URL;
  readonly version: RedmineVersion | undefined;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
  readonly maxConcurrent: number;
  readonly retry: RetryPolicy | null;
  readonly normalize: boolean;
  readonly auth: Authenticator;
  readonly onEvent: ((event: SdkEvent) => void) | undefined;
}

export function resolveConfig(_config: RedmineConfig): ResolvedConfig {
  throw new Error("not implemented");
  // parse URL, reject userinfo and non-http(s) with invalid_input, force a trailing "/",
  // check version against VERSIONS (invalid_input), apply defaults, build the Authenticator
}
