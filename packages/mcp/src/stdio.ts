import type { Server } from "@modelcontextprotocol/server";
import type { CliCommand } from "./config.ts";
import { checkCredential } from "./redmine-key.ts";
import { createRedmineMcpServer } from "./server.ts";
import { localFiles } from "./workflow/files-dir.ts";

export function stdioServer(
  command: Extract<CliCommand, { kind: "serve" }>,
  onError: (error: Error) => void,
): () => Promise<Server> {
  const { config, filesDir, dangerouslyRevealApiKeys, maxResultBytes } = command;
  const files = filesDir === undefined ? undefined : localFiles(filesDir);
  const admin = checkCredential(config, { onError }).then((verdict) =>
    verdict.kind === "ok" ? verdict.admin : undefined,
  );
  return async () =>
    createRedmineMcpServer(config, {
      files,
      dangerouslyRevealApiKeys,
      maxResultBytes,
      admin: await admin,
    });
}
