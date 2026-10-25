// Assembly: engine + generated namespaces + the few hand-written additions = the public client.
// The only module that imports both the engine and generated slot data.

import { resolveConfig } from "./core/config.ts";
import type { Access, AllowedMethods, CallOptions, RedmineConfig } from "./core/config.ts";
import { createEngine } from "./core/engine.ts";
import type { Engine } from "./core/engine.ts";
import { RedmineError } from "./core/errors.ts";
import { createAttachmentFiles, createUploadingCall } from "./core/files.ts";
import type { AttachmentFiles } from "./core/files.ts";
import { uploadKey, type AnyOp, type HttpMethod } from "./core/op.ts";
import { invalidInput, isRecord, own } from "./core/util.ts";
import { ops } from "./generated/ops.ts";
import type { HttpMethods, Resources } from "./generated/resources.ts";
import { SLOTS } from "./generated/slots.ts";
import { VERSIONS } from "./generated/versions.ts";
import type { LatestVersion, RedmineVersion } from "./generated/versions.ts";

/**
 * Domain verbs that need more than one request or binary handling. The only home of hand-written
 * resource logic. They add new names; they never replace a generated method.
 */
export interface Extras {
  issues: {
    /**
     * Validated status change: reads include=allowed_statuses, refuses locally with kind
     * "transition_not_allowed" listing the allowed ids, then updates. Sends nothing when the issue is
     * already in the target status and there are no notes.
     */
    transition(
      input: { issue_id: number; status_id: number; notes?: string },
      options?: CallOptions,
    ): Promise<void>;
  };
  attachments: AttachmentFiles;
}

/**
 * The HTTP method each extra sends, beside the generated HttpMethods. For one that reads before it
 * writes, the write, as in the catalog. An extra missing here fails the build.
 */
type ExtraHttpMethods = Classified<
  Extras,
  {
    issues: { transition: "PUT" };
    attachments: { upload: "POST"; download: "GET"; thumbnail: "GET" };
  }
>;

/** `M`, checked to give every method of every namespace in `T` an HTTP method. */
type Classified<T, M extends { [N in keyof T]: { [K in keyof T[N]]: HttpMethod } }> = M;

/**
 * The modes in table `T` that allow PUT or PATCH but not POST. A create or update with files in `uploads` also
 * sends POST uploads.json, while HttpMethods and the catalog name only the record's method, so the client type
 * is exact only while this is empty.
 */
export type WritesWithoutPost<T> = {
  [A in keyof T]: [Extract<T[A], "PUT" | "PATCH">] extends [never]
    ? never
    : "POST" extends T[A]
      ? never
      : A;
}[keyof T];
export const inlineUploadsFitAccess: [WritesWithoutPost<AllowedMethods>] extends [never]
  ? true
  : never = true;

/** A hand-written method named like a generated one would be a second way to do one task. Fails the build. */
type Shadowed<G, E> = {
  [R in keyof E & keyof G]: keyof E[R] & keyof G[R];
}[keyof E & keyof G];
export const extrasDoNotShadow: [Shadowed<Resources<LatestVersion>, Extras>] extends [never]
  ? true
  : never = true;

/**
 * An untyped request for endpoints the spec does not cover (plugins, new server features). `path` is
 * relative to baseUrl, without a leading slash, e.g. "agile_boards.json". The response is parsed JSON,
 * or undefined for an empty body. Same auth, retries, timeouts, concurrency and errors as typed calls.
 */
export interface RawRequest<M extends HttpMethod = HttpMethod> {
  /** A literal `access` narrows it: only "GET" on a read-only client, no "DELETE" on a no-delete one. */
  method: M;
  path: string;
  query?: Readonly<Record<string, string | number | boolean | readonly (string | number)[]>>;
  /** How an array in `query` is written: `k[]=a&k[]=b` (default), `k=a,b`, or `k=a&k=b`. */
  arrayFormat?: ArrayFormat;
  /**
   * Any JSON value, sent verbatim as application/json: an object, array, string, number, boolean or
   * null. `undefined` sends no body. A function, symbol, bigint or non-finite number is refused.
   * Not allowed on GET.
   */
  body?: unknown;
}

export type ArrayFormat = "brackets" | "comma" | "repeat";

const ARRAY_STYLES = { brackets: "brackets", comma: "csv", repeat: "repeat" } as const;

export interface Core<V extends RedmineVersion, A extends Access = "full"> {
  /** A derived client sharing the engine and its concurrency limit, e.g. `rm.with({ as: "jsmith" })`. */
  with(defaults: CallOptions): Redmine<V, A>;
  request(request: RawRequest<AllowedMethods[A]>, options?: CallOptions): Promise<unknown>;
  readonly version: V | undefined;
}

/**
 * Every operation is `rm.<namespace>.<verb>(input, options?)` with one flat snake_case input. Extras
 * merge into the generated namespaces by name (`rm.issues.transition`, `rm.attachments.upload`). A
 * literal `access` keeps only the methods that send what it allows.
 */
export type Redmine<
  V extends RedmineVersion = LatestVersion,
  A extends Access = "full",
> = Permitted<
  MergeNamespaces<Resources<V>, Extras>,
  MergeNamespaces<HttpMethods, ExtraHttpMethods>,
  AllowedMethods[A]
> &
  Core<V, A>;

/** Namespaces T without the methods whose HTTP method in M is not allowed. Allowing every method keeps T as is. */
type Permitted<T, M, Allowed extends HttpMethod> = HttpMethod extends Allowed
  ? T
  : {
      [N in keyof T]: {
        [K in keyof T[N] as M extends Record<N, Record<K, Allowed>> ? K : never]: T[N][K];
      };
    };

type MergeNamespaces<G, E> = {
  [K in keyof G | keyof E]: (K extends keyof G ? G[K] : unknown) &
    (K extends keyof E ? E[K] : unknown);
};

export function createRedmine<
  const V extends RedmineVersion = LatestVersion,
  const A extends Access = "full",
>(config: RedmineConfig<V, A>): Redmine<V, A> {
  const resolved = resolveConfig(config);
  const engine = createEngine(resolved);
  const uploading = createUploadingCall(engine, ops.uploadAttachmentFile);

  const build = (defaults: CallOptions): Redmine<V, A> => {
    const merge = (options?: CallOptions): CallOptions => ({ ...defaults, ...options });
    const namespaces: Record<string, Record<string, unknown>> = {};
    for (const [namespace, verbs] of Object.entries(SLOTS)) {
      namespaces[namespace] = Object.fromEntries(
        Object.entries(verbs).map(([verb, op]) => [
          verb,
          uploadKey(op) === undefined
            ? (input: unknown, options?: CallOptions) =>
                engine.call(op, input ?? {}, merge(options))
            : (input: unknown, options?: CallOptions) => uploading(op, input ?? {}, merge(options)),
        ]),
      );
    }
    for (const [namespace, methods] of Object.entries(extraMethods(engine, merge))) {
      namespaces[namespace] = { ...namespaces[namespace], ...methods };
    }
    const core: Core<V, A> = {
      with: (more) => build({ ...defaults, ...more }),
      request: async (raw, options) => engine.call(rawOp(raw), rawInput(raw), merge(options)),
      version: config.version,
    };
    // The namespaces are assembled from data, so `Redmine<V, A>` is vouched for by the generator, not provable here.
    return Object.freeze({ ...namespaces, ...core }) as unknown as Redmine<V, A>;
  };

  return build({});
}

/** The hand-written verbs, merged into the generated namespaces of the same name. */
function extraMethods(
  engine: Engine,
  merge: (options?: CallOptions) => CallOptions,
): Record<string, Record<string, unknown>> {
  const transition = createIssueTransition(engine, { get: ops.getIssue, update: ops.updateIssue });
  const files = createAttachmentFiles(engine, {
    upload: ops.uploadAttachmentFile,
    download: ops.downloadAttachmentFile,
    thumbnail: ops.downloadThumbnail,
  });
  return {
    issues: {
      transition: (input: never, options?: CallOptions) => transition(input, merge(options)),
    },
    attachments: {
      upload: (input: never, options?: CallOptions) => files.upload(input, merge(options)),
      download: (attachment: never, options?: CallOptions) =>
        files.download(attachment, merge(options)),
      thumbnail: (attachment: never, options?: CallOptions) =>
        files.thumbnail(attachment, merge(options)),
    },
  };
}

/** `issues.transition`, built from the descriptors of the two operations it composes. */
export function createIssueTransition(
  engine: Engine,
  { get, update }: { get: AnyOp; update: AnyOp },
): Extras["issues"]["transition"] {
  // AnyOp erases the return type, so state what these operations resolve to.
  const call = (
    op: AnyOp,
    input: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<unknown> => engine.call(op, input, options);
  return async ({ issue_id, status_id, notes }, options) => {
    // The read would go out before the update is refused, so refuse the whole transition up front.
    const refused = engine.refusal(update);
    if (refused) throw refused;
    const issue = await call(get, { issue_id, include: ["allowed_statuses"] }, options);
    const { current, allowed } = readStatuses(issue, get.id);
    const hasNotes = notes !== undefined && notes !== "";
    if (current === status_id && !hasNotes) return;
    if (current !== status_id && allowed !== undefined && !allowed.includes(status_id)) {
      throw new RedmineError(
        { kind: "transition_not_allowed", wanted: status_id, allowed },
        { op: update.id },
      );
    }
    await call(update, { issue_id, status_id, ...(hasNotes ? { notes } : {}) }, options);
  };
}

function readStatuses(
  issue: unknown,
  op: string,
): { current: number | undefined; allowed: number[] | undefined } {
  if (!isRecord(issue)) {
    throw new RedmineError(
      { kind: "protocol", reason: "bad_json", hint: "the issue response is not an object" },
      { op },
    );
  }
  const idOf = (value: unknown): number | undefined =>
    isRecord(value) && typeof value.id === "number" ? value.id : undefined;
  const { status, allowed_statuses: allowed } = issue;
  return {
    current: idOf(status),
    allowed: Array.isArray(allowed) ? allowed.flatMap((s) => idOf(s) ?? []) : undefined,
  };
}

/** An Op for `rm.request`: the whole pipeline runs on data, so an untyped request is just an unregistered Op. */
function rawOp(raw: RawRequest): AnyOp {
  if (raw.body !== undefined && raw.method === "GET") {
    throw invalidInput("a GET request cannot carry a body");
  }
  const arrays = own(ARRAY_STYLES, raw.arrayFormat ?? "brackets");
  if (arrays === undefined) {
    throw invalidInput('arrayFormat must be "brackets", "comma" or "repeat"');
  }
  const query = Object.fromEntries(
    Object.entries(raw.query ?? {}).map(
      ([key, value]) => [key, Array.isArray(value) ? arrays : "scalar"] as const,
    ),
  );
  return {
    id: "request",
    method: raw.method,
    path: raw.path,
    pathParams: [],
    query,
    filters: {},
    customFieldFilters: false,
    body: raw.body === undefined ? null : { kind: "value", key: bodyKey(query) },
    response: { kind: "item", unwrap: null },
    includes: [],
    since: VERSIONS[0],
    until: null,
    safety: raw.method === "GET" ? "read" : raw.method === "DELETE" ? "idempotent" : "write",
    stability: "stable",
  };
}

function rawInput(raw: RawRequest): Record<string, unknown> {
  const query = raw.query ?? {};
  return raw.body === undefined ? { ...query } : { ...query, [bodyKey(query)]: raw.body };
}

/** The input key that carries the body: "body", moved aside when a query parameter has that name. */
function bodyKey(query: Readonly<Record<string, unknown>>): string {
  let key = "body";
  while (Object.hasOwn(query, key)) key = `_${key}`;
  return key;
}
