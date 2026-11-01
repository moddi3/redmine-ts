import { createRedmineMcpHandler } from "@redmine-ts/mcp";

const handler = createRedmineMcpHandler({
  baseUrl: "https://tracker.example.com",
  access: "read-only",
});

export default {
  fetch: (request: Request) =>
    new URL(request.url).pathname === "/mcp"
      ? handler(request)
      : new Response("Not Found", { status: 404 }),
};
