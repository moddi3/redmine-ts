import { describe, expect, test } from "vite-plus/test";
import type { SdkEvent } from "../../src/core/config.ts";
import { RedmineError } from "../../src/core/errors.ts";
import {
  empty,
  exceptGuard,
  failure,
  hang,
  html,
  isGuardCheck,
  json,
  keyOf,
  sequence,
  sleep,
  testEngine,
} from "./fixtures/fake-fetch.ts";
import type { Responder } from "./fixtures/fake-fetch.ts";
import * as ops from "./fixtures/registry.ts";
import { normalizeResponse } from "../../src/core/quirks.ts";

const issue = { id: 42, subject: "Printer on fire" };
const ok: Responder = () => json({ issue });

const circular: Record<string, unknown> = {};
circular.self = circular;

describe("building requests", () => {
  test("GET keeps the /redmine subpath, joins csv includes and sends JSON Accept without Content-Type", async () => {
    const { call, requests } = testEngine(ok);
    await call(ops.getIssue, { issue_id: 42, include: ["journals", "allowed_statuses"] });

    const [request] = requests;
    expect(request?.url.href.split("?")[0]).toBe(
      "https://tracker.example.com/redmine/issues/42.json",
    );
    expect(request?.url.searchParams.get("include")).toBe("journals,allowed_statuses");
    expect(request?.method).toBe("GET");
    expect(request?.headers.get("accept")).toBe("application/json");
    expect(request?.headers.has("content-type")).toBe(false);
  });

  test("the API key travels in a header and never in the URL", async () => {
    const { call, requests } = testEngine(ok);
    await call(ops.getIssue, { issue_id: 42 });

    expect(requests[0]?.headers.get("x-redmine-api-key")).toBe("secret-key");
    expect(requests[0]?.url.href).not.toContain("secret-key");
    expect(requests[0]?.url.searchParams.has("key")).toBe(false);
  });

  test("path parameters are percent-encoded into a single segment", async () => {
    const { call, requests } = testEngine(() => empty());
    await call(ops.removeUsersFromGroup, { group_id: "a/b c", user_ids: [1] });

    expect(requests[0]?.url.pathname).toBe("/redmine/groups/a%2Fb%20c/users.json");
  });

  test.each([
    ["a dot-dot segment", { issue_id: ".." }],
    ["a missing parameter", {}],
    ["an object", { issue_id: { id: 1 } }],
    ["NaN", { issue_id: Number.NaN }],
    ["Infinity", { issue_id: Number.POSITIVE_INFINITY }],
  ])("refuses %s as a path parameter before the network", async (_name, input) => {
    const { call, requests } = testEngine(ok);
    const error = await failure(call(ops.getIssue, input));

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  test.each([
    ["NaN", [Number.NaN]],
    ["Infinity next to a name", ["journals", Number.POSITIVE_INFINITY]],
  ])("refuses %s in a query value before the network", async (_name, include) => {
    const { call, requests } = testEngine(ok);
    const error = await failure(call(ops.getIssue, { issue_id: 1, include }));

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  test("a PUT wraps body fields in the envelope, keeps path params out and decodes 204 to undefined", async () => {
    const { call, requests } = testEngine(() => empty());
    const result = await call(ops.updateIssue, { issue_id: 7, subject: "x", notes: "n" });

    expect(result).toBeUndefined();
    expect(requests[0]?.method).toBe("PUT");
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
    expect(requests[0]?.json()).toEqual({ issue: { subject: "x", notes: "n" } });
  });

  test.each([
    [
      "null on a clear field becomes an empty string",
      { assigned_to_id: null },
      { assigned_to_id: "" },
    ],
    ["a value on a clear field is untouched", { assigned_to_id: 5 }, { assigned_to_id: 5 }],
    ["an omitted clear field stays omitted", { subject: "x" }, { subject: "x" }],
    ["an undefined clear field stays omitted", { assigned_to_id: undefined }, {}],
    [
      "null on any other field stays null",
      { due_date: null, description: null },
      { due_date: null, description: null },
    ],
    [
      "null inside a custom field value stays null",
      { custom_fields: [{ id: 1, value: null }] },
      { custom_fields: [{ id: 1, value: null }] },
    ],
    [
      "only the clear field changes",
      { assigned_to_id: null, category_id: null, notes: "n" },
      { assigned_to_id: "", category_id: null, notes: "n" },
    ],
  ])("%s in a PUT body", async (_name, input, sent) => {
    const { call, requests } = testEngine(() => empty());
    await call(ops.updateIssue, { issue_id: 7, ...input });

    expect(requests[0]?.json()).toEqual({ issue: sent });
  });

  test.each([
    ["NaN", { estimated_hours: Number.NaN }],
    ["Infinity", { estimated_hours: Number.POSITIVE_INFINITY }],
    ["-Infinity", { assigned_to_id: Number.NEGATIVE_INFINITY }],
    ["NaN inside a custom field value", { custom_fields: [{ id: 1, value: [Number.NaN] }] }],
    ["undefined inside an array", { watcher_user_ids: [1, undefined] }],
    ["a bigint", { estimated_hours: 1n }],
    ["a function", { notes: () => "n" }],
    ["a circular object", { custom_fields: [circular] }],
    ["a boxed NaN", { estimated_hours: Object(Number.NaN) }],
  ])("a typed body refuses %s before the network", async (_name, input) => {
    const { call, requests } = testEngine(() => empty());
    const error = await failure(call(ops.updateIssue, { issue_id: 7, ...input }));

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  test("an operation with no clear fields sends null as null", async () => {
    const { call, requests } = testEngine(() => json({ user: { id: 9 } }, 201));
    await call(ops.createUser, { login: "jsmith", auth_source_id: null });

    expect(requests[0]?.json()).toEqual({ user: { login: "jsmith", auth_source_id: null } });
  });

  test("siblings stay outside the envelope and the created item is unwrapped", async () => {
    const { call, requests } = testEngine(() => json({ user: { id: 9, login: "jsmith" } }, 201));
    const user = await call(ops.createUser, {
      login: "jsmith",
      mail: "j@example.com",
      send_information: true,
    });

    expect(requests[0]?.json()).toEqual({
      user: { login: "jsmith", mail: "j@example.com" },
      send_information: true,
    });
    expect(user).toEqual({ id: 9, login: "jsmith" });
  });

  test("a scalar body has no envelope", async () => {
    const { call, requests } = testEngine(() => empty());
    await call(ops.addWatcher, { issue_id: 3, user_id: 5 });

    expect(requests[0]?.json()).toEqual({ user_id: 5 });
  });

  test("a bodyless DELETE sends brackets query params, no body and no Content-Type", async () => {
    const { call, requests } = testEngine(() => empty(), { version: "7.0" });
    await call(ops.removeUsersFromGroup, { group_id: 3, user_ids: [1, 2] });

    const [request] = requests;
    expect(request?.method).toBe("DELETE");
    expect(request?.url.searchParams.getAll("user_ids[]")).toEqual(["1", "2"]);
    expect(request?.bytes).toHaveLength(0);
    expect(request?.headers.has("content-type")).toBe(false);
  });

  test("a key the bodyless operation does not take is refused instead of silently ignored", async () => {
    const { call, requests } = testEngine(() => empty());
    const error = await failure(call(ops.deleteIssue, { issue_id: 1, force: true }));

    expect(error.data).toMatchObject({ kind: "invalid_input" });
    expect(requests).toHaveLength(0);
  });

  test("`as` sets X-Redmine-Switch-User for that call only", async () => {
    const { call, requests } = testEngine(keyOf("admin", ok));
    await call(ops.getIssue, { issue_id: 1 }, { as: "jsmith" });
    await call(ops.getIssue, { issue_id: 1 });

    const sent = exceptGuard(requests);
    expect(sent[0]?.headers.get("x-redmine-switch-user")).toBe("jsmith");
    expect(sent[1]?.headers.has("x-redmine-switch-user")).toBe(false);
  });

  test.each([
    ["an object", { a: 1, b: [true, null] }],
    ["an array", [{ id: 1 }, { id: 2 }]],
    ["a string", "text"],
    ["a number", 0],
    ["false", false],
    ["null", null],
    ["an empty string", ""],
  ])("a value body takes %s and sends it verbatim as JSON", async (_name, payload) => {
    const { call, requests } = testEngine(() => empty());
    await call(ops.sendValue, { payload });

    expect(requests[0]?.text()).toBe(JSON.stringify(payload));
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
  });

  test.each([
    ["a missing payload", {}],
    ["undefined", { payload: undefined }],
    ["a function", { payload: () => 1 }],
    ["a function nested in an object", { payload: { cb: () => 1 } }],
    ["a symbol", { payload: Symbol("s") }],
    ["a bigint", { payload: 1n }],
    ["NaN", { payload: Number.NaN }],
    ["Infinity nested in an array", { payload: [Number.POSITIVE_INFINITY] }],
    ["undefined inside an array", { payload: [1, undefined] }],
    ["a circular object", { payload: circular }],
    ["a boxed NaN nested in an object", { payload: { hours: Object(Number.NaN) } }],
  ])("a value body refuses %s before the network", async (_name, input) => {
    const { call, requests } = testEngine(() => empty());
    const error = await failure(call(ops.sendValue, input));

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  test("a value body leaves an undefined property out, as JSON does", async () => {
    const { call, requests } = testEngine(() => empty());
    await call(ops.sendValue, { payload: { a: 1, b: undefined } });

    expect(requests[0]?.json()).toEqual({ a: 1 });
  });
});

describe("interpreting responses", () => {
  test("422 becomes validation with the raw, localized messages", async () => {
    const messages = ["Тема не может быть пустым", "Subject is too long"];
    const { call } = testEngine(() => json({ errors: messages }, 422, { "x-request-id": "req-1" }));
    const error = await failure(call(ops.updateIssue, { issue_id: 1, subject: "" }));

    expect(error.data).toEqual({ kind: "validation", status: 422, messages });
    expect(error.op).toBe("updateIssue");
    expect(error.request_id).toBe("req-1");
  });

  test("a 422 that is not an errors array is a plain http error, not an empty validation", async () => {
    const { call } = testEngine(() => json({ oops: true }, 422));
    const error = await failure(call(ops.updateIssue, { issue_id: 1 }));

    expect(error.data).toMatchObject({ kind: "http", status: 422 });
  });

  test.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [406, "not_acceptable"],
  ])("status %i maps to %s", async (status, kind) => {
    const { call, requests } = testEngine(() => new Response("", { status }));
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.kind).toBe(kind);
    expect(requests).toHaveLength(1);
  });

  test("412 on an impersonated call is switch_user_rejected by the server and names the login", async () => {
    const { call } = testEngine(keyOf("admin", () => new Response("", { status: 412 })));
    const error = await failure(call(ops.updateIssue, { issue_id: 1 }, { as: "ghost" }));

    expect(error.data).toEqual({
      kind: "switch_user_rejected",
      reason: "rejected_by_server",
      status: 412,
      login: "ghost",
    });
  });

  test("412 on a call that sent no switch header is a plain http error", async () => {
    const { call } = testEngine(() => new Response("", { status: 412 }));
    const error = await failure(call(ops.updateIssue, { issue_id: 1 }));

    expect(error.data).toMatchObject({ kind: "http", status: 412 });
  });

  test("an unmapped status keeps its body, truncated to 2 KiB", async () => {
    const { call } = testEngine(() => new Response("x".repeat(5000), { status: 500 }));
    const error = await failure(call(ops.updateIssue, { issue_id: 1 }));

    expect(error.data).toMatchObject({ kind: "http", status: 500 });
    expect(error.data.kind === "http" && error.data.body).toBe("x".repeat(2048));
  });

  test("an HTML 200 is protocol/non_json with a hint about the login page and the subpath", async () => {
    const { call } = testEngine(() => html("<html>Sign in</html>"));
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.data).toMatchObject({ kind: "protocol", reason: "non_json" });
    expect(error.data.kind === "protocol" && error.data.hint).toMatch(/login page.*subpath/);
  });

  test("a JSON content type with a broken body is protocol/bad_json", async () => {
    const { call } = testEngine(
      () => new Response("{nope", { headers: { "content-type": "application/json" } }),
    );
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.data).toMatchObject({ kind: "protocol", reason: "bad_json" });
  });

  test("an empty 200 on an item operation decodes to undefined", async () => {
    const { call } = testEngine(() => new Response("", { status: 200 }));

    expect(await call(ops.getIssue, { issue_id: 1 })).toBeUndefined();
  });
});

describe("conflicts", () => {
  test.each([
    ["GET", ops.getIssue, { issue_id: 1 }],
    ["PUT", ops.updateIssue, { issue_id: 1, notes: "n" }],
    ["POST", ops.createUser, { login: "a" }],
    ["DELETE", ops.deleteIssue, { issue_id: 1 }],
  ] as const)("409 on a %s is a conflict, whatever the body says", async (_method, op, input) => {
    const { call, requests } = testEngine(sequence(empty(409), json({ errors: ["x"] }, 409)));
    const empty409 = await failure(call(op, input));
    const bodied409 = await failure(call(op, input));

    expect(empty409.data).toEqual({ kind: "conflict", status: 409 });
    expect(bodied409.data).toEqual({ kind: "conflict", status: 409 });
    expect(requests).toHaveLength(2);
  });

  test("a 422 with an empty errors array is a conflict when the request carried lock_version", async () => {
    const { call, requests } = testEngine(() => json({ errors: [] }, 422));
    const error = await failure(call(ops.updateIssue, { issue_id: 1, lock_version: 0 }));

    expect(error.data).toEqual({ kind: "conflict", status: 422 });
    expect(requests).toHaveLength(1);
  });

  test("lock_version at the top of a bare body counts as carried", async () => {
    const { call } = testEngine(() => json({ errors: [] }, 422));
    const error = await failure(call(ops.sendValue, { payload: { lock_version: 3 } }));

    expect(error.data).toEqual({ kind: "conflict", status: 422 });
  });

  test("lock_version inside a value body's envelope counts as carried", async () => {
    const { call } = testEngine(() => json({ errors: [] }, 422));
    const error = await failure(call(ops.sendValue, { payload: { issue: { lock_version: 3 } } }));

    expect(error.data).toEqual({ kind: "conflict", status: 422 });
  });

  test.each([
    ["no lock_version in the body", { issue_id: 1, notes: "n" }],
    ["lock_version left undefined", { issue_id: 1, lock_version: undefined }],
  ])("a 422 with an empty errors array stays validation with %s", async (_name, input) => {
    const { call } = testEngine(() => json({ errors: [] }, 422));
    const error = await failure(call(ops.updateIssue, input));

    expect(error.data).toEqual({ kind: "validation", status: 422, messages: [] });
  });

  test("a 422 with messages stays validation even when the request carried lock_version", async () => {
    const { call } = testEngine(() => json({ errors: ["Subject cannot be blank"] }, 422));
    const error = await failure(call(ops.updateIssue, { issue_id: 1, lock_version: 0 }));

    expect(error.data).toEqual({
      kind: "validation",
      status: 422,
      messages: ["Subject cannot be blank"],
    });
  });

  test("a 422 with an empty errors array on a bodyless request stays validation", async () => {
    const { call } = testEngine(() => json({ errors: [] }, 422));
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.data).toEqual({ kind: "validation", status: 422, messages: [] });
  });
});

describe("the impersonation guard", () => {
  const checks = (requests: Parameters<typeof exceptGuard>[0]) => requests.filter(isGuardCheck);

  test("an admin key passes, and one check serves every later impersonated call", async () => {
    const events: SdkEvent[] = [];
    const { call, requests } = testEngine(keyOf("admin", ok), {
      onEvent: (event) => events.push(event),
    });
    for (const as of ["jsmith", "jsmith", "other"])
      await call(ops.getIssue, { issue_id: 1 }, { as });

    expect(checks(requests)).toHaveLength(1);
    expect(requests[0]?.headers.has("x-redmine-switch-user")).toBe(false);
    expect(requests[0]?.headers.get("x-redmine-api-key")).toBe("secret-key");
    expect(exceptGuard(requests).map((r) => r.headers.get("x-redmine-switch-user"))).toEqual([
      "jsmith",
      "jsmith",
      "other",
    ]);
    expect(events.filter((e) => e.type === "request").map((e) => e.op)).toEqual([
      "getCurrentUser",
      "getIssue",
      "getIssue",
      "getIssue",
    ]);
  });

  test("calls without `as` never trigger the check", async () => {
    const { call, requests } = testEngine(keyOf("member", ok));
    await call(ops.getIssue, { issue_id: 1 });

    expect(requests).toHaveLength(1);
    expect(checks(requests)).toHaveLength(0);
  });

  test.each([
    ["admin: false", { user: { id: 2, admin: false } }],
    ["no admin field", { user: { id: 2 } }],
    ["an unexpected shape", { surprise: true }],
  ])(
    "a key whose user reports %s is refused, and nothing impersonated is sent",
    async (_name, user) => {
      const { call, requests } = testEngine(() => json(user));
      const error = await failure(
        call(ops.updateIssue, { issue_id: 1, notes: "n" }, { as: "admin" }),
      );

      expect(error.data).toEqual({
        kind: "switch_user_rejected",
        login: "admin",
        reason: "not_admin",
      });
      expect(error.op).toBe("updateIssue");
      expect(requests).toHaveLength(1);
      expect(requests.some((r) => r.headers.has("x-redmine-switch-user"))).toBe(false);
      expect(requests[0]?.method).toBe("GET");
    },
  );

  test("the not-admin verdict is cached: later calls are refused without another check", async () => {
    const { call, requests } = testEngine(keyOf("member", ok));
    const first = await failure(call(ops.getIssue, { issue_id: 1 }, { as: "a" }));
    const second = await failure(call(ops.getIssue, { issue_id: 1 }, { as: "b" }));

    expect(first.data).toMatchObject({ login: "a", reason: "not_admin" });
    expect(second.data).toMatchObject({ login: "b", reason: "not_admin" });
    expect(requests).toHaveLength(1);
  });

  test("concurrent first calls share one check", async () => {
    const { call, requests } = testEngine(
      keyOf("admin", async (request) => {
        await sleep(10);
        return json({ issue, as: request.headers.get("x-redmine-switch-user") });
      }),
      { maxConcurrent: 8 },
    );
    const results = await Promise.all(
      ["a", "b", "c", "d", "e"].map((as) => call(ops.getIssue, { issue_id: 1 }, { as })),
    );

    expect(results).toHaveLength(5);
    expect(checks(requests)).toHaveLength(1);
    expect(exceptGuard(requests)).toHaveLength(5);
  });

  test("a check that finishes with the limiter full does not deadlock the call", async () => {
    const { call, requests } = testEngine(keyOf("admin", ok), { maxConcurrent: 1 });
    await Promise.all([
      call(ops.getIssue, { issue_id: 1 }, { as: "a" }),
      call(ops.getIssue, { issue_id: 2 }, { as: "b" }),
    ]);

    expect(requests).toHaveLength(3);
  });

  test("a 401 on the check surfaces as unauthorized, sends nothing impersonated and is not cached", async () => {
    let answer: Response | undefined = empty(401);
    const { call, requests } = testEngine((request) => {
      if (isGuardCheck(request)) return answer?.clone() ?? json({ user: { admin: true } });
      return json({ issue });
    });
    const refused = await failure(call(ops.getIssue, { issue_id: 1 }, { as: "jsmith" }));
    answer = undefined;
    const value = await call(ops.getIssue, { issue_id: 1 }, { as: "jsmith" });

    expect(refused.data).toEqual({ kind: "unauthorized", status: 401 });
    expect(refused.op).toBe("getCurrentUser");
    expect(value).toEqual(issue);
    expect(
      requests.map((r) => [
        r.url.pathname.split("/").pop(),
        r.headers.get("x-redmine-switch-user"),
      ]),
    ).toEqual([
      ["current.json", null],
      ["current.json", null],
      ["1.json", "jsmith"],
    ]);
  });

  test("a network failure on the check surfaces as network and the next call asks again", async () => {
    let down = true;
    const { call, requests } = testEngine(
      (request) => {
        if (!isGuardCheck(request)) return json({ issue });
        if (down) throw new TypeError("fetch failed");
        return json({ user: { admin: true } });
      },
      { retry: false },
    );
    const refused = await failure(call(ops.getIssue, { issue_id: 1 }, { as: "jsmith" }));
    down = false;
    await call(ops.getIssue, { issue_id: 1 }, { as: "jsmith" });

    expect(refused.data).toEqual({ kind: "network", message: "fetch failed" });
    expect(checks(requests)).toHaveLength(2);
  });

  test("bad input is refused before the check is spent", async () => {
    const { call, requests } = testEngine(keyOf("admin", ok));
    const error = await failure(call(ops.getIssue, {}, { as: "jsmith" }));

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  test("a check whose token never arrives times out instead of holding the impersonated call", async () => {
    const { call, requests } = testEngine(keyOf("admin", ok), {
      timeoutMs: 10,
      retry: false,
      auth: { bearer: { token: () => new Promise<string>(() => {}) } },
    });
    const error = await failure(call(ops.getIssue, { issue_id: 1 }, { as: "jsmith" }));

    expect(error.data).toEqual({ kind: "timeout", after_ms: 10 });
    expect(requests).toHaveLength(0);
  });

  test("a caller that aborts while the shared check is pending stops waiting without cancelling it for others", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { call, requests } = testEngine(async (request) => {
      if (!isGuardCheck(request)) return json({ issue });
      await gate;
      return json({ user: { admin: true } });
    });
    const controller = new AbortController();
    const aborted = failure(
      call(ops.getIssue, { issue_id: 1 }, { as: "a", signal: controller.signal }),
    );
    const patient = call(ops.getIssue, { issue_id: 2 }, { as: "b" });
    await sleep(5);
    controller.abort();
    release();

    expect((await aborted).data).toEqual({ kind: "aborted" });
    expect(await patient).toEqual(issue);
    expect(checks(requests)).toHaveLength(1);
    expect(exceptGuard(requests)).toHaveLength(1);
  });
});

describe("retries by safety class", () => {
  const cases = [
    ["GET on 503", ops.getIssue, { issue_id: 1 }, 503, 3],
    ["GET on 504", ops.getIssue, { issue_id: 1 }, 504, 3],
    ["GET on 500", ops.getIssue, { issue_id: 1 }, 500, 1],
    ["GET on 404", ops.getIssue, { issue_id: 1 }, 404, 1],
    ["DELETE on 502", ops.deleteIssue, { issue_id: 1 }, 502, 3],
    ["PUT on 503", ops.updateIssue, { issue_id: 1, notes: "n" }, 503, 1],
    ["POST on 503", ops.createUser, { login: "a" }, 503, 1],
    ["POST on 429", ops.createUser, { login: "a" }, 429, 3],
    ["PUT on 429", ops.updateIssue, { issue_id: 1, notes: "n" }, 429, 3],
  ] as const;

  test.each(cases)("%s makes %i requests", async (_name, op, input, status, expected) => {
    const { call, requests } = testEngine(() => new Response("", { status }));
    await failure(call(op, input));

    expect(requests).toHaveLength(expected);
  });

  test("a retry that succeeds returns the value after the failed attempts", async () => {
    const { call, requests } = testEngine(sequence(empty(503), json({ issue })));

    expect(await call(ops.getIssue, { issue_id: 42 })).toEqual(issue);
    expect(requests).toHaveLength(2);
  });

  test.each([
    ["retry: false per call", {}, { retry: false as const }, 1],
    ["retry: false in config", { retry: false as const }, {}, 1],
    [
      "a per-call policy re-enabling a disabled client",
      { retry: false as const },
      { retry: { attempts: 1, baseMs: 1, maxMs: 1 } },
      2,
    ],
  ])("%s", async (_name, config, options, expected) => {
    const { call, requests } = testEngine(() => empty(503), config);
    await failure(call(ops.getIssue, { issue_id: 1 }, options));

    expect(requests).toHaveLength(expected);
  });

  test("network errors retry GET and never PUT", async () => {
    const get = testEngine(() => {
      throw new TypeError("fetch failed");
    });
    const error = await failure(get.call(ops.getIssue, { issue_id: 1 }));
    const put = testEngine(() => {
      throw new TypeError("fetch failed");
    });
    await failure(put.call(ops.updateIssue, { issue_id: 1 }));

    expect(error.data).toEqual({ kind: "network", message: "fetch failed" });
    expect(get.requests).toHaveLength(3);
    expect(put.requests).toHaveLength(1);
  });

  test("Retry-After is honored and capped by maxMs", async () => {
    const events: SdkEvent[] = [];
    const { call, requests } = testEngine(
      sequence(empty(429, { "retry-after": "2" }), json({ issue })),
      {
        retry: { attempts: 2, baseMs: 1, maxMs: 40 },
        onEvent: (event) => events.push(event),
      },
    );
    const started = performance.now();
    await call(ops.getIssue, { issue_id: 42 });

    expect(requests).toHaveLength(2);
    expect(events.find((e) => e.type === "retry")).toMatchObject({ delay_ms: 40 });
    expect(performance.now() - started).toBeGreaterThanOrEqual(35);
  });

  test("without Retry-After the delay stays inside the jittered backoff window", async () => {
    const events: SdkEvent[] = [];
    const { call } = testEngine(() => empty(503), {
      retry: { attempts: 2, baseMs: 4, maxMs: 1000 },
      onEvent: (event) => events.push(event),
    });
    await failure(call(ops.getIssue, { issue_id: 1 }));

    const delays = events.flatMap((e) => (e.type === "retry" ? [e.delay_ms] : []));
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeLessThanOrEqual(4);
    expect(delays[1]).toBeLessThanOrEqual(8);
  });

  test("a streamed body is sent once even on 429", async () => {
    const { call, requests } = testEngine(() => empty(429));
    const file = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    await failure(call(ops.uploadAttachmentFile, { file, filename: "a.bin" }));

    expect(requests).toHaveLength(1);
    expect([...(requests[0]?.bytes ?? [])]).toEqual([1, 2, 3]);
  });
});

describe("timeouts and cancellation", () => {
  test("a slow server is a timeout carrying the limit, not an abort", async () => {
    const { call } = testEngine(hang, { timeoutMs: 15, retry: false });
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.data).toEqual({ kind: "timeout", after_ms: 15 });
  });

  test("a per-call timeout overrides the client's", async () => {
    const { call } = testEngine(hang, { timeoutMs: 60_000, retry: false });
    const error = await failure(call(ops.getIssue, { issue_id: 1 }, { timeoutMs: 10 }));

    expect(error.data).toEqual({ kind: "timeout", after_ms: 10 });
  });

  test.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["zero", 0],
    ["a negative number", -1],
    ["2 ** 31", 2 ** 31],
  ])("a per-call timeout of %s is refused before anything is sent", async (_name, timeoutMs) => {
    const { call, requests } = testEngine(keyOf("admin", ok));
    const error = await failure(call(ops.getIssue, { issue_id: 1 }, { as: "jsmith", timeoutMs }));

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  test("timeouts retry a GET and never a PUT", async () => {
    const get = testEngine(hang, { timeoutMs: 10 });
    const put = testEngine(hang, { timeoutMs: 10 });
    await failure(get.call(ops.getIssue, { issue_id: 1 }));
    await failure(put.call(ops.updateIssue, { issue_id: 1 }));

    expect(get.requests).toHaveLength(3);
    expect(put.requests).toHaveLength(1);
  });

  test.each([
    ["GET", ops.getIssue],
    ["PUT", ops.updateIssue],
  ])(
    "the caller's signal on a %s is an abort, is not retried and reaches fetch",
    async (_method, op) => {
      const controller = new AbortController();
      const { call, requests } = testEngine(hang, { timeoutMs: 60_000 });
      const pending = failure(call(op, { issue_id: 1 }, { signal: controller.signal }));
      await sleep(5);
      controller.abort();
      const error = await pending;

      expect(error.data).toEqual({ kind: "aborted" });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.signal.aborted).toBe(true);
    },
  );

  test("an already aborted signal never reaches the network", async () => {
    const { call, requests } = testEngine(ok);
    const error = await failure(
      call(ops.getIssue, { issue_id: 1 }, { signal: AbortSignal.abort() }),
    );

    expect(error.kind).toBe("aborted");
    expect(requests).toHaveLength(0);
  });

  test("a call waiting for a slot can be aborted and then sends nothing", async () => {
    const { call, requests } = testEngine(hang, { maxConcurrent: 1, timeoutMs: 60_000 });
    const first = new AbortController();
    const second = new AbortController();
    const running = failure(call(ops.getIssue, { issue_id: 1 }, { signal: first.signal }));
    const queued = failure(call(ops.getIssue, { issue_id: 2 }, { signal: second.signal }));
    await sleep(5);
    second.abort();

    expect((await queued).kind).toBe("aborted");
    first.abort();
    await running;
    expect(requests.map((r) => r.url.pathname)).toEqual(["/redmine/issues/1.json"]);
  });

  test("a call sleeping between retries can be aborted", async () => {
    const controller = new AbortController();
    const { call, requests } = testEngine(() => empty(503, { "retry-after": "5" }), {
      retry: { attempts: 2, baseMs: 1, maxMs: 5000 },
    });
    const pending = failure(call(ops.getIssue, { issue_id: 1 }, { signal: controller.signal }));
    await sleep(15);
    controller.abort();

    expect((await pending).kind).toBe("aborted");
    expect(requests).toHaveLength(1);
  });
});

describe("concurrency", () => {
  test("never exceeds maxConcurrent, and uses all of it", async () => {
    let inFlight = 0;
    let peak = 0;
    const { call, requests } = testEngine(
      async () => {
        peak = Math.max(peak, ++inFlight);
        await sleep(5);
        inFlight--;
        return json({ issue });
      },
      { maxConcurrent: 2 },
    );
    await Promise.all(Array.from({ length: 8 }, (_, i) => call(ops.getIssue, { issue_id: i })));

    expect(requests).toHaveLength(8);
    expect(peak).toBe(2);
  });

  test("queued calls run in the order they were made", async () => {
    const { call, requests } = testEngine(
      async () => {
        await sleep(2);
        return json({ issue });
      },
      { maxConcurrent: 1 },
    );
    await Promise.all([1, 2, 3, 4, 5].map((id) => call(ops.getIssue, { issue_id: id })));

    expect(requests.map((r) => r.url.pathname)).toEqual(
      [1, 2, 3, 4, 5].map((id) => `/redmine/issues/${id}.json`),
    );
  });

  test("a call backing off does not hold its slot", async () => {
    const attempts = new Map<string, number>();
    const { call, requests } = testEngine(
      (request) => {
        const seen = (attempts.get(request.url.pathname) ?? 0) + 1;
        attempts.set(request.url.pathname, seen);
        const flaky = request.url.pathname.endsWith("/1.json") && seen === 1;
        return flaky ? empty(503, { "retry-after": "1" }) : json({ issue });
      },
      { maxConcurrent: 1, retry: { attempts: 2, baseMs: 1, maxMs: 30 } },
    );
    await Promise.all([call(ops.getIssue, { issue_id: 1 }), call(ops.getIssue, { issue_id: 2 })]);

    expect(requests.map((r) => r.url.pathname)).toEqual([
      "/redmine/issues/1.json",
      "/redmine/issues/2.json",
      "/redmine/issues/1.json",
    ]);
  });
});

describe("authentication", () => {
  test("Basic credentials are UTF-8 safe", async () => {
    const { call, requests } = testEngine(ok, {
      auth: { basic: { login: "jörg", password: "pässwörd✓" } },
    });
    await call(ops.getIssue, { issue_id: 1 });

    const header = requests[0]?.headers.get("authorization") ?? "";
    const bytes = Uint8Array.from(atob(header.replace("Basic ", "")), (c) => c.charCodeAt(0));
    expect(header.startsWith("Basic ")).toBe(true);
    expect(new TextDecoder().decode(bytes)).toBe("jörg:pässwörd✓");
    expect(requests[0]?.headers.has("x-redmine-api-key")).toBe(false);
  });

  test("a bearer source is asked for the token on every request", async () => {
    let token = "t1";
    const { call, requests } = testEngine(ok, { auth: { bearer: { token: () => token } } });
    await call(ops.getIssue, { issue_id: 1 });
    token = "t2";
    await call(ops.getIssue, { issue_id: 1 });

    expect(requests.map((r) => r.headers.get("authorization"))).toEqual(["Bearer t1", "Bearer t2"]);
  });

  function expiringBearer(): {
    auth: { bearer: { token(): string; refresh(): Promise<string> } };
    refreshes: () => number;
  } {
    let token = "old";
    let refreshes = 0;
    return {
      refreshes: () => refreshes,
      auth: {
        bearer: {
          token: () => token,
          async refresh() {
            refreshes++;
            await sleep(10);
            token = "new";
            return token;
          },
        },
      },
    };
  }

  test("concurrent 401s share one refresh, even those that arrive after it finished, and each replays once", async () => {
    const bearer = expiringBearer();
    const { call, requests } = testEngine(
      async (request, call) => {
        if (request.headers.get("authorization") === "Bearer new") return json({ issue });
        await sleep(call * 4);
        return empty(401);
      },
      { auth: bearer.auth, maxConcurrent: 10 },
    );
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => call(ops.getIssue, { issue_id: i + 1 })),
    );

    expect(results).toEqual(Array.from({ length: 5 }, () => issue));
    expect(bearer.refreshes()).toBe(1);
    expect(requests).toHaveLength(10);
  });

  test("a second 401 after the refresh is surfaced, not replayed again", async () => {
    const bearer = expiringBearer();
    const { call, requests } = testEngine(() => empty(401), { auth: bearer.auth });
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.kind).toBe("unauthorized");
    expect(requests).toHaveLength(2);
    expect(bearer.refreshes()).toBe(1);
  });

  test("a bearer without refresh and a static key are not replayed on 401", async () => {
    const bearer = testEngine(() => empty(401), { auth: { bearer: { token: () => "t" } } });
    const key = testEngine(() => empty(401));
    await failure(bearer.call(ops.getIssue, { issue_id: 1 }));
    await failure(key.call(ops.getIssue, { issue_id: 1 }));

    expect(bearer.requests).toHaveLength(1);
    expect(key.requests).toHaveLength(1);
  });

  test("a streamed body is not replayed after a refresh", async () => {
    const bearer = expiringBearer();
    const { call, requests } = testEngine(() => empty(401), { auth: bearer.auth });
    const file = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    await failure(call(ops.uploadAttachmentFile, { file, filename: "a" }));

    expect(requests).toHaveLength(1);
    expect(bearer.refreshes()).toBe(0);
  });

  test("a failing refresh surfaces the 401 with the cause attached", async () => {
    const cause = new Error("refresh token revoked");
    const { call } = testEngine(() => empty(401), {
      auth: {
        bearer: {
          token: () => "t",
          refresh: () => Promise.reject(cause),
        },
      },
    });
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.kind).toBe("unauthorized");
    expect(error.cause).toBe(cause);
  });

  test("a token() that never settles is a timeout and sends nothing", async () => {
    const { call, requests } = testEngine(ok, {
      timeoutMs: 10,
      retry: false,
      auth: { bearer: { token: () => new Promise<string>(() => {}) } },
    });
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.data).toEqual({ kind: "timeout", after_ms: 10 });
    expect(requests).toHaveLength(0);
  });

  test("a caller that aborts while token() is pending stops waiting and frees its slot", async () => {
    let tokens = 0;
    const { call, requests } = testEngine(ok, {
      maxConcurrent: 1,
      timeoutMs: 60_000,
      auth: { bearer: { token: () => (++tokens === 1 ? new Promise<string>(() => {}) : "t") } },
    });
    const controller = new AbortController();
    const stuck = failure(call(ops.getIssue, { issue_id: 1 }, { signal: controller.signal }));
    const queued = call(ops.getIssue, { issue_id: 2 });
    await sleep(5);
    controller.abort();

    expect((await stuck).data).toEqual({ kind: "aborted" });
    expect(await queued).toEqual(issue);
    expect(requests.map((r) => r.url.pathname)).toEqual(["/redmine/issues/2.json"]);
  });

  test("an abort whose reason is a RedmineError is still aborted and starts no refresh", async () => {
    let refreshes = 0;
    const refresh = (): string => {
      refreshes++;
      return "new";
    };
    const { call, requests } = testEngine(ok, {
      timeoutMs: 60_000,
      auth: { bearer: { token: () => new Promise<string>(() => {}), refresh } },
    });
    const controller = new AbortController();
    const stuck = failure(call(ops.getIssue, { issue_id: 1 }, { signal: controller.signal }));
    await sleep(5);
    controller.abort(new RedmineError({ kind: "unauthorized", status: 401 }, {}));

    expect((await stuck).data).toEqual({ kind: "aborted" });
    expect(refreshes).toBe(0);
    expect(requests).toHaveLength(0);
  });

  test.each([
    [
      "throws",
      () => {
        throw new Error("vault down");
      },
    ],
    ["rejects", () => Promise.reject(new Error("vault down"))],
  ])(
    "a token() that %s fails the call as network, with the error as its cause",
    async (_name, token) => {
      const { call, requests } = testEngine(ok, { retry: false, auth: { bearer: { token } } });
      const error = await failure(call(ops.getIssue, { issue_id: 1 }));

      expect(error.kind).toBe("network");
      expect(error.cause).toEqual(new Error("vault down"));
      expect(requests).toHaveLength(0);
    },
  );

  test("a token() that throws an unauthorized RedmineError is network and starts no refresh", async () => {
    const thrown = new RedmineError({ kind: "unauthorized", status: 401 }, {});
    let refreshes = 0;
    const token = (): string => {
      throw thrown;
    };
    const refresh = (): string => {
      refreshes++;
      return "new";
    };
    const { call, requests } = testEngine(ok, {
      retry: false,
      auth: { bearer: { token, refresh } },
    });
    const error = await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(error.kind).toBe("network");
    expect(error.cause).toBe(thrown);
    expect(refreshes).toBe(0);
    expect(requests).toHaveLength(0);
  });

  test("a caller that aborts during a shared refresh stops waiting without cancelling it for others", async () => {
    let finish: (token: string) => void = () => {};
    let refreshes = 0;
    let token = "old";
    const { call } = testEngine(
      (request) =>
        request.headers.get("authorization") === "Bearer new" ? json({ issue }) : empty(401),
      {
        maxConcurrent: 10,
        auth: {
          bearer: {
            token: () => token,
            refresh: () => {
              refreshes++;
              return new Promise<string>((resolve) => (finish = (t) => resolve((token = t))));
            },
          },
        },
      },
    );
    const controller = new AbortController();
    const aborted = failure(call(ops.getIssue, { issue_id: 1 }, { signal: controller.signal }));
    const patient = call(ops.getIssue, { issue_id: 2 });
    await sleep(5);
    controller.abort();

    expect((await aborted).data).toEqual({ kind: "aborted" });
    finish("new");
    expect(await patient).toEqual(issue);
    expect(refreshes).toBe(1);
  });
});

describe("declared version", () => {
  test("an operation newer than the declared version is refused before any request", async () => {
    const { call, requests } = testEngine(() => empty(), { version: "6.1" });
    const error = await failure(call(ops.removeUsersFromGroup, { group_id: 1, user_ids: [1] }));

    expect(error.data).toEqual({
      kind: "unsupported_version",
      declared: "6.1",
      since: "7.0",
      until: null,
    });
    expect(requests).toHaveLength(0);
  });

  test("the same operation runs against 7.0", async () => {
    const { call, requests } = testEngine(() => empty(), { version: "7.0" });
    await call(ops.removeUsersFromGroup, { group_id: 1, user_ids: [1] });

    expect(requests).toHaveLength(1);
  });

  test("a refused list is refused when consumed, not when created", async () => {
    const { list, requests } = testEngine(() => json({}), { version: "6.1" });
    const newer = { ...ops.getIssues, since: "7.0" } as const;
    const listing = list(newer);

    expect((await failure(listing.all())).kind).toBe("unsupported_version");
    expect(requests).toHaveLength(0);
  });

  test("a 404 on an operation newer than the oldest version hints at the server version when none is declared", async () => {
    const { call } = testEngine(() => empty(404));
    const error = await failure(call(ops.removeUsersFromGroup, { group_id: 1, user_ids: [1] }));

    expect(error.data).toMatchObject({ kind: "not_found", hint: expect.stringContaining("7.0") });
    expect(error.op).toBe("removeUsersFromGroup");
  });

  test.each([
    [
      "a declared version",
      ops.removeUsersFromGroup,
      { group_id: 1, user_ids: [1] },
      { version: "7.0" as const },
    ],
    ["an operation from the oldest version", ops.getIssue, { issue_id: 1 }, {}],
  ])("a 404 carries no hint for %s", async (_name, op, input, config) => {
    const { call } = testEngine(() => empty(404), config);
    const error = await failure(call(op, input));

    expect(error.data).toEqual({ kind: "not_found", status: 404 });
  });
});

describe("events", () => {
  test("report each attempt, retry and the final error without credentials", async () => {
    const events: SdkEvent[] = [];
    const { call } = testEngine(() => empty(503), { onEvent: (e) => events.push(e) });
    await failure(call(ops.getIssue, { issue_id: 1 }));

    expect(events.map((e) => e.type)).toEqual([
      "request",
      "response",
      "retry",
      "request",
      "response",
      "retry",
      "request",
      "response",
      "error",
    ]);
    expect(events[0]).toMatchObject({ op: "getIssue", method: "GET", attempt: 1 });
    expect(events[1]).toMatchObject({ status: 503, attempt: 1 });
    expect(JSON.stringify(events)).not.toContain("secret-key");
  });

  test("an observer that throws does not break the call", async () => {
    const { call } = testEngine(ok, {
      onEvent: () => {
        throw new Error("observer bug");
      },
    });

    expect(await call(ops.getIssue, { issue_id: 42 })).toEqual(issue);
  });
});

describe("quirks", () => {
  test.each([
    ["8/1", 8],
    ["1.5", 1.5],
    ["3/2", 1.5],
    [2.25, 2.25],
  ])("hours %j reads as %d on a single time entry", async (hours, expected) => {
    const { call } = testEngine(() => json({ time_entry: { id: 1, hours, comments: "8/1" } }));
    const entry = await call(ops.getTimeEntry, { time_entry_id: 1 });

    expect(entry).toEqual({ id: 1, hours: expected, comments: "8/1" });
  });

  test("hours are fixed inside a list and unrelated strings are left alone", async () => {
    const { list } = testEngine(() =>
      json({
        time_entries: [
          { id: 1, hours: "8/1" },
          { id: 2, hours: 3 },
          { id: 3, hours: "n/a" },
        ],
        total_count: 3,
        offset: 0,
        limit: 100,
      }),
    );
    const entries = await list(ops.getTimeEntries).all();

    expect(entries).toEqual([
      { id: 1, hours: 8 },
      { id: 2, hours: 3 },
      { id: 3, hours: "n/a" },
    ]);
  });

  test("normalize: false leaves the server's value", async () => {
    const { call } = testEngine(() => json({ time_entry: { id: 1, hours: "8/1" } }), {
      normalize: false,
    });

    expect(await call(ops.getTimeEntry, { time_entry_id: 1 })).toEqual({
      id: 1,
      hours: "8/1",
    });
  });
});

describe("lists that Redmine reverses for a user who reads comments newest first", () => {
  const at = (second: number) => `2026-10-27T10:00:${String(second).padStart(2, "0")}Z`;
  const journal = (id: number, second: number) => ({ id, created_on: at(second) });
  const changeset = (revision: string, second: number) => ({ revision, committed_on: at(second) });

  async function journalIds(journals: readonly object[], config = {}) {
    const { call } = testEngine(() => json({ issue: { id: 42, journals } }), config);
    const issue = (await call(ops.getIssue, { issue_id: 42, include: ["journals"] })) as {
      journals: { id: number }[];
    };
    return issue.journals.map((entry) => entry.id);
  }

  test.each([
    ["newest first", [journal(3, 2), journal(2, 1), journal(1, 0)], [1, 2, 3]],
    ["oldest first", [journal(1, 0), journal(2, 1), journal(3, 2)], [1, 2, 3]],
    ["as one entry", [journal(1, 0)], [1]],
    ["empty", [], []],
    ["newest first within one second", [journal(3, 0), journal(2, 0), journal(1, 0)], [1, 2, 3]],
    [
      "oldest first, with a same-second pair out of id order",
      [journal(7, 0), journal(6, 0), journal(8, 5)],
      [7, 6, 8],
    ],
    [
      "newest first, with a same-second pair out of id order",
      [journal(8, 5), journal(6, 0), journal(7, 0)],
      [7, 6, 8],
    ],
  ])(
    "issue journals sent %s come back in Redmine's oldest-first order",
    async (_, sent, expected) => {
      expect(await journalIds(sent)).toEqual(expected);
    },
  );

  test.each([
    ["newest first", [changeset("c", 2), changeset("b", 1), changeset("a", 0)], ["a", "b", "c"]],
    ["oldest first", [changeset("a", 0), changeset("b", 1), changeset("c", 2)], ["a", "b", "c"]],
    ["as one entry", [changeset("a", 0)], ["a"]],
    ["empty", [], []],
  ])("issue changesets sent %s come back oldest first", async (_, changesets, expected) => {
    const { call } = testEngine(() => json({ issue: { id: 42, changesets } }));
    const issue = (await call(ops.getIssue, { issue_id: 42 })) as {
      changesets: { revision: string }[];
    };
    expect(issue.changesets.map((entry) => entry.revision)).toEqual(expected);
  });

  test("changesets committed in one second stay as sent, since the API sends no id to order them by", async () => {
    const changesets = [changeset("b", 0), changeset("a", 0)];
    const { call } = testEngine(() => json({ issue: { id: 42, changesets } }));

    expect(await call(ops.getIssue, { issue_id: 42 })).toEqual({ id: 42, changesets });
  });

  test.each([
    ["newest first", [3, 2, 1], [1, 2, 3]],
    ["oldest first", [1, 2, 3], [1, 2, 3]],
    ["as one entry", [1], [1]],
    ["empty", [], []],
    ["oldest first, with comment 3 dated before the others", [3, 1, 2], [1, 2, 3]],
    ["newest first, with comment 3 dated before the others", [2, 1, 3], [1, 2, 3]],
  ])("news comments sent %s come back in id order", async (_, sent, expected) => {
    const comments = sent.map((id) => ({ id, content: `Comment ${id}` }));
    const { call } = testEngine(() => json({ news: { id: 5, comments } }));
    const news = (await call(ops.getNews, { news_id: 5, include: ["comments"] })) as {
      comments: { id: number }[];
    };
    expect(news.comments.map((entry) => entry.id)).toEqual(expected);
  });

  test("leaves lists that are already in order as the same object", () => {
    const issue = { issue: { id: 42, journals: [journal(1, 0), journal(2, 1)] } };
    const news = { news: { id: 5, comments: [{ id: 1 }, { id: 2 }] } };
    expect(normalizeResponse(issue)).toBe(issue);
    expect(normalizeResponse(news)).toBe(news);
  });

  test("normalize: false keeps the order Redmine sent", async () => {
    expect(await journalIds([journal(2, 1), journal(1, 0)], { normalize: false })).toEqual([2, 1]);
  });
});

test("every failure a caller can see is a RedmineError", async () => {
  const { call } = testEngine(
    () => {
      throw new TypeError("fetch failed");
    },
    { retry: false },
  );

  expect(await failure(call(ops.getIssue, { issue_id: 1 }))).toBeInstanceOf(RedmineError);
});
