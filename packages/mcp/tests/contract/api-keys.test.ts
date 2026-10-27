import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { Client, Tool } from "@modelcontextprotocol/client";
import { createRedmine } from "@redmine-ts/sdk";
import { beforeAll, expect, it } from "vite-plus/test";
import { lastJson, texts } from "../connect.ts";
import { connectTo, describeServers } from "./servers.ts";

// ajv-formats is CommonJS with its plugin on `default`.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

const HIDDEN = "[hidden by @redmine-ts/mcp]";

function apiKeyValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(apiKeyValues);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, field]) => [
    ...(key === "api_key" ? [field] : []),
    ...apiKeyValues(field),
  ]);
}

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

  function keysIn(result: Awaited<ReturnType<Client["callTool"]>>): string[] {
    const sent = JSON.stringify(result);
    return [server.adminKey, server.userKey].filter((key) => sent.includes(key)).map(() => "a key");
  }

  async function returned(on: Client, name: string, args: Record<string, unknown>) {
    const result = await on.callTool({ name, arguments: args });
    expect(result.isError, `${name}: ${texts(result).join("\n")}`).toBeFalsy();
    const validate = ajv.compile(tools.find((tool) => tool.name === name)!.outputSchema!);
    expect(validate(result.structuredContent) ? [] : validate.errors, name).toEqual([]);
    expect(keysIn(result), name).toEqual([]);
    return {
      structuredContent: apiKeyValues(result.structuredContent),
      text: apiKeyValues(lastJson(result)),
    };
  }

  const placeholder = { structuredContent: [HIDDEN], text: [HIDDEN] };

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

  it("returns the placeholder from users_current and my_account_get", async () => {
    for (const on of [asAdmin, asUser]) {
      expect(await returned(on, "users_current", {})).toEqual(placeholder);
      expect(await returned(on, "my_account_get", {})).toEqual(placeholder);
    }
  });

  it("returns the placeholder from users_get for the key's own user and, with an admin key, another user", async () => {
    expect(await returned(asUser, "users_get", { user_id: userId })).toEqual(placeholder);
    expect(await returned(asAdmin, "users_get", { user_id: adminId })).toEqual(placeholder);
    expect(await returned(asAdmin, "users_get", { user_id: userId })).toEqual(placeholder);
  });

  it("returns the placeholder from raw_request on the same paths", async () => {
    for (const path of ["users/current.json", "my/account.json", `users/${userId}.json`]) {
      expect(await returned(asAdmin, "raw_request", { method: "GET", path }), path).toEqual(
        placeholder,
      );
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
    expect(keysIn(result)).toEqual([]);
  });
});
