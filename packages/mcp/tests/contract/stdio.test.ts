import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect, it, onTestFinished } from "vite-plus/test";
import { describeServers, expectAdminToolsHidden } from "./servers.ts";
import type { ContractServer } from "./servers.ts";

const cli = fileURLToPath(new URL("../../dist/cli.mjs", import.meta.url));

async function launch(server: ContractServer, env: Record<string, string>): Promise<Client> {
  if (!existsSync(cli)) throw new Error(`${cli} is missing: run \`vp run build\` first`);
  const client = new Client({ name: "redmine-mcp-contract", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [cli],
      env: {
        PATH: process.env.PATH!,
        REDMINE_URL: server.baseUrl,
        REDMINE_VERSION: server.version,
        ...env,
      },
      stderr: "pipe",
    }),
  );
  onTestFinished(() => client.close());
  return client;
}

describeServers("stdio", (server) => {
  it("lists a key that is not an admin's no tool that needs an admin key", async () => {
    const [asAdmin, asUser] = await Promise.all([
      launch(server, { REDMINE_API_KEY: server.adminKey }),
      launch(server, { REDMINE_API_KEY: server.userKey }),
    ]);
    await expectAdminToolsHidden(server, asAdmin, asUser);
  });

  it("lists every tool when Redmine does not answer", async () => {
    const asAdmin = await launch(server, { REDMINE_API_KEY: server.adminKey });
    const down = await launch(server, {
      REDMINE_API_KEY: server.userKey,
      REDMINE_URL: "http://127.0.0.1:9/",
    });
    expect((await down.listTools()).tools.map((tool) => tool.name)).toEqual(
      (await asAdmin.listTools()).tools.map((tool) => tool.name),
    );
    expect(down.getInstructions()).toContain('"Needs an admin key"');
  });
});
