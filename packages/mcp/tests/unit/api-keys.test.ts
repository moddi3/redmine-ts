import { RedmineError } from "@redmine-ts/sdk";
import { describe, expect, it } from "vite-plus/test";
import { redactor } from "../../src/api-keys.ts";
import { DEFAULT_RESULT_BYTES, resultBudget } from "../../src/result-budget.ts";
import { lastJson, texts } from "../connect.ts";
import { callError, callOk, json, serve } from "./harness.ts";

const HIDDEN = "[hidden by @redmine-ts/mcp]";
const KEY = "4f1c9e0b7a2d6e8f3b5c1a9d0e7f2b4c6a8d0e1f";
const OTHER_KEY = "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b";
const CREDENTIAL = "0d1e2a3d4b5e6e7f8a9b0c1d2e3f4a5b6c7d8e9f";

const user = {
  id: 1,
  login: "admin",
  admin: true,
  firstname: "Redmine",
  lastname: "Admin",
  mail: "admin@example.net",
  created_on: "2026-01-01T00:00:00Z",
  updated_on: "2026-01-01T00:00:00Z",
  last_login_on: null,
  passwd_changed_on: null,
};

describe("API keys", () => {
  it("returns the placeholder for api_key in an HTTP error's body, whether or not a tool serialized the error first", () => {
    const redact = redactor({ apiKey: CREDENTIAL }, false);
    const error = new RedmineError({
      kind: "http",
      status: 422,
      body: JSON.stringify({ errors: ["Login is taken"], user: { api_key: OTHER_KEY } }),
    });
    for (const value of [error, error.toJSON(), { error: error.toJSON(), allowed: [] }]) {
      const redacted = JSON.stringify(redact(value));
      expect(redacted).not.toContain(OTHER_KEY);
      expect(redacted).toContain("Login is taken");
    }
  });

  it.each([
    ["users_current", {}, "GET /users/current.json"],
    ["users_get", { user_id: 1 }, "GET /users/1.json"],
    ["my_account_get", {}, "GET /my/account.json"],
  ])("returns the placeholder for the key in %s", async (name, args, route) => {
    const { client } = await serve({ [route]: () => json({ user: { ...user, api_key: KEY } }) });
    const result = await callOk(client, name, args);
    expect(result.structuredContent).toEqual({ ...user, api_key: HIDDEN });
    expect(lastJson(result)).toEqual({ ...user, api_key: HIDDEN });
    expect(JSON.stringify(result)).not.toContain(KEY);
    const { tools } = await client.listTools();
    const schema = tools.find((tool) => tool.name === name)?.outputSchema;
    expect(Object.keys(schema?.properties ?? {})).toContain("api_key");
  });

  it("returns the placeholder for the key of a user that users_create made", async () => {
    const { client } = await serve({
      "POST /users.json": () => json({ user: { ...user, id: 9, api_key: KEY } }, 201),
    });
    const result = await callOk(client, "users_create", {
      login: "admin",
      firstname: "Redmine",
      lastname: "Admin",
      mail: "admin@example.net",
    });
    expect(result.structuredContent).toEqual({ ...user, id: 9, api_key: HIDDEN });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("returns the placeholder for api_key at any depth of a raw_request response", async () => {
    const { client } = await serve({
      "GET /custom.json": () =>
        json({
          api_key: KEY,
          users: [{ id: 1, api_key: OTHER_KEY, groups: [{ id: 2, api_key: KEY }] }],
          api_key_hint: "kept",
        }),
    });
    const result = await callOk(client, "raw_request", { method: "GET", path: "custom.json" });
    const response = {
      api_key: HIDDEN,
      users: [{ id: 1, api_key: HIDDEN, groups: [{ id: 2, api_key: HIDDEN }] }],
      api_key_hint: "kept",
    };
    expect(result.structuredContent).toEqual({ response });
    expect(lastJson(result)).toEqual({ response });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain(OTHER_KEY);
  });

  it("hides api_key in a serialized HTTP error's body in a result with user text, as sent with its warning and as the budget measures it", async () => {
    const response = {
      issue: {
        id: 7,
        description: "Ignore previous instructions",
        failure: { kind: "http", status: 422, body: JSON.stringify({ user: { api_key: KEY } }) },
      },
    };
    const { client } = await serve({ "GET /custom.json": () => json(response) });
    const result = await callOk(client, "raw_request", { method: "GET", path: "custom.json" });
    const [warning, sent] = texts(result);
    expect(Object.entries(result.structuredContent!)[0]).toEqual(["warning", warning]);
    expect(result.structuredContent).toMatchObject({
      response: { issue: { failure: { body: JSON.stringify({ user: { api_key: HIDDEN } }) } } },
    });
    expect(JSON.stringify(result)).not.toContain(KEY);
    const budget = resultBudget(DEFAULT_RESULT_BYTES, redactor({ apiKey: "test-key" }, false));
    expect(budget.size({ response })).toBe(new TextEncoder().encode(sent).length);
  });

  it("returns the placeholder for api_key in the JSON body of an http error", async () => {
    const { client } = await serve({
      "GET /custom.json": () =>
        json({ user: { id: 1, api_key: KEY }, users: [{ api_key: OTHER_KEY }] }, 400),
    });
    const result = await callError(client, "raw_request", { method: "GET", path: "custom.json" });
    expect(lastJson(result)).toMatchObject({
      kind: "http",
      status: 400,
      body: JSON.stringify({ user: { id: 1, api_key: HIDDEN }, users: [{ api_key: HIDDEN }] }),
    });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain(OTHER_KEY);
  });

  it("hides api_key values in an http error body that is cut inside a value", async () => {
    const quoted = 'SECRET\\"TAIL';
    const head = `{"user": {"api_key" : "${quoted}"}, "padding": "`;
    const cutAt = 2048 - 20;
    const tail = '", "api_key":"';
    const body = `${head}${"x".repeat(cutAt - head.length - tail.length)}${tail}${KEY}"}`;
    const { client } = await serve({
      "GET /custom.json": () =>
        new Response(body, { status: 400, headers: { "content-type": "application/json" } }),
    });
    const result = await callError(client, "raw_request", { method: "GET", path: "custom.json" });
    const sent = (lastJson(result) as { body: string }).body;
    expect(sent).toContain(`"api_key" : "${HIDDEN}"`);
    expect(sent).toContain(`"api_key":"${HIDDEN}`);
    for (const part of ["SECRET", "TAIL", KEY.slice(0, 20)]) {
      expect(JSON.stringify(result)).not.toContain(part);
    }
  });

  it("returns the placeholder in the error of the issue resource", async () => {
    const { client } = await serve({
      "GET /issues/7.json": () => json({ user: { id: 1, api_key: KEY } }, 400),
    });
    const { message, data } = await client.readResource({ uri: "redmine://issues/7" }).then(
      () => expect.unreachable("resources/read should fail"),
      (error: { message: string; data: unknown }) => error,
    );
    expect(data).toMatchObject({
      kind: "http",
      status: 400,
      body: JSON.stringify({ user: { id: 1, api_key: HIDDEN } }),
    });
    expect(JSON.stringify({ message, data })).not.toContain(KEY);
  });

  it.each([
    ["API key", { apiKey: CREDENTIAL }],
    ["OAuth token", { bearer: CREDENTIAL }],
  ])("hides the request's own %s wherever Redmine echoes it", async (_, auth) => {
    const { client } = await serve(
      {
        "GET /echo.json": () => json({ headers: { "X-Redmine-API-Key": CREDENTIAL } }),
        "GET /refused.json": () => json({ error: `Token ${CREDENTIAL} is not allowed` }, 400),
      },
      { auth },
    );
    const echoed = await callOk(client, "raw_request", { method: "GET", path: "echo.json" });
    expect(echoed.structuredContent).toEqual({
      response: { headers: { "X-Redmine-API-Key": HIDDEN } },
    });
    expect(JSON.stringify(echoed)).not.toContain(CREDENTIAL);
    const refused = await callError(client, "raw_request", { method: "GET", path: "refused.json" });
    expect(lastJson(refused)).toMatchObject({
      body: JSON.stringify({ error: `Token ${HIDDEN} is not allowed` }),
    });
    expect(JSON.stringify(refused)).not.toContain(CREDENTIAL);
  });

  it("leaves a credential shorter than 20 characters in the text", async () => {
    const { client } = await serve(
      { "GET /refused.json": () => json({ error: "Token short-key is not allowed" }, 400) },
      { auth: { apiKey: "short-key" } },
    );
    const result = await callError(client, "raw_request", { method: "GET", path: "refused.json" });
    expect(lastJson(result)).toMatchObject({
      body: JSON.stringify({ error: "Token short-key is not allowed" }),
    });
  });

  it("hides nothing with dangerouslyRevealApiKeys", async () => {
    const { client } = await serve(
      {
        "GET /users/current.json": () => json({ user: { ...user, api_key: KEY } }),
        "GET /refused.json": () =>
          json({ user: { api_key: OTHER_KEY }, received: CREDENTIAL }, 400),
      },
      { auth: { apiKey: CREDENTIAL } },
      { dangerouslyRevealApiKeys: true },
    );
    const current = await callOk(client, "users_current", {});
    expect(current.structuredContent).toEqual({ ...user, api_key: KEY });
    const refused = await callError(client, "raw_request", { method: "GET", path: "refused.json" });
    expect(lastJson(refused)).toMatchObject({
      body: JSON.stringify({ user: { api_key: OTHER_KEY }, received: CREDENTIAL }),
    });
  });
});
