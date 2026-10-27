import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { Client, Tool } from "@modelcontextprotocol/client";
import { createRedmine } from "@redmine-ts/sdk";
import { beforeAll, expect, it } from "vite-plus/test";
import { lastJson, texts } from "../connect.ts";
import { connectTo, describeServers } from "./servers.ts";

// ajv-formats is CommonJS with its plugin on `default`.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

function apiKeyPaths(value: unknown, at = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => apiKeyPaths(item, `${at}[${i}]`));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, field]) => [
    ...(key === "api_key" ? [`${at}.${key}`] : []),
    ...apiKeyPaths(field, `${at}.${key}`),
  ]);
}

describeServers("API keys", (server) => {
  const asAdminSdk = createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: server.adminKey } });
  const asUserSdk = createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: server.userKey } });
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  let asAdmin: Client;
  let asUser: Client;
  let tools: Tool[];
  let adminId: number;
  let userId: number;

  function keyLocations(result: Awaited<ReturnType<Client["callTool"]>>): string[] {
    const sent = JSON.stringify(result);
    return [
      ...apiKeyPaths(result.structuredContent).map((path) => `structuredContent ${path}`),
      ...apiKeyPaths(lastJson(result)).map((path) => `text block ${path}`),
      ...[server.adminKey, server.userKey].filter((key) => sent.includes(key)).map(() => "a key"),
    ];
  }

  async function exposed(on: Client, name: string, args: Record<string, unknown>) {
    const result = await on.callTool({ name, arguments: args });
    expect(result.isError, `${name}: ${texts(result).join("\n")}`).toBeFalsy();
    const validate = ajv.compile(tools.find((tool) => tool.name === name)!.outputSchema!);
    expect(validate(result.structuredContent) ? [] : validate.errors, name).toEqual([]);
    return keyLocations(result);
  }

  beforeAll(async () => {
    asAdmin = await connectTo(server);
    asUser = await connectTo(server, "full", { apiKey: server.userKey });
    tools = (await asAdmin.listTools()).tools;
    adminId = (await asAdminSdk.users.current()).id;
    userId = (await asUserSdk.users.current()).id;
  });

  it("gets api_key from Redmine on these paths, so the cases below check a real exposure", async () => {
    const sent = [
      [asAdminSdk, "users/current.json"],
      [asUserSdk, "users/current.json"],
      [asUserSdk, "my/account.json"],
      [asUserSdk, `users/${userId}.json`],
      [asAdminSdk, `users/${userId}.json`],
    ] as const;
    for (const [rm, path] of sent) {
      expect(apiKeyPaths(await rm.request({ method: "GET", path })), path).toEqual([
        "$.user.api_key",
      ]);
    }
  });

  it("leaves the key out of users_current and my_account_get", async () => {
    for (const on of [asAdmin, asUser]) {
      expect(await exposed(on, "users_current", {})).toEqual([]);
      expect(await exposed(on, "my_account_get", {})).toEqual([]);
    }
  });

  it("leaves the key out of users_get for the key's own user and, with an admin key, another user", async () => {
    expect(await exposed(asUser, "users_get", { user_id: userId })).toEqual([]);
    expect(await exposed(asAdmin, "users_get", { user_id: adminId })).toEqual([]);
    expect(await exposed(asAdmin, "users_get", { user_id: userId })).toEqual([]);
  });

  it("leaves the key out of raw_request on the same paths", async () => {
    for (const path of ["users/current.json", "my/account.json", `users/${userId}.json`]) {
      expect(await exposed(asAdmin, "raw_request", { method: "GET", path }), path).toEqual([]);
    }
  });

  it("returns no key from raw_request on users/current.xml, which carries the key as XML", async () => {
    const xml = await fetch(`${server.baseUrl}/users/current.xml`, {
      headers: { "X-Redmine-API-Key": server.userKey },
    }).then((response) => response.text());
    expect(xml.includes(server.userKey), "Redmine sends the key in XML").toBe(true);
    const result = await asUser.callTool({
      name: "raw_request",
      arguments: { method: "GET", path: "users/current.xml" },
    });
    expect(keyLocations(result)).toEqual([]);
  });
});
