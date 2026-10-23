#!/usr/bin/env node
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { parseCli, USAGE } from "./config.ts";
import { createRedmineMcpHandler } from "./http.ts";
import { toNodeListener } from "./node-http.ts";
import { createRedmineMcpServer } from "./server.ts";

const command = parseCli(process.argv.slice(2), process.env);
switch (command.kind) {
  case "help":
    console.log(USAGE);
    break;
  case "error":
    console.error(`redmine-mcp: ${command.message}\n\nRun redmine-mcp --help for the settings.`);
    process.exitCode = 2;
    break;
  case "http": {
    const report = (error: Error) => console.error(`redmine-mcp: ${error.message}`);
    for (const warning of command.warnings) console.error(`redmine-mcp: ${warning}`);
    const mcp = createRedmineMcpHandler({ ...command.options, onError: report });
    const server = createServer(
      toNodeListener(
        async (request) =>
          new URL(request.url).pathname === "/mcp"
            ? mcp(request)
            : new Response("Not Found: the MCP endpoint is /mcp", { status: 404 }),
        report,
      ),
    );
    server.on("error", (error) => {
      report(error);
      process.exitCode = 1;
    });
    server.listen(command.port, command.host, () => {
      const { address, family, port } = server.address() as AddressInfo;
      const host = family === "IPv6" ? `[${address}]` : address;
      console.error(`redmine-mcp: serving MCP at http://${host}:${port}/mcp`);
    });
    // close() lets in-flight requests finish and drops idle connections. A second signal stops at once.
    const signals = ["SIGINT", "SIGTERM"] as const;
    const stop = () => {
      for (const signal of signals) process.off(signal, stop);
      server.close();
    };
    for (const signal of signals) process.on(signal, stop);
    break;
  }
  case "serve": {
    const { config, filesDir } = command;
    serveStdio(() => createRedmineMcpServer(config, { filesDir }), {
      onerror: (error) => console.error(`redmine-mcp: ${error.message}`),
    });
  }
}
