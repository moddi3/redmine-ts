import { describe, expect, it } from "vite-plus/test";
import { lastJson } from "../connect.ts";
import { callError, callOk, json, serve } from "./harness.ts";

const user = {
  id: 1,
  login: "admin",
  admin: true,
  firstname: "Redmine",
  lastname: "Admin",
  created_on: "2026-01-01T00:00:00Z",
  updated_on: "2026-01-01T00:00:00Z",
  last_login_on: null,
  passwd_changed_on: null,
};

describe("API keys", () => {
  it("leaves api_key out of a typed tool's structuredContent and text block, and keeps the rest", async () => {
    const { client } = await serve({
      "GET /users/current.json": () => json({ user: { ...user, api_key: "secret-1" } }),
    });
    const result = await callOk(client, "users_current", {});
    expect(result.structuredContent).toEqual(user);
    expect(lastJson(result)).toEqual(user);
    expect(JSON.stringify(result)).not.toContain("secret-1");
  });

  it("leaves api_key out at any depth of a raw_request response", async () => {
    const { client } = await serve({
      "GET /custom.json": () =>
        json({
          api_key: "secret-1",
          users: [{ id: 1, api_key: "secret-2", groups: [{ id: 2, api_key: "secret-3" }] }],
          api_key_hint: "kept",
        }),
    });
    const result = await callOk(client, "raw_request", { method: "GET", path: "custom.json" });
    const response = { users: [{ id: 1, groups: [{ id: 2 }] }], api_key_hint: "kept" };
    expect(result.structuredContent).toEqual({ response });
    expect(lastJson(result)).toEqual({ response });
    expect(JSON.stringify(result)).not.toMatch(/secret-/);
  });

  it("blanks api_key values in the body of an error result", async () => {
    const { client } = await serve({
      "GET /custom.json": () =>
        json({ user: { id: 1, api_key: "secret-1" }, users: [{ api_key: "secret-2" }] }, 400),
    });
    const result = await callError(client, "raw_request", { method: "GET", path: "custom.json" });
    expect(JSON.stringify(result)).not.toMatch(/secret-/);
    expect(lastJson(result)).toMatchObject({
      kind: "http",
      body: '{"user":{"id":1,"api_key":""},"users":[{"api_key":""}]}',
    });
  });

  it("names api_key in no tool's schema or description", async () => {
    const { client } = await serve({});
    const { tools } = await client.listTools();
    const naming = tools.filter((tool) => JSON.stringify(tool).includes("api_key"));
    expect(naming.map((tool) => tool.name)).toEqual([]);
  });
});
