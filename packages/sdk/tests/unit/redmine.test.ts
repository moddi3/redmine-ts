import { describe, expect, test, vi } from "vite-plus/test";
import { createRedmine } from "../../src/redmine.ts";
import {
  BASE_URL,
  empty,
  exceptGuard,
  failure,
  fakeFetch,
  hang,
  html,
  isGuardCheck,
  json,
  keyOf,
  sequence,
  sleep,
} from "./fixtures/fake-fetch.ts";
import type { Responder } from "./fixtures/fake-fetch.ts";

// Assembly is tested against the hand-made registry: a regenerate cannot change what is asserted here.
vi.mock("../../src/generated/ops.ts", async () => ({
  ops: (await import("./fixtures/registry.ts")).ops,
}));
vi.mock("../../src/generated/slots.ts", async () => ({
  SLOTS: (await import("./fixtures/registry.ts")).SLOTS,
}));

const issue = { id: 42, subject: "Printer on fire" };
const journalsNewestFirst = [
  { id: 2, created_on: "2026-10-27T10:00:01Z" },
  { id: 1, created_on: "2026-10-27T10:00:00Z" },
];

/** createRedmine over a fake fetch. The client type is the placeholder's, so methods are reached through `any`. */
function client(respond: Responder, config: Record<string, unknown> = {}) {
  const fake = fakeFetch(respond);
  // oxlint-disable-next-line no-explicit-any -- the generated Resources type is a placeholder until generation lands
  const rm: any = createRedmine({
    baseUrl: BASE_URL,
    auth: { apiKey: "secret-key" },
    fetch: fake.fetch,
    retry: { attempts: 2, baseMs: 1, maxMs: 5 },
    ...config,
  });
  return { rm, requests: fake.requests };
}

describe("namespaces", () => {
  test("rm.<namespace>.<verb>(input) dispatches the slot's operation", async () => {
    const { rm, requests } = client(() => json({ issue }));

    expect(await rm.issues.get({ issue_id: 42, include: ["journals"] })).toEqual(issue);
    expect(requests[0]?.url.href).toBe(`${BASE_URL}/issues/42.json?include=journals`);
  });

  test("a missing input is an empty input, not a crash", async () => {
    const { rm, requests } = client(() => json({ issue_statuses: [] }));

    expect(await failure(rm.issues.get())).toMatchObject({ kind: "invalid_input" });
    expect(requests).toHaveLength(0);
  });

  test("list verbs return a lazy Listing", async () => {
    const { rm, requests } = client(() =>
      json({ issues: [issue], total_count: 1, offset: 0, limit: 100 }),
    );
    const listing = rm.issues.list({ where: { status_id: "open" } });
    const seen: unknown[] = [];
    for await (const item of listing) seen.push(item);

    expect(seen).toEqual([issue]);
    expect(requests).toHaveLength(1);
  });

  test("a declared version refuses newer operations through the namespace", async () => {
    const { rm, requests } = client(() => empty(), { version: "6.1" });

    expect(await failure(rm.groups.removeUsers({ group_id: 1, user_ids: [1] }))).toMatchObject({
      kind: "unsupported_version",
    });
    expect(requests).toHaveLength(0);
    expect(rm.version).toBe("6.1");
  });

  test("the client is frozen", () => {
    const { rm } = client(() => empty());

    expect(() => {
      rm.issues = {};
    }).toThrow();
  });
});

describe("access", () => {
  type Access = "full" | "no-delete" | "read-only";
  const allowed: Record<Access, string[]> = {
    full: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    "no-delete": ["GET", "POST", "PUT", "PATCH"],
    "read-only": ["GET"],
  };
  const tiers = Object.keys(allowed) as Access[];
  // oxlint-disable-next-line no-explicit-any -- see client()
  const calls: Record<string, (rm: any) => Promise<unknown>> = {
    GET: (rm) => rm.issues.get({ issue_id: 1 }),
    POST: (rm) => rm.users.create({ login: "x" }),
    PUT: (rm) => rm.issues.update({ issue_id: 1, notes: "n" }),
    PATCH: (rm) => rm.attachments.update({ attachment_id: 1, description: "d" }),
    DELETE: (rm) => rm.issues.remove({ issue_id: 1 }),
  };
  const answer = (request: { method: string }): Response =>
    request.method === "GET" ? json({ issue }) : empty();
  const settle = (promise: Promise<unknown>): Promise<unknown> =>
    promise.then(
      () => undefined,
      (error: unknown) => error,
    );

  describe.each(tiers)("%s", (access) => {
    test.each(Object.keys(calls))("a generated %s method", async (method) => {
      const { rm, requests } = client(answer, { access });
      const outcome = await settle(calls[method]!(rm));

      if (allowed[access].includes(method)) {
        expect(outcome).toBeUndefined();
        expect(requests.map((r) => r.method)).toEqual([method]);
      } else {
        expect(outcome).toMatchObject({ data: { kind: "access_denied", access, method } });
        expect(requests).toHaveLength(0);
      }
    });

    test.each(Object.keys(calls))("rm.request with %s", async (method) => {
      const { rm, requests } = client(answer, { access });
      const outcome = await settle(rm.request({ method, path: "plugin/things.json" }));

      if (allowed[access].includes(method)) {
        expect(outcome).toBeUndefined();
        expect(requests.map((r) => r.method)).toEqual([method]);
      } else {
        expect(outcome).toMatchObject({
          op: "request",
          data: { kind: "access_denied", access, method },
        });
        expect(requests).toHaveLength(0);
      }
    });

    test("a listing reads", async () => {
      const { rm, requests } = client(
        () => json({ issues: [issue], total_count: 1, offset: 0, limit: 100 }),
        { access },
      );

      expect(await rm.issues.list().all()).toEqual([issue]);
      expect(requests).toHaveLength(1);
    });

    test("issues.transition, a read plus an update, sends nothing unless updates are allowed", async () => {
      const { rm, requests } = client(
        (request) =>
          request.method === "GET"
            ? json({ issue: { id: 1, status: { id: 1 }, allowed_statuses: [{ id: 2 }] } })
            : empty(),
        { access },
      );
      const outcome = await settle(rm.issues.transition({ issue_id: 1, status_id: 2 }));

      if (allowed[access].includes("PUT")) {
        expect(outcome).toBeUndefined();
        expect(requests.map((r) => r.method)).toEqual(["GET", "PUT"]);
      } else {
        expect(outcome).toMatchObject({ data: { kind: "access_denied", access, method: "PUT" } });
        expect(requests).toHaveLength(0);
      }
    });

    test("attachments upload posts only when POST is allowed, and download always reads", async () => {
      const { rm, requests } = client(
        (request) =>
          request.method === "POST"
            ? json({ upload: { id: 5, token: "t" } }, 201)
            : new Response(new Uint8Array([1])),
        { access },
      );
      const upload = await settle(
        rm.attachments.upload({ file: new Uint8Array([1]), filename: "a.bin" }),
      );
      await rm.attachments.download({ id: 5, filename: "a.bin" });

      if (allowed[access].includes("POST")) {
        expect(upload).toBeUndefined();
        expect(requests.map((r) => r.method)).toEqual(["POST", "GET"]);
      } else {
        expect(upload).toMatchObject({ data: { kind: "access_denied", access, method: "POST" } });
        expect(requests.map((r) => r.method)).toEqual(["GET"]);
      }
    });
  });

  test("a derived client keeps the access of its parent", async () => {
    const { rm, requests } = client(answer, { access: "read-only" });
    const error = await failure(rm.with({ timeoutMs: 1000 }).issues.remove({ issue_id: 1 }));

    expect(error.data).toEqual({ kind: "access_denied", access: "read-only", method: "DELETE" });
    expect(error.message).toContain("nothing was sent");
    expect(requests).toHaveLength(0);
  });
});

describe("rm.with", () => {
  test("a derived client gets the response fixes, such as journals oldest first", async () => {
    const { rm } = client(() => json({ issue: { ...issue, journals: journalsNewestFirst } }));
    const derived = await rm
      .with({ timeoutMs: 1000 })
      .issues.get({ issue_id: 42, include: ["journals"] });

    expect(derived.journals.map((entry: { id: number }) => entry.id)).toEqual([1, 2]);
  });

  test("a derived client carries its defaults and the original does not", async () => {
    const { rm, requests } = client(keyOf("admin", () => empty()));
    await rm.with({ as: "jsmith" }).issues.update({ issue_id: 1, notes: "n" });
    await rm.issues.update({ issue_id: 1, notes: "n" });

    const sent = exceptGuard(requests);
    expect(sent[0]?.headers.get("x-redmine-switch-user")).toBe("jsmith");
    expect(sent[1]?.headers.has("x-redmine-switch-user")).toBe(false);
  });

  test("per-call options beat the derived defaults, and derivations compose", async () => {
    const { rm, requests } = client(keyOf("admin", () => empty()));
    const derived = rm.with({ as: "a" }).with({ timeoutMs: 1000 });
    await derived.issues.update({ issue_id: 1 }, { as: "b" });
    await derived.issues.update({ issue_id: 1 });

    expect(exceptGuard(requests).map((r) => r.headers.get("x-redmine-switch-user"))).toEqual([
      "b",
      "a",
    ]);
  });

  test("the original and every derived client share one admin check", async () => {
    const { rm, requests } = client(keyOf("admin", () => empty()));
    await Promise.all([
      rm.with({ as: "a" }).issues.update({ issue_id: 1 }),
      rm.with({ as: "b" }).with({ timeoutMs: 1000 }).issues.update({ issue_id: 2 }),
      rm.issues.update({ issue_id: 3 }, { as: "c" }),
    ]);

    expect(requests.filter(isGuardCheck)).toHaveLength(1);
    expect(exceptGuard(requests)).toHaveLength(3);
  });

  test("a derived client on a non-admin key is refused, and the original still works", async () => {
    const { rm, requests } = client(keyOf("member", () => empty()));
    const error = await failure(rm.with({ as: "jsmith" }).issues.update({ issue_id: 1 }));
    await rm.issues.update({ issue_id: 1, notes: "as myself" });

    expect(error.data).toEqual({
      kind: "switch_user_rejected",
      login: "jsmith",
      reason: "not_admin",
    });
    expect(exceptGuard(requests)).toHaveLength(1);
    expect(exceptGuard(requests)[0]?.headers.has("x-redmine-switch-user")).toBe(false);
  });

  test("derived clients share the original's concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const { rm } = client(
      keyOf("admin", async () => {
        peak = Math.max(peak, ++inFlight);
        await sleep(5);
        inFlight--;
        return json({ issue });
      }),
      { maxConcurrent: 1 },
    );
    const jsmith = rm.with({ as: "jsmith" });
    await Promise.all([
      rm.issues.get({ issue_id: 1 }),
      jsmith.issues.get({ issue_id: 2 }),
      rm.with({ as: "x" }).issues.get({ issue_id: 3 }),
    ]);

    expect(peak).toBe(1);
  });
});

describe("rm.request", () => {
  test("gets the response fixes of typed calls, such as journals oldest first", async () => {
    const { rm } = client(() => json({ issue: { ...issue, journals: journalsNewestFirst } }));
    const raw = await rm.request({
      method: "GET",
      path: "issues/42.json",
      query: { include: "journals" },
    });

    expect(raw.issue.journals.map((entry: { id: number }) => entry.id)).toEqual([1, 2]);
  });

  test("reaches a plugin path under the subpath with auth, query and parsed JSON", async () => {
    const { rm, requests } = client(() => json({ boards: [{ id: 1 }] }));
    const result = await rm.request({
      method: "GET",
      path: "agile_boards.json",
      query: { project_id: 3, ids: [1, 2], archived: false },
    });

    expect(result).toEqual({ boards: [{ id: 1 }] });
    const [request] = requests;
    expect(request?.url.pathname).toBe("/redmine/agile_boards.json");
    expect(request?.url.searchParams.get("project_id")).toBe("3");
    expect(request?.url.searchParams.getAll("ids[]")).toEqual(["1", "2"]);
    expect(request?.url.searchParams.get("archived")).toBe("false");
    expect(request?.headers.get("x-redmine-api-key")).toBe("secret-key");
  });

  test("sends a query parameter named `where` as a plain parameter, not as filters", async () => {
    const { rm, requests } = client(() => json({ results: [] }));
    await rm.request({ method: "GET", path: "plugin/search.json", query: { where: "title" } });

    expect(requests[0]?.url.searchParams.get("where")).toBe("title");
  });

  test("sends a JSON body as given and decodes an empty reply to undefined", async () => {
    const { rm, requests } = client(() => empty());
    const result = await rm.request({
      method: "POST",
      path: "plugin/cards.json",
      body: { card: { title: "x" } },
    });

    expect(result).toBeUndefined();
    expect(requests[0]?.json()).toEqual({ card: { title: "x" } });
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
  });

  test("shares the pipeline: errors, retries and impersonation defaults", async () => {
    const { rm, requests } = client(
      keyOf("admin", sequence(empty(503), json({ errors: ["No"] }, 422))),
    );
    const error = await failure(
      rm.with({ as: "jsmith" }).request({ method: "GET", path: "x.json" }),
    );

    expect(error.data).toEqual({ kind: "validation", status: 422, messages: ["No"] });
    expect(exceptGuard(requests)).toHaveLength(2);
    expect(exceptGuard(requests)[0]?.headers.get("x-redmine-switch-user")).toBe("jsmith");
  });

  test("onResponse gets the status of each response of this call, retries included", async () => {
    const { rm } = client(sequence(empty(503), json({ id: 7 }, 201)));
    const statuses: number[] = [];
    const result = await rm.request(
      { method: "GET", path: "x.json" },
      { onResponse: ({ status }: { status: number }) => statuses.push(status) },
    );

    expect(result).toEqual({ id: 7 });
    expect(statuses).toEqual([503, 201]);
  });

  test("an onResponse that throws does not fail the call", async () => {
    const { rm } = client(() => json({ id: 7 }, 202));
    const result = await rm.request(
      { method: "GET", path: "x.json" },
      {
        onResponse: () => {
          throw new Error("observer");
        },
      },
    );

    expect(result).toEqual({ id: 7 });
  });

  test("a non-JSON reply is protocol/non_json", async () => {
    const { rm } = client(() => html("<html></html>"));

    expect((await failure(rm.request({ method: "GET", path: "x.json" }))).data).toMatchObject({
      kind: "protocol",
      reason: "non_json",
    });
  });

  test.each([
    ["a leading slash that would drop the subpath", { method: "GET", path: "/agile_boards.json" }],
    [
      "an absolute URL that would leak the key to another host",
      { method: "GET", path: "https://evil.example/x.json" },
    ],
    ["a protocol-relative URL", { method: "GET", path: "//evil.example/x.json" }],
    ["a path climbing out of the subpath", { method: "GET", path: "../other/x.json" }],
    ["a body on GET", { method: "GET", path: "x.json", body: { a: 1 } }],
    ["a body on GET even when it is null", { method: "GET", path: "x.json", body: null }],
    ["an unknown arrayFormat", { method: "GET", path: "x.json", arrayFormat: "semicolon" }],
  ])("refuses %s before any request", async (_name, raw) => {
    const { rm, requests } = client(() => json({}));

    expect((await failure(rm.request(raw))).kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });
});

describe("rm.request bodies", () => {
  test.each([
    ["an object", { card: { title: "x", done: false } }],
    ["an array", [{ id: 1 }, { id: 2 }]],
    ["an empty array", []],
    ["a string", "plain text"],
    ["an empty string", ""],
    ["a number", 0],
    ["true", true],
    ["false", false],
    ["null", null],
  ])("%s goes out verbatim as JSON on POST, PUT and PATCH", async (_name, body) => {
    const { rm, requests } = client(() => empty());
    for (const method of ["POST", "PUT", "PATCH"] as const) {
      await rm.request({ method, path: "plugin/x.json", body });
    }

    expect(requests.map((r) => r.method)).toEqual(["POST", "PUT", "PATCH"]);
    for (const request of requests) {
      expect(request.text()).toBe(JSON.stringify(body));
      expect(request.headers.get("content-type")).toBe("application/json");
    }
  });

  test("no body sends no Content-Type, and an explicit undefined is the same", async () => {
    const { rm, requests } = client(() => empty());
    await rm.request({ method: "POST", path: "plugin/x.json" });
    await rm.request({ method: "POST", path: "plugin/x.json", body: undefined });

    for (const request of requests) {
      expect(request.bytes).toHaveLength(0);
      expect(request.headers.has("content-type")).toBe(false);
    }
  });

  test.each([
    ["a function", () => 1],
    ["a symbol", Symbol("s")],
    ["a bigint", 1n],
    ["NaN", Number.NaN],
    ["an object holding a function", { run: () => 1 }],
  ])("refuses %s as a body before any request", async (_name, body) => {
    const { rm, requests } = client(() => empty());
    const error = await failure(rm.request({ method: "POST", path: "x.json", body }));

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });

  test("a body and a query may use the same key: they are separate places on the wire", async () => {
    const { rm, requests } = client(() => empty());
    await rm.request({ method: "PUT", path: "x.json", query: { id: 1 }, body: { id: 2 } });

    expect(requests[0]?.url.searchParams.get("id")).toBe("1");
    expect(requests[0]?.json()).toEqual({ id: 2 });
  });

  test("a query parameter named body does not collide with the body", async () => {
    const { rm, requests } = client(() => empty());
    await rm.request({ method: "POST", path: "x.json", query: { body: "q" }, body: [1] });

    expect(requests[0]?.url.searchParams.get("body")).toBe("q");
    expect(requests[0]?.json()).toEqual([1]);
  });

  test("a raw body that carries lock_version turns an empty 422 into a conflict", async () => {
    const { rm } = client(() => json({ errors: [] }, 422));
    const stale = await failure(
      rm.request({ method: "PUT", path: "issues/1.json", body: { issue: { lock_version: 0 } } }),
    );
    const plain = await failure(
      rm.request({ method: "PUT", path: "issues/1.json", body: { issue: { subject: "x" } } }),
    );

    expect(stale.data).toEqual({ kind: "conflict", status: 422 });
    expect(plain.data).toEqual({ kind: "validation", status: 422, messages: [] });
  });
});

describe("rm.request array query formats", () => {
  const wire = async (
    arrayFormat: "brackets" | "comma" | "repeat" | undefined,
    query: Record<string, string | number | boolean | readonly (string | number)[]>,
  ): Promise<string> => {
    const { rm, requests } = client(() => json({}));
    await rm.request({
      method: "GET",
      path: "x.json",
      query,
      ...(arrayFormat === undefined ? {} : { arrayFormat }),
    });
    return decodeURIComponent(requests[0]?.url.search ?? "");
  };

  test.each([
    ["brackets", "?k[]=a&k[]=b"],
    ["comma", "?k=a,b"],
    ["repeat", "?k=a&k=b"],
  ] as const)("%s writes an array as %s", async (format, expected) => {
    expect(await wire(format, { k: ["a", "b"] })).toBe(expected);
  });

  test("brackets is the default", async () => {
    expect(await wire(undefined, { k: ["a", "b"] })).toBe("?k[]=a&k[]=b");
  });

  test.each(["brackets", "comma", "repeat"] as const)(
    "%s leaves scalars alone, joins numbers and omits an empty array",
    async (format) => {
      const query = { n: [1, 2], one: ["x"], s: "v", b: true, none: [] };
      const text = await wire(format, query);

      expect(text).toContain("s=v&b=true");
      expect(text).not.toContain("none");
      expect(text).toContain(
        { brackets: "n[]=1&n[]=2&one[]=x", comma: "n=1,2&one=x", repeat: "n=1&n=2&one=x" }[format],
      );
    },
  );

  test("the path guard still holds with an array format", async () => {
    const { rm, requests } = client(() => json({}));
    const error = await failure(
      rm.request({ method: "GET", path: "/x.json", query: { k: ["a"] }, arrayFormat: "comma" }),
    );

    expect(error.kind).toBe("invalid_input");
    expect(requests).toHaveLength(0);
  });
});

describe("issues.transition", () => {
  const issueWith = (status: number, allowed: number[]): Response =>
    json({
      issue: { id: 42, status: { id: status }, allowed_statuses: allowed.map((id) => ({ id })) },
    });

  test("reads the allowed statuses, then updates with the status and notes", async () => {
    const { rm, requests } = client((request) =>
      request.method === "GET" ? issueWith(1, [1, 2, 3]) : empty(),
    );
    await rm.issues.transition({ issue_id: 42, status_id: 3, notes: "done" });

    expect(requests.map((r) => r.method)).toEqual(["GET", "PUT"]);
    expect(requests[0]?.url.searchParams.get("include")).toBe("allowed_statuses");
    expect(requests[1]?.json()).toEqual({ issue: { status_id: 3, notes: "done" } });
  });

  test("refuses a status outside the allowed set locally, listing the allowed ids", async () => {
    const { rm, requests } = client(() => issueWith(1, [1, 2, 3]));
    const error = await failure(rm.issues.transition({ issue_id: 42, status_id: 9 }));

    expect(error.data).toEqual({ kind: "transition_not_allowed", wanted: 9, allowed: [1, 2, 3] });
    expect(requests.map((r) => r.method)).toEqual(["GET"]);
  });

  test("sends nothing when the issue is already there and there are no notes", async () => {
    const { rm, requests } = client(() => issueWith(3, [1, 2, 3]));
    await rm.issues.transition({ issue_id: 42, status_id: 3 });

    expect(requests.map((r) => r.method)).toEqual(["GET"]);
  });

  test("still posts the notes when the issue is already in the target status", async () => {
    const { rm, requests } = client((request) =>
      request.method === "GET" ? issueWith(3, [1, 2]) : empty(),
    );
    await rm.issues.transition({ issue_id: 42, status_id: 3, notes: "ack" });

    expect(requests[1]?.json()).toEqual({ issue: { status_id: 3, notes: "ack" } });
  });

  test("applies the derived client's impersonation to both requests", async () => {
    const { rm, requests } = client(
      keyOf("admin", (request) => (request.method === "GET" ? issueWith(1, [2]) : empty())),
    );
    await rm.with({ as: "jsmith" }).issues.transition({ issue_id: 42, status_id: 2 });

    expect(exceptGuard(requests).map((r) => r.headers.get("x-redmine-switch-user"))).toEqual([
      "jsmith",
      "jsmith",
    ]);
  });
});

describe("attachments", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);

  test("upload sends application/octet-stream with filename and content_type as query params", async () => {
    const { rm, requests } = client(() => json({ upload: { id: 5, token: "5.abc" } }, 201));
    const ref = await rm.attachments.upload({
      file: bytes,
      filename: "trace file.zip",
      content_type: "application/zip",
      description: "crash",
    });

    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.url.pathname).toBe("/redmine/uploads.json");
    expect(request?.url.searchParams.get("filename")).toBe("trace file.zip");
    expect(request?.url.searchParams.get("content_type")).toBe("application/zip");
    expect(request?.headers.get("content-type")).toBe("application/octet-stream");
    expect([...(request?.bytes ?? [])]).toEqual([1, 2, 3, 4]);
    expect(ref).toEqual({
      token: "5.abc",
      filename: "trace file.zip",
      content_type: "application/zip",
      description: "crash",
    });
  });

  test("upload leaves content_type out when it was not given", async () => {
    const { rm, requests } = client(() => json({ upload: { id: 5, token: "t" } }, 201));
    const ref = await rm.attachments.upload({ file: new Blob([bytes]), filename: "a.bin" });

    expect(requests[0]?.url.searchParams.has("content_type")).toBe(false);
    expect([...(requests[0]?.bytes ?? [])]).toEqual([1, 2, 3, 4]);
    expect(ref).toEqual({ token: "t", filename: "a.bin" });
  });

  test("upload sends a stream once and does not retry it", async () => {
    const { rm, requests } = client(() => empty(503));
    const file = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    await failure(rm.attachments.upload({ file, filename: "a.bin" }));

    expect(requests).toHaveLength(1);
    expect([...(requests[0]?.bytes ?? [])]).toEqual([1, 2, 3, 4]);
  });

  test("an over-limit upload is a validation error", async () => {
    const { rm } = client(() => json({ errors: ["File is too large"] }, 422));
    const error = await failure(rm.attachments.upload({ file: bytes, filename: "big" }));

    expect(error.data).toMatchObject({ kind: "validation", messages: ["File is too large"] });
  });

  test("a response without a token is protocol/bad_json", async () => {
    const { rm } = client(() => json({ upload: {} }, 201));

    expect(
      (await failure(rm.attachments.upload({ file: bytes, filename: "a" }))).data,
    ).toMatchObject({
      kind: "protocol",
      reason: "bad_json",
    });
  });

  test("download builds the URL from baseUrl and ignores content_url", async () => {
    const { rm, requests } = client(
      () =>
        new Response(bytes, {
          headers: { "content-type": "application/zip", "content-length": "4" },
        }),
    );
    const attachment = {
      id: 7,
      filename: "my report.zip",
      content_url: "https://evil.example/attachments/download/7/my%20report.zip",
    };
    const file = await rm.attachments.download(attachment);

    expect(requests[0]?.url.href).toBe(`${BASE_URL}/attachments/download/7/my%20report.zip`);
    expect(requests[0]?.headers.get("x-redmine-api-key")).toBe("secret-key");
    expect(requests[0]?.headers.get("accept")).toBe("*/*");
    expect(file).toMatchObject({
      filename: "my report.zip",
      content_type: "application/zip",
      size: 4,
    });
    expect([...(await file.bytes())]).toEqual([1, 2, 3, 4]);
  });

  test("download streams the body", async () => {
    const { rm } = client(() => new Response(bytes));
    const file = await rm.attachments.download({ id: 1, filename: "a.bin" });
    const chunks: number[] = [];
    for await (const chunk of file.body) chunks.push(...chunk);

    expect(chunks).toEqual([1, 2, 3, 4]);
  });

  test("a missing attachment is not_found even though Redmine answers with HTML", async () => {
    const { rm } = client(() => html("<html>404</html>", 404));

    expect((await failure(rm.attachments.download({ id: 1, filename: "a" }))).kind).toBe(
      "not_found",
    );
  });

  test("thumbnail asks for the size only when given", async () => {
    const { rm, requests } = client(
      () => new Response(bytes, { headers: { "content-type": "image/png" } }),
    );
    await rm.attachments.thumbnail({ id: 9, size: 100 });
    await rm.attachments.thumbnail({ id: 9 });

    expect(requests[0]?.url.href).toBe(`${BASE_URL}/attachments/thumbnail/9?size=100`);
    expect(requests[1]?.url.href).toBe(`${BASE_URL}/attachments/thumbnail/9`);
  });

  /** A response whose body stream errors when the request's signal aborts, like a real fetch body. */
  function slowBody(request: { signal: AbortSignal }, afterMs: number): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const timer = setTimeout(() => {
            controller.enqueue(bytes);
            controller.close();
          }, afterMs);
          request.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            controller.error(request.signal.reason);
          });
        },
      }),
    );
  }

  test("the timeout covers the request until headers arrive, not the body", async () => {
    const { rm } = client((request) => slowBody(request, 60), { timeoutMs: 20 });
    const file = await rm.attachments.download({ id: 1, filename: "a.bin" });

    expect([...(await file.bytes())]).toEqual([1, 2, 3, 4]);
  });

  test("the caller's signal still cancels the body stream after headers", async () => {
    const controller = new AbortController();
    const { rm } = client((request) => slowBody(request, 500));
    const file = await rm.attachments.download(
      { id: 1, filename: "a.bin" },
      { signal: controller.signal },
    );
    const reading = file.bytes().then(
      () => "finished",
      () => "cancelled",
    );
    controller.abort();

    expect(await reading).toBe("cancelled");
  });

  test("the concurrency slot is free once headers arrive", async () => {
    const { rm, requests } = client(
      (request) =>
        request.url.pathname.includes("download") ? slowBody(request, 10_000) : json({ issue }),
      { maxConcurrent: 1 },
    );
    const controller = new AbortController();
    const file = await rm.attachments.download(
      { id: 1, filename: "a" },
      { signal: controller.signal },
    );
    await rm.issues.get({ issue_id: 1 });

    expect(requests).toHaveLength(2);
    controller.abort();
    await file.bytes().catch(() => undefined);
  });

  test("a download that never answers times out", async () => {
    const { rm } = client(hang, { timeoutMs: 15, retry: false });

    expect((await failure(rm.attachments.download({ id: 1, filename: "a" }))).data).toEqual({
      kind: "timeout",
      after_ms: 15,
    });
  });
});
