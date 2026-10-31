import { createRedmineMcpHandler } from "@redmine-ts/mcp";

const handler = createRedmineMcpHandler({
  baseUrl: "https://tracker.example.com",
  version: "7.0",
  access: "no-delete",
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
});

Bun.serve({ hostname: "127.0.0.1", port: 3737, routes: { "/mcp": handler } });
