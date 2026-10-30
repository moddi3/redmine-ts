import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { RedmineConfig } from "@redmine-ts/sdk";
import { createRedmineMcpServer } from "../src/index.ts";
import { localFiles } from "../src/node.ts";

/** Server settings beyond the client config: `filesDir` becomes the server's files directory. */
export interface ServerSettings {
  filesDir?: string;
  dangerouslyRevealApiKeys?: boolean;
  maxResultBytes?: number;
  admin?: boolean;
}

/** A real MCP client talking to the server over the SDK's in-memory transport pair. */
export async function connect(
  config: RedmineConfig,
  { filesDir, dangerouslyRevealApiKeys, maxResultBytes, admin }: ServerSettings = {},
): Promise<Client> {
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const files = filesDir === undefined ? undefined : localFiles(filesDir);
  const server = createRedmineMcpServer(config, {
    files,
    dangerouslyRevealApiKeys,
    maxResultBytes,
    admin,
  });
  await server.connect(serverEnd);
  const client = new Client({ name: "redmine-mcp-tests", version: "0.0.0" });
  await client.connect(clientEnd);
  return client;
}

/** The text of the last content block, which carries the result or the error as JSON. */
export function lastJson(result: { content?: unknown }): unknown {
  const blocks = (result.content ?? []) as { type: string; text?: string }[];
  const last = blocks.at(-1);
  if (last?.type !== "text" || last.text === undefined) throw new Error("no text block");
  return JSON.parse(last.text);
}

export function texts(result: { content?: unknown }): string[] {
  return ((result.content ?? []) as { type: string; text?: string }[]).map((b) => b.text ?? "");
}
