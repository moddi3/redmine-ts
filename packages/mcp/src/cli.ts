#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { parseCli, USAGE } from "./config.ts";
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
  case "serve": {
    const { config } = command;
    serveStdio(() => createRedmineMcpServer(config), {
      onerror: (error) => console.error(`redmine-mcp: ${error.message}`),
    });
  }
}
