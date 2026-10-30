import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { parseCli } from "../../src/config.ts";
import { stdioServer } from "../../src/stdio.ts";

const KEY = "0d1e2a3d4b5e6e7f8a9b0c1d2e3f4a5b6c7d8e9f";
const USER_KEY = "1d1e2a3d4b5e6e7f8a9b0c1d2e3f4a5b6c7d8e9f";

/** A Redmine that answers users/current.json with the key's own api_key, as Redmine does. */
const redmine = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  const key = request.headers["x-redmine-api-key"];
  if (request.url?.startsWith("/users/current.json")) {
    response.end(
      JSON.stringify({ user: { id: 1, login: "admin", api_key: key, admin: key === KEY } }),
    );
  } else {
    response.statusCode = 404;
    response.end("{}");
  }
});
let env: Record<string, string>;

beforeAll(async () => {
  await new Promise<void>((done) => redmine.listen(0, "127.0.0.1", done));
  const { port } = redmine.address() as AddressInfo;
  env = { REDMINE_URL: `http://127.0.0.1:${port}`, REDMINE_API_KEY: KEY };
});
afterAll(() => redmine.close());

async function connect(argv: string[], settings: Record<string, string>) {
  const command = parseCli(argv, { ...env, ...settings });
  if (command.kind !== "serve") throw new Error(`expected serve, got ${command.kind}`);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await (
    await stdioServer(command, (error) => {
      throw error;
    })()
  ).connect(serverEnd);
  const client = new Client({ name: "stdio-test", version: "0.0.0" });
  await client.connect(clientEnd);
  return client;
}

describe("the stdio server", () => {
  it("takes the result budget, the files directory and --dangerously-reveal-api-keys from the settings", async () => {
    const client = await connect(["--dangerously-reveal-api-keys"], {
      REDMINE_MCP_MAX_RESULT_BYTES: "60000",
      REDMINE_MCP_FILES_DIR: mkdtempSync(join(tmpdir(), "redmine-mcp-stdio-")),
    });
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === "issue_context")?._meta).toEqual({
      "anthropic/maxResultSizeChars": 61_000,
    });
    expect(tools.map((tool) => tool.name)).toContain("attachments_save");
    const me = await client.callTool({
      name: "raw_request",
      arguments: { method: "GET", path: "users/current.json" },
    });
    expect(me.structuredContent).toEqual({
      response: { user: expect.objectContaining({ api_key: KEY }) },
    });
  });

  it("leaves the tools that need an admin key out for a key that is not an admin's", async () => {
    const client = await connect([], { REDMINE_API_KEY: USER_KEY });
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain("issues_list");
    expect(names).not.toContain("users_list");
  });

  it("keeps the defaults without them", async () => {
    const client = await connect([], {});
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === "issue_context")?._meta).toBeUndefined();
    expect(tools.map((tool) => tool.name)).not.toContain("attachments_save");
    const me = await client.callTool({
      name: "raw_request",
      arguments: { method: "GET", path: "users/current.json" },
    });
    expect(me.structuredContent).toEqual({
      response: { user: expect.objectContaining({ api_key: "[hidden by @redmine-ts/mcp]" }) },
    });
  });
});
