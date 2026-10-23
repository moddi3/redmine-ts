// The CLI boundary: flags and environment become one RedmineConfig, or one message naming what is
// wrong. Values are never echoed, so a bad setting cannot leak the API key.

import { parseArgs } from "node:util";
import { parseRedmineVersion, RedmineError } from "@redmine-ts/sdk";
import type { Access, RedmineConfig } from "@redmine-ts/sdk";
import { z } from "zod";
import { ACCESS_ORDER } from "./tools.ts";

export type CliCommand =
  | { kind: "serve"; config: RedmineConfig }
  | { kind: "help" }
  | { kind: "error"; message: string };

export const USAGE = `Usage: redmine-mcp [--read-only] [--no-delete]

Serves the Redmine REST API as MCP tools over stdio.

Environment:
  REDMINE_URL          Base URL of the Redmine instance, subpath included
  REDMINE_API_KEY      API key of the Redmine user the tools act as
  REDMINE_VERSION      Optional: 6.1 or 7.0, hides tools the server lacks
  REDMINE_MCP_ACCESS   Optional: full (default), no-delete or read-only

Flags:
  --read-only          List and send only reads
  --no-delete          Hide and refuse deletes
  --help               Show this help

When several access settings are given, the strictest wins.`;

const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const Env = z.object({
  REDMINE_URL: z.url({
    protocol: /^https?$/,
    error: "must be an http or https URL, such as https://tracker.example.com/redmine",
  }),
  REDMINE_API_KEY: z
    .string({ error: "is required: the API key from My account in Redmine" })
    .trim()
    .min(1, { error: "is empty" }),
  REDMINE_VERSION: z.preprocess(
    blankToUndefined,
    z
      .string()
      .optional()
      .transform((raw, ctx) => {
        if (raw === undefined) return undefined;
        try {
          return parseRedmineVersion(raw);
        } catch (error) {
          if (!RedmineError.is(error, "invalid_input")) throw error;
          ctx.addIssue({ code: "custom", message: error.data.detail });
          return z.NEVER;
        }
      }),
  ),
  REDMINE_MCP_ACCESS: z.preprocess(
    blankToUndefined,
    z.enum(ACCESS_ORDER, { error: `must be one of ${ACCESS_ORDER.join(", ")}` }).optional(),
  ),
});

export function parseCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CliCommand {
  let flags: { "read-only"?: boolean; "no-delete"?: boolean; help?: boolean };
  try {
    flags = parseArgs({
      args: [...argv],
      options: {
        "read-only": { type: "boolean" },
        "no-delete": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (flags.help) return { kind: "help" };

  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
    return { kind: "error", message: lines.join("\n") };
  }
  const { REDMINE_URL, REDMINE_API_KEY, REDMINE_VERSION, REDMINE_MCP_ACCESS } = parsed.data;
  const requested: Access[] = [
    REDMINE_MCP_ACCESS ?? "full",
    ...(flags["no-delete"] ? (["no-delete"] as const) : []),
    ...(flags["read-only"] ? (["read-only"] as const) : []),
  ];
  const strictest = Math.max(...requested.map((mode) => ACCESS_ORDER.indexOf(mode)));
  return {
    kind: "serve",
    config: {
      baseUrl: REDMINE_URL,
      auth: { apiKey: REDMINE_API_KEY },
      ...(REDMINE_VERSION === undefined ? {} : { version: REDMINE_VERSION }),
      access: ACCESS_ORDER[strictest] ?? "read-only",
    },
  };
}
