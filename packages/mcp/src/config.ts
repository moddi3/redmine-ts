// The CLI boundary: flags and environment become one RedmineConfig, or one message naming what is
// wrong. Values are never echoed, so a bad setting cannot leak the API key.

import { statSync } from "node:fs";
import { isIPv4, isIPv6 } from "node:net";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { localhostAllowedHostnames } from "@modelcontextprotocol/server";
import { parseRedmineVersion, RedmineError } from "@redmine-ts/sdk";
import type { Access, RedmineConfig } from "@redmine-ts/sdk";
import { z } from "zod";
import { API_KEY_HEADER, isOrigin, publicUrlProblem } from "./http.ts";
import type { RedmineMcpHandlerOptions } from "./http.ts";
import { isStrongSecret, MIN_SECRET_LENGTH, SECRET_RULE } from "./oauth/seal.ts";
import type { RedmineOAuthOptions } from "./oauth/server.ts";
import { memoryGrantStore } from "./oauth/store.ts";
import { publicFetch } from "./public-fetch.ts";
import { ACCESS_ORDER, strictest } from "./tools.ts";

export type CliCommand =
  | { kind: "serve"; config: RedmineConfig; filesDir?: string }
  | {
      kind: "http";
      host: string;
      port: number;
      options: RedmineMcpHandlerOptions;
      /** One line for each setting that is set and that HTTP does not read. */
      warnings: readonly string[];
    }
  | { kind: "help" }
  | { kind: "error"; message: string };

/** Clear of Redmine's own 3000, the MCP Inspector's 6274 and 6277, and the usual 8000 and 8080. */
const DEFAULT_PORT = 3737;

export const USAGE: string = `Usage: redmine-mcp [--read-only] [--no-delete]
       redmine-mcp --http [--port <n>] [--host <addr>] [--allow-origin <hostname|origin>]...
                          [--api-key-login] [--allow-client <hostname>]...

Serves the Redmine REST API as MCP tools over stdio, or over Streamable HTTP at /mcp
or at the path of REDMINE_MCP_PUBLIC_URL.

Environment:
  REDMINE_URL          Base URL of the Redmine instance, subpath included
  REDMINE_API_KEY      API key of the Redmine user the tools act as. Not read over
                       HTTP, where each request sends its own in X-Redmine-API-Key
  REDMINE_VERSION      Optional: 6.1 or 7.0, hides tools the server lacks
  REDMINE_MCP_ACCESS   Optional: full (default), no-delete or read-only
  REDMINE_MCP_FILES_DIR
                       Optional: a directory attachments_upload reads paths from
                       and attachments_save writes to; without it no tool touches
                       local files. Not read over HTTP

Environment for OAuth over HTTP:
  REDMINE_MCP_PUBLIC_URL
                       The URL clients reach the MCP endpoint at, such as
                       https://mcp.example.com/mcp. The server then serves its path,
                       and the OAuth paths under it, instead of /mcp
  REDMINE_MCP_AUTH_SECRET
                       Turns OAuth sign-in on: ${MIN_SECRET_LENGTH} or more random characters that
                       seal codes and tokens, from openssl rand -base64 32, never a
                       passphrase
  REDMINE_MCP_AUTH_PREVIOUS_SECRET
                       Optional: the secret before the last change, still accepted
  REDMINE_OAUTH_CLIENT_ID, REDMINE_OAUTH_CLIENT_SECRET
                       The Redmine OAuth application people sign in through
  REDMINE_PUBLIC_URL   Optional: Redmine's URL as browsers reach it, when REDMINE_URL
                       is an internal one; default REDMINE_URL

Flags:
  --read-only          List and send only reads
  --no-delete          Hide and refuse deletes
  --http               Serve Streamable HTTP instead of stdio
  --port <n>           HTTP port, default ${DEFAULT_PORT}; 0 picks a free one
  --host <addr>        Address to listen on, default 127.0.0.1
  --allow-origin <hostname|origin>
                       Accept browser requests from this hostname (any scheme and
                       port) or exact origin, such as https://app.example.com, and
                       send them CORS headers. Repeatable. Without it, any request
                       with an Origin gets 403
  --api-key-login      OAuth without a Redmine application: the consent page asks
                       for the person's API key
  --allow-client <hostname>
                       Admit only OAuth clients on this host, such as claude.ai.
                       Repeatable. Default: any client
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
  REDMINE_MCP_FILES_DIR: z.preprocess(
    blankToUndefined,
    z
      .string()
      .optional()
      .transform((raw) => (raw === undefined ? undefined : resolve(raw)))
      .refine((dir) => dir === undefined || isDirectory(dir), {
        error: "must be an existing directory",
      }),
  ),
});

const PORT = "must be a port from 0 to 65535, where 0 picks a free one";

/** Settings HTTP does not read, and why, so a set one is warned about instead of silently dropped. */
const NOT_READ_OVER_HTTP = {
  REDMINE_API_KEY: `each request sends its own key in ${API_KEY_HEADER}`,
  REDMINE_MCP_FILES_DIR: "clients over HTTP cannot use the server's local files",
} as const;

const optionalText = z.preprocess(blankToUndefined, z.string().trim().optional());

const authSecret = z.preprocess(
  blankToUndefined,
  z.string().refine(isStrongSecret, { error: SECRET_RULE }).optional(),
);

/** Settings that mean nothing without REDMINE_MCP_AUTH_SECRET. */
const OAUTH_ONLY = [
  "REDMINE_MCP_AUTH_PREVIOUS_SECRET",
  "REDMINE_OAUTH_CLIENT_ID",
  "REDMINE_OAUTH_CLIENT_SECRET",
  "REDMINE_PUBLIC_URL",
  "--api-key-login",
  "--allow-client",
] as const;

/** Flags are keyed as typed, so an issue's path names the flag. */
const HttpSettings = Env.omit({ REDMINE_API_KEY: true, REDMINE_MCP_FILES_DIR: true })
  .extend({
    REDMINE_MCP_PUBLIC_URL: optionalText,
    REDMINE_MCP_AUTH_SECRET: authSecret,
    REDMINE_MCP_AUTH_PREVIOUS_SECRET: authSecret,
    REDMINE_OAUTH_CLIENT_ID: optionalText,
    REDMINE_OAUTH_CLIENT_SECRET: optionalText,
    REDMINE_PUBLIC_URL: z.preprocess(
      blankToUndefined,
      z
        .url({
          protocol: /^https?$/,
          error: "must be an http or https URL, such as https://tracker.example.com/redmine",
        })
        .optional(),
    ),
    "--port": z
      .string()
      .regex(/^\d{1,5}$/, { error: PORT })
      .transform(Number)
      .refine((port) => port <= 65535, { error: PORT })
      .default(DEFAULT_PORT),
    "--host": z.string().trim().min(1, { error: "is empty" }).default("127.0.0.1"),
    "--allow-origin": z
      .array(z.string())
      .refine((entries) => entries.every((entry) => isHostname(entry) || isOrigin(entry)), {
        error:
          "takes a hostname such as app.example.com or an origin such as https://app.example.com, in lowercase and without a path",
      })
      .default([]),
    "--api-key-login": z.boolean().optional(),
    "--allow-client": z
      .array(z.string())
      .refine((entries) => entries.every(isHostname), {
        error: "takes a hostname such as claude.ai, in lowercase",
      })
      .optional(),
  })
  .superRefine((settings, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const oauth = settings.REDMINE_MCP_AUTH_SECRET !== undefined;
    if (settings.REDMINE_MCP_PUBLIC_URL !== undefined) {
      const problem = publicUrlProblem(settings.REDMINE_MCP_PUBLIC_URL, oauth);
      if (problem !== undefined) issue("REDMINE_MCP_PUBLIC_URL", problem);
    }
    if (!oauth) {
      for (const name of OAUTH_ONLY) {
        if (settings[name] !== undefined) issue(name, "needs REDMINE_MCP_AUTH_SECRET");
      }
      return;
    }
    if (settings.REDMINE_MCP_PUBLIC_URL === undefined) {
      issue(
        "REDMINE_MCP_AUTH_SECRET",
        "needs REDMINE_MCP_PUBLIC_URL, the URL clients reach /mcp at",
      );
    }
    const app = settings.REDMINE_OAUTH_CLIENT_ID ?? settings.REDMINE_OAUTH_CLIENT_SECRET;
    if (settings["--api-key-login"]) {
      if (app !== undefined) {
        issue(
          "--api-key-login",
          "replaces the Redmine application: unset REDMINE_OAUTH_CLIENT_ID and REDMINE_OAUTH_CLIENT_SECRET",
        );
      }
      return;
    }
    for (const name of ["REDMINE_OAUTH_CLIENT_ID", "REDMINE_OAUTH_CLIENT_SECRET"] as const) {
      if (settings[name] === undefined) {
        issue(name, "is required with REDMINE_MCP_AUTH_SECRET, unless --api-key-login is given");
      }
    }
  });

const HTTP_FLAGS = ["port", "host", "allow-origin", "api-key-login", "allow-client"] as const;

interface Flags {
  "read-only"?: boolean;
  "no-delete"?: boolean;
  http?: boolean;
  port?: string;
  host?: string;
  "allow-origin"?: string[];
  "api-key-login"?: boolean;
  "allow-client"?: string[];
  help?: boolean;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
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
        "api-key-login": { type: "boolean" },
        "allow-client": { type: "string", multiple: true },
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
  const {
    REDMINE_URL,
    REDMINE_API_KEY,
    REDMINE_VERSION,
    REDMINE_MCP_ACCESS,
    REDMINE_MCP_FILES_DIR,
  } = parsed.data;
  return {
    kind: "serve",
    config: {
      baseUrl: REDMINE_URL,
      auth: { apiKey: REDMINE_API_KEY },
      ...(REDMINE_VERSION === undefined ? {} : { version: REDMINE_VERSION }),
      access: requestedAccess(REDMINE_MCP_ACCESS, flags),
    },
    ...(REDMINE_MCP_FILES_DIR === undefined ? {} : { filesDir: REDMINE_MCP_FILES_DIR }),
  };
}

function httpCommand(flags: Flags, env: Readonly<Record<string, string | undefined>>): CliCommand {
  const parsed = HttpSettings.safeParse({
    ...env,
    "--port": flags.port,
    "--host": flags.host,
    "--allow-origin": flags["allow-origin"],
    "--api-key-login": flags["api-key-login"],
    "--allow-client": flags["allow-client"],
  });
  if (!parsed.success) return invalid(parsed.error);
  const settings = parsed.data;
  const { REDMINE_URL, REDMINE_VERSION, REDMINE_MCP_ACCESS, REDMINE_MCP_PUBLIC_URL } = settings;
  const { "--port": port, "--host": host, "--allow-origin": allowedOrigins } = settings;
  const loopback =
    host === "localhost" || host === "::1" || (isIPv4(host) && host.startsWith("127."));
  const hostnames = [...localhostAllowedHostnames(), isIPv6(host) ? `[${host}]` : host];
  // A proxy that keeps the client's Host sends the public one, which no rebinding page can name.
  const publicHost = REDMINE_MCP_PUBLIC_URL && new URL(REDMINE_MCP_PUBLIC_URL).hostname;
  if (publicHost && !hostnames.includes(publicHost)) hostnames.push(publicHost);
  const oauth = oauthOptions(settings);
  return {
    kind: "http",
    host,
    port,
    options: {
      baseUrl: REDMINE_URL,
      ...(REDMINE_VERSION === undefined ? {} : { version: REDMINE_VERSION }),
      access: requestedAccess(REDMINE_MCP_ACCESS, flags),
      allowedOrigins,
      // A browser page on another site may reach a loopback port, but its Host still names that site.
      ...(loopback ? { allowedHosts: hostnames } : {}),
      ...(REDMINE_MCP_PUBLIC_URL === undefined ? {} : { publicUrl: REDMINE_MCP_PUBLIC_URL }),
      ...(oauth === undefined ? {} : { oauth }),
    },
    warnings: Object.entries(NOT_READ_OVER_HTTP)
      .filter(([name]) => blankToUndefined(env[name]) !== undefined)
      .map(([name, why]) => `${name} is ignored over HTTP; ${why}`),
  };
}

/** The authorization server's settings, once superRefine has checked they fit together. */
function oauthOptions(settings: z.infer<typeof HttpSettings>): RedmineOAuthOptions | undefined {
  const secret = settings.REDMINE_MCP_AUTH_SECRET;
  if (secret === undefined) return undefined;
  const shared = {
    secret,
    ...(settings.REDMINE_MCP_AUTH_PREVIOUS_SECRET === undefined
      ? {}
      : { previousSecret: settings.REDMINE_MCP_AUTH_PREVIOUS_SECRET }),
    ...(settings.REDMINE_PUBLIC_URL === undefined
      ? {}
      : { redminePublicUrl: settings.REDMINE_PUBLIC_URL }),
    ...(settings["--allow-client"] === undefined
      ? {}
      : { allowedClientHosts: settings["--allow-client"] }),
    fetchClientMetadata: publicFetch,
    // One process: its memory makes codes, states and refresh tokens single-use for real.
    store: memoryGrantStore(),
  };
  return settings["--api-key-login"]
    ? { ...shared, apiKeyLogin: true }
    : {
        ...shared,
        redmineApp: {
          clientId: settings.REDMINE_OAUTH_CLIENT_ID!,
          clientSecret: settings.REDMINE_OAUTH_CLIENT_SECRET!,
        },
      };
}

function requestedAccess(fromEnv: Access | undefined, flags: Flags): Access {
  return strictest(
    fromEnv ?? "full",
    ...(flags["no-delete"] ? (["no-delete"] as const) : []),
    ...(flags["read-only"] ? (["read-only"] as const) : []),
  );
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
