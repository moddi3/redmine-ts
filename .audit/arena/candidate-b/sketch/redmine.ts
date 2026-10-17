// src/redmine.ts. Assembly: engine + generated slots + three hand-written additions = the public client.
// This is the whole public surface: createRedmine, Redmine<V>, `ops`, the data types, RedmineError, and a handful of option types.

import type { AnyOp, InputOf, ReturnOf, Slot, SlotTable } from "./op.ts";
import type { CallOptions, RedmineConfig } from "./config.ts";
import type { Version, Latest } from "./version.ts";
import type { Resources, Issue } from "./generated-example.ts";
import type { Files } from "./files.ts";
import { createEngine } from "./engine.ts";
import { resolveConfig } from "./config.ts";
import { createFiles } from "./files.ts";
import { SLOTS } from "./generated-example.ts";
import { RedmineError } from "./errors.ts";

// ---------- the hand-written additions: NEW names only, never a replacement of a generated slot ----------

/** Domain verbs that need more than one request. The sole home of hand-written resource logic. */
export interface Extras {
  issues: {
    /**
     * Validated status change. GET include=allowed_statuses, refuse locally with
     * RedmineError "transition_not_allowed" (lists the allowed ids), then PUT. Idempotent: already in
     * the target status and no notes -> no request is sent.
     */
    transition(issue_id: number, status_id: number, opts?: { notes?: string } & CallOptions): Promise<void>;
  };
  files: Files;
}

/** A hand-written method with the same name as a generated one would be a second way to do one task. Fails the build. */
type Shadowed<G, E> = { [R in keyof E & keyof G]: keyof E[R] & keyof G[R] }[keyof E & keyof G];
export const extrasDoNotShadow: [Shadowed<Resources<Latest>, Extras>] extends [never] ? true : never = true;

// ---------- the client ----------

export interface Core<V extends Version> {
  /**
   * The dispatch seam for GENERIC code (the agent toolkit, plugin ops, hidden variants). Same pipeline as every
   * namespace method; namespaces are positional-argument sugar over exactly this.
   *   rm.call(ops.createIssueUnderProject, { project_id: "web", subject: "x" })
   */
  call<O extends AnyOp>(op: O, input: InputOf<O>, opts?: CallOptions): ReturnOf<O>;
  /** Immutable derived client sharing the same engine and semaphore. For per-user impersonation, per-request signals. */
  with(defaults: CallOptions): Redmine<V>;
  readonly version: V | undefined;
}

export type Redmine<V extends Version = Latest> = Resources<V> & Extras & Core<V>;

export function createRedmine<const V extends Version = Latest>(config: RedmineConfig<V>): Redmine<V> {
  const cfg = resolveConfig(config); // the one boundary: invalid_input here or never
  const engine = createEngine(cfg);
  throw new Error("not implemented");
  // build(defaults: CallOptions): Redmine<V> =
  //   namespaces = bind(SLOTS, engine, defaults)         // generic binder below, one cast
  //   extras     = { issues: { transition }, files: createFiles(engine) }   // merged INTO namespaces by name (no collisions by NoShadow)
  //   return Object.freeze({ ...namespaces, call: (op, i, o) => engine.call(op, i, {...defaults, ...o}), with: (d) => build({...defaults, ...d}), version })
}

/**
 * The only dynamic wiring in the SDK, and the only cast: generated explicit types say what each method looks like,
 * the SlotTable says where it goes, this walks the table once.
 */
function bind(slots: SlotTable, engine: ReturnType<typeof createEngine>, defaults: CallOptions): Record<string, Record<string, (...a: unknown[]) => unknown>> {
  throw new Error("not implemented");
  // each slot -> (...args) => {
  //   path = zip(slot.positional, args.slice(0, n)) ; input = args[n] ?? {} ; opts = args[n + 1]
  //   list slots with sibling-by-project op: pick op by presence of input.project_id (generated table, not a branch in userland)
  //   return engine.call(slot.op, { ...path, ...input }, { ...defaults, ...opts })
  // }
}

async function transition(rm: Redmine, issue_id: number, status_id: number, notes?: string): Promise<void> {
  const issue: Issue = await rm.issues.get(issue_id, { include: ["allowed_statuses"] });
  throw new Error("not implemented");
  // TODO allowed = issue.allowed_statuses.map(s => s.id)
  //      if (issue.status.id === status_id && !notes) return
  //      if (!allowed.includes(status_id)) throw new RedmineError({ kind: "transition_not_allowed", wanted: status_id, allowed }, { op: "transition" })
  //      await rm.issues.update(issue_id, { status_id, notes })
}
void bind, transition;
