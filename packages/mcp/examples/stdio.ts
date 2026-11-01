import { createRedmineMcpServer } from "@redmine-ts/mcp";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

serveStdio(() =>
  createRedmineMcpServer({
    baseUrl: "https://tracker.example.com",
    auth: { apiKey: process.env.REDMINE_API_KEY! },
    version: "7.0",
    access: "no-delete",
  }),
);
