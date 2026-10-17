import { expect, it } from "vite-plus/test";
import { createRedmine, RedmineError } from "../../src/index.ts";
import { clientFor, describeServers, recorder } from "./helpers.ts";

describeServers("errors and the raw escape hatch", (server) => {
  const admin = clientFor(server);

  it("a wrong API key is unauthorized", async () => {
    const bad = createRedmine({
      baseUrl: server.baseUrl,
      version: server.version,
      auth: { apiKey: "0".repeat(40) },
      retry: false,
    });

    const error = await bad.users.current().catch((e: unknown) => e);

    expect(RedmineError.is(error, "unauthorized")).toBe(true);
    expect((error as RedmineError).data).toMatchObject({ status: 401 });
  });

  it("a missing key on an authenticated endpoint is unauthorized", async () => {
    const error = await clientFor(server, "anonymous")
      .users.current()
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "unauthorized")).toBe(true);
  });

  it("HTTP Basic credentials authenticate, and a wrong password is unauthorized", async () => {
    const basic = (password: string) =>
      createRedmine({
        baseUrl: server.baseUrl,
        version: server.version,
        auth: { basic: { login: "jsmith", password } },
        retry: false,
      });

    expect((await basic("sdk-user-pass-1").users.current()).login).toBe("jsmith");
    const error = await basic("wrong")
      .users.current()
      .catch((e: unknown) => e);
    expect(RedmineError.is(error, "unauthorized")).toBe(true);
  });

  it("a 1 ms timeout is kind timeout and a pre-aborted signal is kind aborted, both before any answer", async () => {
    const slow = clientFor(server, "admin", { timeoutMs: 1, retry: false });
    const controller = new AbortController();
    controller.abort();

    const timedOut = await slow.users.current().catch((e: unknown) => e);
    const aborted = await admin.users
      .current({}, { signal: controller.signal })
      .catch((e: unknown) => e);

    expect(RedmineError.is(timedOut, "timeout")).toBe(true);
    expect(RedmineError.is(aborted, "aborted")).toBe(true);
  });

  it("a refused connection is kind network", async () => {
    const dead = createRedmine({ baseUrl: "http://127.0.0.1:1", retry: false });

    const error = await dead.users.current().catch((e: unknown) => e);

    expect(RedmineError.is(error, "network")).toBe(true);
  });

  it("a rejected create is validation with non-empty localized messages", async () => {
    const error = await admin.issues
      .create({ project_id: server.projectIdentifier, subject: "" })
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "validation")).toBe(true);
    const { data } = error as RedmineError<{
      kind: "validation";
      status: 422;
      messages: readonly string[];
    }>;
    expect(data.status).toBe(422);
    expect(data.messages.length).toBeGreaterThan(0);
    expect(data.messages.every((m) => typeof m === "string" && m.length > 0)).toBe(true);
  });

  it("an update that violates validation leaves the issue unchanged", async () => {
    const issue = await admin.issues.create({
      project_id: server.projectIdentifier,
      subject: "keep me",
    });
    try {
      const error = await admin.issues
        .update({ issue_id: issue.id, subject: "" })
        .catch((e: unknown) => e);

      expect(RedmineError.is(error, "validation")).toBe(true);
      expect((await admin.issues.get({ issue_id: issue.id })).subject).toBe("keep me");
    } finally {
      await admin.issues.delete({ issue_id: issue.id });
    }
  });

  it("a missing issue is not_found", async () => {
    const error = await admin.issues.get({ issue_id: 2_000_000_000 }).catch((e: unknown) => e);

    expect(RedmineError.is(error, "not_found")).toBe(true);
    expect((error as RedmineError).data).toMatchObject({ status: 404 });
  });

  it("a non-admin key creating a user is forbidden", async () => {
    const error = await clientFor(server, "user")
      .users.create({ login: "x", firstname: "x", lastname: "x", mail: "x@example.net" })
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "forbidden")).toBe(true);
  });

  it("an error event carries no API key", async () => {
    const seen = recorder();
    const client = clientFor(server, "admin", { onEvent: seen.onEvent });

    await client.issues.get({ issue_id: 2_000_000_000 }).catch(() => undefined);

    expect(seen.events.map((e) => e.type)).toEqual(["request", "response", "error"]);
    expect(JSON.stringify(seen.events)).not.toContain(server.adminKey);
  });

  it("rm.request GET of issue_statuses.json returns the parsed body", async () => {
    const body = (await admin.request({ method: "GET", path: "issue_statuses.json" })) as {
      issue_statuses: Array<{ id: number; name: string; is_closed: boolean }>;
    };

    expect(body.issue_statuses.length).toBeGreaterThanOrEqual(6);
    expect(body.issue_statuses[0]).toMatchObject({
      id: expect.any(Number),
      name: expect.any(String),
    });
    expect(body.issue_statuses.some((s) => s.is_closed)).toBe(true);
    const typed = await admin.issueStatuses.list().all();
    expect(typed.map((s) => s.id)).toEqual(body.issue_statuses.map((s) => s.id));
  });

  it("rm.request sends a query and a JSON body like a typed call", async () => {
    const created = (await admin.request({
      method: "POST",
      path: "issues.json",
      body: { issue: { project_id: server.projectIdentifier, subject: "raw create" } },
    })) as { issue: { id: number } };
    try {
      const page = (await admin.request({
        method: "GET",
        path: "issues.json",
        query: { issue_id: created.issue.id, limit: 1 },
      })) as { issues: Array<{ id: number }>; total_count: number };

      expect(page.issues.map((i) => i.id)).toEqual([created.issue.id]);
      expect(page.total_count).toBe(1);
    } finally {
      await admin.request({ method: "DELETE", path: `issues/${created.issue.id}.json` });
    }
  });
});
