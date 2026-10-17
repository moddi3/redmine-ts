import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface ServerEnv {
  baseUrl: string;
  adminKey: string;
  userKey: string;
  projectIdentifier: string;
  customFields: { Severity: number; Tags: number };
}

export interface ContractServer extends ServerEnv {
  /** Key in .redmine/env.json: "7.0", "6.1", "7.0-subpath". */
  name: string;
  version: "6.1" | "7.0";
}

const envFile = fileURLToPath(new URL("../../../../.redmine/env.json", import.meta.url));

/**
 * Servers written by `node scripts/redmine-env.ts up`. Empty when the harness is not running, so plain
 * `vp test` passes without Docker; `test:contract` sets REDMINE_CONTRACT=1 to make that a failure.
 */
export function contractServers(): ContractServer[] {
  if (!existsSync(envFile)) {
    if (process.env.REDMINE_CONTRACT === "1") {
      throw new Error(`${envFile} is missing: run \`node scripts/redmine-env.ts up\` first`);
    }
    return [];
  }
  const env: Record<string, ServerEnv> = JSON.parse(readFileSync(envFile, "utf8"));
  return Object.entries(env).map(([name, server]) => ({
    ...server,
    name,
    version: name.startsWith("6.1") ? "6.1" : "7.0",
  }));
}
