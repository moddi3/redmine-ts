import { createRedmineMcpHandler } from "@redmine-ts/mcp";
import { grantStore } from "./grant-store.ts";
import type { GrantKey } from "./grant-store.ts";

export { GrantKey } from "./grant-store.ts";

interface Env {
  AUTH_SECRET: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  GRANTS: DurableObjectNamespace<GrantKey>;
}

let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: Env) {
    handler ??= createRedmineMcpHandler({
      baseUrl: "https://tracker.example.com",
      publicUrl: "https://mcp.example.com/mcp",
      access: "no-delete",
      oauth: {
        secret: env.AUTH_SECRET,
        redmineApp: { clientId: env.CLIENT_ID, clientSecret: env.CLIENT_SECRET },
        fetchClientMetadata: (input, init) => fetch(input, init),
        store: grantStore(env.GRANTS),
      },
    });
    return handler(request);
  },
};
