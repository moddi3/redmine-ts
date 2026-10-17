// Assembly: engine + generated namespaces + the few hand-written additions = the public client.
// The only module that imports both the engine and generated slot data.

import type { CallOptions, RedmineConfig } from "./core/config.ts";
import type { AttachmentFiles } from "./core/files.ts";
import type { Resources } from "./generated/resources.ts";
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
export interface RawRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Readonly<Record<string, string | number | boolean | readonly (string | number)[]>>;
  body?: unknown;
}

export interface Core<V extends RedmineVersion> {
  /** A derived client sharing the engine and its concurrency limit, e.g. `rm.with({ as: "jsmith" })`. */
  with(defaults: CallOptions): Redmine<V>;
  request(request: RawRequest, options?: CallOptions): Promise<unknown>;
  readonly version: V | undefined;
}

/**
 * Every operation is `rm.<namespace>.<verb>(input, options?)` with one flat snake_case input. Extras
 * merge into the generated namespaces by name (`rm.issues.transition`, `rm.attachments.upload`).
 */
export type Redmine<V extends RedmineVersion = LatestVersion> = MergeNamespaces<
  Resources<V>,
  Extras
> &
  Core<V>;

type MergeNamespaces<G, E> = {
  [K in keyof G | keyof E]: (K extends keyof G ? G[K] : unknown) &
    (K extends keyof E ? E[K] : unknown);
};

export function createRedmine<const V extends RedmineVersion = LatestVersion>(
  _config: RedmineConfig<V>,
): Redmine<V> {
  throw new Error("not implemented");
  // config = resolveConfig(config); engine = createEngine(config)
  // build(defaults): walk SLOTS once; each method is (input, options) =>
  //   engine.call(op, input ?? {}, { ...defaults, ...options })
  // merge Extras into the namespaces by name, add with (build({ ...defaults, ...d })), request and version; freeze
}
