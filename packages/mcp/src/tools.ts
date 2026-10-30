// The one shape every tool takes, generated or hand-written, so listing, filtering and calling never
// ask where a tool came from.

import type { ContentBlock } from "@modelcontextprotocol/server";
import { VERSIONS } from "@redmine-ts/sdk";
import type { Access, Redmine, RedmineVersion } from "@redmine-ts/sdk";
import type { JsonSchema } from "@redmine-ts/sdk/catalog";
import type { ResultBudget } from "./result-budget.ts";
import type { Lookups } from "./workflow/lookups.ts";

/** Any declared version: tools see the whole client surface, and the SDK guards versions at runtime. */
export type Client = Redmine<RedmineVersion>;

/** What a tool needs the access mode to allow. */
export type Tier = "read" | "write" | "delete";

/** The catalog's schema type, plus `default`, which tool inputs declare for paging. */
export type Schema = JsonSchema & { readonly default?: unknown };

export interface Annotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

/**
 * The one local directory tools may use. Only Node code builds one (`localFiles` from
 * `@redmine-ts/mcp/node`), so a server without it, such as every HTTP server, cannot reach the file
 * system at all.
 */
export interface LocalFiles {
  /** The directory's absolute path with symlinks resolved, as tool descriptions, errors and saved paths name it. */
  readonly dir: string;
  /**
   * A regular file inside the directory, refused with kind invalid_input before anything is read otherwise.
   * `bytes()` refuses the same way when the file changed after `open`, or when it cannot be opened.
   */
  open(path: string): Promise<{ size: number; bytes(): Promise<Uint8Array> }>;
  /** Writes `body` to a new file named after `filename` that never replaces an existing one. */
  save(
    filename: string,
    fallback: string,
    body: ReadableStream<Uint8Array>,
  ): Promise<{ path: string; bytes: number }>;
}

/**
 * What one server lends its tools across calls. No channel to the client: http.ts holds a bearer
 * response until the call ends, so progress would arrive with the result.
 */
export interface ToolContext {
  /** Statuses, trackers and the other global lists, cached for a few minutes. */
  readonly lookups: Lookups;
  /** Where `path` inputs read from and saved attachments go, when the server has a files directory. */
  readonly files: LocalFiles | undefined;
  /** The size at which tools that set `budgeted` stop filling their result. */
  readonly budget: ResultBudget;
}

export interface ToolResult {
  /** Becomes structuredContent and the JSON text block. */
  readonly structured: Record<string, unknown>;
  /** Blocks JSON cannot carry, such as an image, sent after the JSON block. */
  readonly extra?: readonly ContentBlock[];
}

export interface ToolSpec {
  /** `<namespace>_<verb>` in snake_case. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** Checks every call, and is what tools/list shows unless listedInputSchema is set. */
  readonly inputSchema: Schema;
  /**
   * What tools/list shows in place of inputSchema. List tools show one loose condition for every filter
   * in `where`, and a table of the filters in its description, because a schema per filter is too large.
   */
  readonly listedInputSchema?: Schema;
  readonly outputSchema: Schema;
  readonly annotations: Annotations;
  readonly tier: Tier;
  readonly since: RedmineVersion;
  readonly until: RedmineVersion | null;
  /**
   * Set when Redmine answers 403 to every key but an admin's: what works without an admin key, or ""
   * when nothing does. The description and the 403 error say that the tool needs one, and add it.
   */
  readonly adminOnly?: string;
  /** Set when the tool stops filling its result at the result budget, as list tools do. */
  readonly budgeted?: boolean;
  readonly reusedAsInput?: boolean;
  /** Redmine failures reject with a RedmineError. */
  readonly run: (
    rm: Client,
    input: Record<string, unknown>,
    context: ToolContext,
  ) => Promise<ToolResult>;
}

const TIERS: Readonly<Record<Access, readonly Tier[]>> = {
  full: ["read", "write", "delete"],
  "no-delete": ["read", "write"],
  "read-only": ["read"],
};

/** Least to most restrictive, so the strictest of several requested modes is the highest index. */
export const ACCESS_ORDER: readonly Access[] = ["full", "no-delete", "read-only"];

/** The most restrictive of `modes`. */
export function strictest(...modes: readonly Access[]): Access {
  const at = Math.max(...modes.map((mode) => ACCESS_ORDER.indexOf(mode)));
  return ACCESS_ORDER[at] ?? "read-only";
}

/** Whether `access` lets a call of `tier` through. */
export function allows(access: Access, tier: Tier): boolean {
  return TIERS[access].includes(tier);
}

/**
 * Whether `url`, absolute or relative to baseUrl, is in Redmine's REST formats: a lower-case .json or
 * .xml. Redmine answers 401 to a credential it accepts on paths outside them, such as my/page.js and
 * my/page.JSON.
 */
export function isApiPath(url: string): boolean {
  return /\.(?:json|xml)$/.test(new URL(url, "http://redmine.invalid/").pathname);
}

/** Whether tools/list shows the tool. A hidden tool still answers a call, and the SDK refuses it. */
export function isListed(
  tool: ToolSpec,
  access: Access,
  version: RedmineVersion | undefined,
): boolean {
  if (!allows(access, tool.tier)) return false;
  if (version === undefined) return true;
  const at = VERSIONS.indexOf(version);
  return (
    at >= VERSIONS.indexOf(tool.since) &&
    (tool.until === null || at <= VERSIONS.indexOf(tool.until))
  );
}
