// Everything a caller configures, validated once at createRedmine. Data is snake_case (the wire is the
// domain); SDK options are camelCase (they are SDK concepts, not Redmine's).

import { VERSIONS, type RedmineVersion } from "../generated/versions.ts";
import type { RedmineError } from "./errors.ts";
import type { HttpMethod } from "./op.ts";
import { invalidInput, own } from "./util.ts";

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
  /**
   * Resolves true when credentials changed and a replay is worthwhile. `sent` are the headers of the
   * request that got the 401, so a late 401 from before a refresh does not trigger a second refresh.
   */
  onUnauthorized(sent: Readonly<Record<string, string>>): Promise<boolean>;
}

export function authenticator(auth: Auth | undefined): Authenticator {
  if (auth === undefined) return fixedHeaders({});
  if ("apiKey" in auth) {
    if (!auth.apiKey) throw invalidInput("auth.apiKey is empty");
    return fixedHeaders({ "X-Redmine-API-Key": auth.apiKey });
  }
  if ("basic" in auth) {
    const { login, password } = auth.basic;
    if (!login || login.includes(":")) {
      throw invalidInput("auth.basic.login must be non-empty and must not contain ':'");
    }
    const bytes = new TextEncoder().encode(`${login}:${password}`);
    return fixedHeaders({ Authorization: `Basic ${toBase64(bytes)}` });
  }
  const bearer = auth.bearer;
  if (typeof bearer === "string") return fixedHeaders({ Authorization: `Bearer ${bearer}` });
  return bearerAuthenticator(bearer);
}

function fixedHeaders(headers: Record<string, string>): Authenticator {
  return {
    headers: async () => ({ ...headers }),
    onUnauthorized: async () => false,
  };
}

function bearerAuthenticator(source: BearerSource): Authenticator {
  const refresh = source.refresh?.bind(source);
  let refreshed: string | undefined;
  let inflight: Promise<boolean> | undefined;
  return {
    async headers() {
      return { Authorization: `Bearer ${refreshed ?? (await source.token())}` };
    },
    async onUnauthorized(sent) {
      if (!refresh) return false;
      if (refreshed !== undefined && sent.Authorization !== `Bearer ${refreshed}`) return true;
      inflight ??= (async () => {
        try {
          refreshed = await refresh();
          return true;
        } finally {
          inflight = undefined;
        }
      })();
      return inflight;
    },
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Which HTTP methods the client sends. Anything else is refused with kind "access_denied" before a request. */
export type Access = "full" | "no-delete" | "read-only";

/** The methods each restricted mode allows. "full" allows every method. */
export const ACCESS_METHODS: Readonly<Record<Exclude<Access, "full">, readonly HttpMethod[]>> = {
  "read-only": ["GET"],
  "no-delete": ["GET", "POST", "PUT", "PATCH"],
};

export interface RetryPolicy {
  /** Extra attempts after the first. Default 2. */
  attempts: number;
  /** Full-jitter exponential backoff base. Default 250. */
  baseMs: number;
  /** Cap for backoff and for Retry-After. Default 5000. */
  maxMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { attempts: 2, baseMs: 250, maxMs: 5000 };

export interface RedmineConfig<V extends RedmineVersion = RedmineVersion> {
  /** "https://host/redmine" and "https://host/redmine/" are the same; the subpath is kept. Userinfo is rejected. */
  baseUrl: string | URL;
  auth?: Auth;
  /**
   * The server's Redmine version, declared because Redmine never reports it. Narrows the client type and
   * refuses operations the version lacks before any request. Omit it to get every operation, unguarded.
   */
  version?: V;
  /**
   * "read-only" sends only GET, "no-delete" refuses DELETE, "full" (the default) sends everything. Applies to
   * every method, listing, extra and `rm.request`, and is checked before any request.
   */
  access?: Access;
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
  /** X-Redmine-Switch-User. Only an admin key switches (a non-admin key silently stays itself); a bad login fails with kind "switch_user_rejected". */
  as?: string;
  retry?: Partial<RetryPolicy> | false;
}

/** Validated config. Everything downstream trusts it. */
export interface ResolvedConfig {
  /** Always ends with "/", http or https only. */
  readonly base: URL;
  readonly version: RedmineVersion | undefined;
  readonly access: Access;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
  readonly maxConcurrent: number;
  readonly retry: RetryPolicy | null;
  readonly normalize: boolean;
  readonly auth: Authenticator;
  readonly onEvent: ((event: SdkEvent) => void) | undefined;
}

export function resolveConfig(config: RedmineConfig): ResolvedConfig {
  const { fetch: custom, version, access = "full" } = config;
  if (version !== undefined && !VERSIONS.includes(version)) {
    throw invalidInput(
      `unsupported Redmine version "${String(version)}", expected one of ${VERSIONS.join(", ")}`,
    );
  }
  if (access !== "full" && own(ACCESS_METHODS, access) === undefined) {
    throw invalidInput(
      `access must be "full", "no-delete" or "read-only", got "${String(access)}"`,
    );
  }
  return {
    base: parseBase(config.baseUrl),
    version,
    access,
    // Called through a wrapper: a bare `globalThis.fetch` throws "Illegal invocation" when called as a method.
    fetch: custom ?? ((input, init) => globalThis.fetch(input, init)),
    timeoutMs: positive("timeoutMs", config.timeoutMs ?? 30_000),
    maxConcurrent: positiveInteger("maxConcurrent", config.maxConcurrent ?? 4),
    retry: resolveRetry(config.retry ?? {}),
    normalize: config.normalize ?? true,
    auth: authenticator(config.auth),
    onEvent: config.onEvent,
  };
}

/** Defaults filled in and validated. `false` disables retries. */
export function resolveRetry(retry: Partial<RetryPolicy> | false): RetryPolicy | null {
  if (retry === false) return null;
  const { attempts, baseMs, maxMs } = { ...DEFAULT_RETRY, ...retry };
  return {
    attempts: nonNegativeInteger("retry.attempts", attempts),
    baseMs: nonNegative("retry.baseMs", baseMs),
    maxMs: nonNegative("retry.maxMs", maxMs),
  };
}

function parseBase(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalidInput("baseUrl is not a valid absolute URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidInput(`baseUrl must be http or https, got ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw invalidInput("baseUrl must not contain credentials, pass them through `auth`");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function positive(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0)
    throw invalidInput(`${name} must be a positive number`);
  return value;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1)
    throw invalidInput(`${name} must be a positive integer`);
  return value;
}

function nonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw invalidInput(`${name} must be a non-negative number`);
  return value;
}

function nonNegativeInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0)
    throw invalidInput(`${name} must be a non-negative integer`);
  return value;
}
