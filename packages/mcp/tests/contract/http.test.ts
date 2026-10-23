import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { lastJson, texts } from "../connect.ts";
import { describeServers } from "./servers.ts";
import type { ContractServer } from "./servers.ts";

const cli = fileURLToPath(new URL("../../dist/cli.mjs", import.meta.url));

interface Running {
  child: ChildProcess;
  url: URL;
  stderr: () => string;
}

/** The built CLI with --http on a free port, and the URL it prints once it listens. */
async function start(server: ContractServer, ...flags: string[]): Promise<Running> {
  if (!existsSync(cli)) throw new Error(`${cli} is missing: run \`vp run build\` first`);
  const child = spawn(process.execPath, [cli, "--http", "--port", "0", ...flags], {
    env: { PATH: process.env.PATH, REDMINE_URL: server.baseUrl, REDMINE_VERSION: server.version },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  const url = await new Promise<URL>((resolve, reject) => {
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk;
      const printed = /serving MCP at (\S+)/.exec(stderr)?.[1];
      if (printed) resolve(new URL(printed));
    });
    child.once("exit", (code) => reject(new Error(`exited with ${code}: ${stderr}`)));
  });
  return { child, url, stderr: () => stderr };
}

async function connect(url: URL, key: string, era: "legacy" | "modern"): Promise<Client> {
  const client = new Client(
    { name: "redmine-mcp-contract", version: "0.0.0" },
    era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {},
  );
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { "X-Redmine-API-Key": key } },
    }),
  );
  return client;
}

describeServers("Streamable HTTP", (server) => {
  let full: Running;
  let readOnly: Running;
  const created: number[] = [];

  beforeAll(async () => {
    [full, readOnly] = await Promise.all([start(server), start(server, "--read-only")]);
  });

  afterAll(async () => {
    const client = await connect(full.url, server.adminKey, "modern");
    for (const issue_id of created) {
      await client.callTool({ name: "issues_delete", arguments: { issue_id } });
    }
    await Promise.all(
      [full, readOnly].map(({ child }) => {
        child.kill();
        return once(child, "exit");
      }),
    );
  });

  it.each(["legacy", "modern"] as const)(
    "lists the declared version's tools to a %s-era client",
    async (era) => {
      const client = await connect(full.url, server.adminKey, era);
      expect(client.getNegotiatedProtocolVersion()).toBe(
        era === "modern" ? "2026-07-28" : "2025-11-25",
      );
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(server.version === "6.1" ? 91 : 92);
      const upload = tools.find((tool) => tool.name === "attachments_upload");
      expect(upload?.inputSchema.properties).not.toHaveProperty("path");
    },
  );

  it("creates, reads and deletes an issue as the user whose key the request carries", async () => {
    const client = await connect(full.url, server.adminKey, "modern");
    const me = await client.callTool({ name: "users_current", arguments: {} });
    expect(me.structuredContent).toMatchObject({ login: "admin" });

    const subject = `MCP over HTTP ${Date.now().toString(36)}`;
    const issue = await client.callTool({
      name: "issues_create",
      arguments: { project_id: server.projectIdentifier, subject },
    });
    expect(issue.isError, texts(issue).join("\n")).toBeFalsy();
    const issue_id = (issue.structuredContent as { id: number }).id;
    created.push(issue_id);
    const read = await client.callTool({ name: "issues_get", arguments: { issue_id } });
    expect(read.structuredContent).toMatchObject({ id: issue_id, subject });

    const deleted = await client.callTool({ name: "issues_delete", arguments: { issue_id } });
    expect(deleted.structuredContent).toEqual({ ok: true });
    created.pop();
  });

  it("passes Redmine's 401 for a wrong key on as a tool error", async () => {
    const client = await connect(full.url, "0000000000000000000000000000000000000000", "modern");
    const result = await client.callTool({ name: "users_current", arguments: {} });
    expect(result.isError).toBe(true);
    expect(lastJson(result)).toMatchObject({ kind: "unauthorized", status: 401 });
  });

  it("lists only reads with --read-only and refuses a forced write before sending", async () => {
    const client = await connect(readOnly.url, server.adminKey, "legacy");
    const { tools } = await client.listTools();
    expect(tools.filter((tool) => tool.annotations?.readOnlyHint !== true)).toEqual([]);
    const forced = await client.callTool({
      name: "issues_create",
      arguments: { project_id: server.projectIdentifier, subject: "forced over HTTP" },
    });
    expect(lastJson(forced)).toMatchObject({ kind: "access_denied", access: "read-only" });
  });

  it("answers 401 without the key header, 403 for a foreign Origin and 404 off /mcp", async () => {
    const post = (url: URL, headers: Record<string, string>) =>
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
    expect((await post(full.url, {})).status).toBe(401);
    const key = { "X-Redmine-API-Key": server.adminKey };
    expect((await post(full.url, { ...key, Origin: "https://evil.example" })).status).toBe(403);
    expect((await post(new URL("/other", full.url), key)).status).toBe(404);
    expect(full.stderr()).not.toContain(server.adminKey);
  });

  it("exits with 0 on SIGTERM", async () => {
    const running = await start(server);
    running.child.kill("SIGTERM");
    const [code] = await once(running.child, "exit");
    expect(code).toBe(0);
  });
});
