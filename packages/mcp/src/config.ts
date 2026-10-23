// The CLI boundary: flags and environment become one RedmineConfig, or one message naming what is
// wrong. Values are never echoed, so a bad setting cannot leak the API key.

import { isIPv4, isIPv6 } from "node:net";
import { parseArgs } from "node:util";
import { localhostAllowedHostnames } from "@modelcontextprotocol/server";
import { parseRedmineVersion, RedmineError } from "@redmine-ts/sdk";
import type { Access, RedmineConfig } from "@redmine-ts/sdk";
import { z } from "zod";
import type { RedmineMcpHandlerOptions } from "./http.ts";
import { ACCESS_ORDER } from "./tools.ts";

export type CliCommand =
  | { kind: "serve"; config: RedmineConfig }
  | {
      kind: "http";
      host: string;
      port: number;
      options: RedmineMcpHandlerOptions;
      /** REDMINE_API_KEY is set, and HTTP does not read it. */
      apiKeyIgnored: boolean;
    }
  | { kind: "help" }
  | { kind: "error"; message: string };

/** Clear of Redmine's own 3000, the MCP Inspector's 6274 and 6277, and the usual 8000 and 8080. */
const DEFAULT_PORT = 3737;

export const USAGE: string = `Usage: redmine-mcp [--read-only] [--no-delete]
       redmine-mcp --http [--port <n>] [--host <addr>] [--allow-origin <hostname>]...

Serves the Redmine REST API as MCP tools over stdio, or over Streamable HTTP at /mcp.

Environment:
  REDMINE_URL          Base URL of the Redmine instance, subpath included
  REDMINE_API_KEY      API key of the Redmine user the tools act as. Not read over
                       HTTP, where each request sends its own in X-Redmine-API-Key
  REDMINE_VERSION      Optional: 6.1 or 7.0, hides tools the server lacks
  REDMINE_MCP_ACCESS   Optional: full (default), no-delete or read-only

Flags:
  --read-only          List and send only reads
  --no-delete          Hide and refuse deletes
  --http               Serve Streamable HTTP instead of stdio
  --port <n>           HTTP port, default ${DEFAULT_PORT}; 0 picks a free one
  --host <addr>        Address to listen on, default 127.0.0.1
  --allow-origin <hostname>
                       Accept browser requests whose Origin has this hostname.
                       Repeatable. Without it, any request with an Origin gets 403
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

const PORT = "must be a port from 0 to 65535, where 0 picks a free one";

/** Each request brings its own key. Flags are keyed as typed, so an issue's path names the flag. */
const HttpSettings = Env.omit({ REDMINE_API_KEY: true }).extend({
  "--port": z
    .string()
    .regex(/^\d{1,5}$/, { error: PORT })
    .transform(Number)
    .refine((port) => port <= 65535, { error: PORT })
    .default(DEFAULT_PORT),
  "--host": z.string().trim().min(1, { error: "is empty" }).default("127.0.0.1"),
  "--allow-origin": z
    .array(z.string())
    .refine((hostnames) => hostnames.every(isHostname), {
      error: "takes a hostname such as app.example.com, without scheme or port",
    })
    .default([]),
});

const HTTP_FLAGS = ["port", "host", "allow-origin"] as const;

interface Flags {
  "read-only"?: boolean;
  "no-delete"?: boolean;
  http?: boolean;
  port?: string;
  host?: string;
  "allow-origin"?: string[];
  help?: boolean;
}

export function parseCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CliCommand {
  let flags: Flags;
  try {
    flags = parseArgs({
      args: [...argv],
      options: {
        "read-only": { type: "boolean" },
        "no-delete": { type: "boolean" },
        http: { type: "boolean" },
        port: { type: "string" },
        host: { type: "string" },
        "allow-origin": { type: "string", multiple: true },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (flags.help) return { kind: "help" };
  if (flags.http) return httpCommand(flags, env);
  const stray = HTTP_FLAGS.filter((flag) => flags[flag] !== undefined);
  if (stray.length > 0) {
    return {
      kind: "error",
      message: `${stray.map((flag) => `--${flag}`).join(", ")} need${stray.length === 1 ? "s" : ""} --http`,
    };
  }

  const parsed = Env.safeParse(env);
  if (!parsed.success) return invalid(parsed.error);
  const { REDMINE_URL, REDMINE_API_KEY, REDMINE_VERSION, REDMINE_MCP_ACCESS } = parsed.data;
  return {
    kind: "serve",
    config: {
      baseUrl: REDMINE_URL,
      auth: { apiKey: REDMINE_API_KEY },
      ...(REDMINE_VERSION === undefined ? {} : { version: REDMINE_VERSION }),
      access: strictest(REDMINE_MCP_ACCESS, flags),
    },
  };
}

function httpCommand(flags: Flags, env: Readonly<Record<string, string | undefined>>): CliCommand {
  const parsed = HttpSettings.safeParse({
    ...env,
    "--port": flags.port,
    "--host": flags.host,
    "--allow-origin": flags["allow-origin"],
  });
  if (!parsed.success) return invalid(parsed.error);
  const { REDMINE_URL, REDMINE_VERSION, REDMINE_MCP_ACCESS } = parsed.data;
  const { "--port": port, "--host": host, "--allow-origin": allowedOrigins } = parsed.data;
  const loopback =
    host === "localhost" || host === "::1" || (isIPv4(host) && host.startsWith("127."));
  return {
    kind: "http",
    host,
    port,
    options: {
      baseUrl: REDMINE_URL,
      ...(REDMINE_VERSION === undefined ? {} : { version: REDMINE_VERSION }),
      access: strictest(REDMINE_MCP_ACCESS, flags),
      allowedOrigins,
      // A browser page on another site may reach a loopback port, but its Host still names that site.
      ...(loopback
        ? { allowedHosts: [...localhostAllowedHostnames(), isIPv6(host) ? `[${host}]` : host] }
        : {}),
    },
    apiKeyIgnored: blankToUndefined(env.REDMINE_API_KEY) !== undefined,
  };
}

function strictest(fromEnv: Access | undefined, flags: Flags): Access {
  const requested: Access[] = [
    fromEnv ?? "full",
    ...(flags["no-delete"] ? (["no-delete"] as const) : []),
    ...(flags["read-only"] ? (["read-only"] as const) : []),
  ];
  const at = Math.max(...requested.map((mode) => ACCESS_ORDER.indexOf(mode)));
  return ACCESS_ORDER[at] ?? "read-only";
}

function invalid(error: z.ZodError): CliCommand {
  const lines = error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
  return { kind: "error", message: lines.join("\n") };
}

/** What the SDK compares an Origin against: the hostname URL parsing yields, lowercase, IPv6 in brackets. */
function isHostname(value: string): boolean {
  try {
    return new URL(`http://${value}`).hostname === value;
  } catch {
    return false;
  }
}
