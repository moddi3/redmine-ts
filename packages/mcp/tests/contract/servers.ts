import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Access } from "@redmine-ts/sdk";
import { describe, it } from "vite-plus/test";
import { connect } from "../connect.ts";

export interface ContractServer {
  /** Key in .redmine/env.json: "7.0", "6.1", "7.0-subpath". */
  name: string;
  version: "6.1" | "7.0";
  baseUrl: string;
  adminKey: string;
  /** jsmith, a Developer in the project and not an admin. */
  userKey: string;
  projectIdentifier: string;
  customFields: Record<string, number>;
}

const envFile = fileURLToPath(new URL("../../../../.redmine/env.json", import.meta.url));

/** Servers written by `node scripts/redmine-env.ts up`. Plain `vp test` skips without them. */
function contractServers(): ContractServer[] {
  if (!existsSync(envFile)) {
    if (process.env.REDMINE_CONTRACT === "1") {
      throw new Error(`${envFile} is missing: run \`node scripts/redmine-env.ts up\` first`);
    }
    return [];
  }
  const env: Record<string, Omit<ContractServer, "name" | "version">> = JSON.parse(
    readFileSync(envFile, "utf8"),
  );
  return Object.entries(env).map(([name, server]) => ({
    ...server,
    name,
    version: name.startsWith("6.1") ? "6.1" : "7.0",
  }));
}

export function describeServers(title: string, body: (server: ContractServer) => void): void {
  const servers = contractServers();
  if (servers.length === 0) {
    describe.skip(title, () =>
      it("needs .redmine/env.json: run `node scripts/redmine-env.ts up`", () => {}),
    );
    return;
  }
  describe.each(servers)(`[$name] ${title}`, body);
}

/** An MCP client on a server, for the admin key unless another is given, declared with the server's real version. */
export function connectTo(
  server: ContractServer,
  access: Access = "full",
  { apiKey = server.adminKey, filesDir }: { apiKey?: string; filesDir?: string } = {},
) {
  return connect(
    { baseUrl: server.baseUrl, auth: { apiKey }, version: server.version, access },
    filesDir === undefined ? {} : { filesDir },
  );
}
