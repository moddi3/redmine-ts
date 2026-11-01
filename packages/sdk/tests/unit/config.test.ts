import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { resolveConfig } from "../../src/core/config.ts";
import { createEngine } from "../../src/core/engine.ts";
import { RedmineError } from "../../src/core/errors.ts";
import { json } from "./fixtures/fake-fetch.ts";
import * as ops from "./fixtures/registry.ts";

afterEach(() => vi.unstubAllGlobals());

function refusal(config: Parameters<typeof resolveConfig>[0]): RedmineError {
  try {
    resolveConfig(config);
  } catch (error) {
    if (error instanceof RedmineError) return error;
    throw error;
  }
  throw new Error("expected resolveConfig to throw");
}

describe("baseUrl", () => {
  test.each([
    ["https://h.example/redmine", "https://h.example/redmine/"],
    ["https://h.example/redmine/", "https://h.example/redmine/"],
    ["https://h.example", "https://h.example/"],
    ["http://localhost:3000/", "http://localhost:3000/"],
    [new URL("https://h.example/a/b"), "https://h.example/a/b/"],
  ])("%s resolves to %s", (baseUrl, expected) => {
    expect(resolveConfig({ baseUrl }).base.href).toBe(expected);
  });

  test("userinfo is refused without echoing the password", () => {
    const error = refusal({ baseUrl: "https://admin:hunter2@h.example/" });

    expect(error.kind).toBe("invalid_input");
    expect(error.message).not.toContain("hunter2");
  });

  test.each(["ftp://h.example/", "file:///etc/passwd", "not a url", "//h.example/"])(
    "%s is refused",
    (baseUrl) => {
      expect(refusal({ baseUrl }).kind).toBe("invalid_input");
    },
  );
});

describe("options", () => {
  test("an undeclared version stays undefined and a known one is kept", () => {
    expect(resolveConfig({ baseUrl: "https://h.example" }).version).toBeUndefined();
    expect(resolveConfig({ baseUrl: "https://h.example", version: "6.1" }).version).toBe("6.1");
  });

  test.each([
    ["an unsupported version", { version: "5.1" as never }],
    ["a zero timeout", { timeoutMs: 0 }],
    ["a timeout a timer cannot hold", { timeoutMs: 2 ** 31 }],
    ["a fractional concurrency", { maxConcurrent: 1.5 }],
    ["zero concurrency", { maxConcurrent: 0 }],
    ["a negative retry count", { retry: { attempts: -1 } }],
    ["an empty api key", { auth: { apiKey: "" } }],
    ["an unknown access mode", { access: "write-only" as never }],
    ["a basic login with a colon", { auth: { basic: { login: "a:b", password: "x" } } }],
  ])("refuses %s", (_name, options) => {
    expect(refusal({ baseUrl: "https://h.example", ...options }).kind).toBe("invalid_input");
  });

  test("the longest timeout a timer holds is kept", () => {
    expect(resolveConfig({ baseUrl: "https://h.example", timeoutMs: 2 ** 31 - 1 }).timeoutMs).toBe(
      2 ** 31 - 1,
    );
  });

  test("defaults", () => {
    const config = resolveConfig({ baseUrl: "https://h.example" });

    expect(config).toMatchObject({
      timeoutMs: 30_000,
      maxConcurrent: 4,
      retry: { attempts: 2, baseMs: 250, maxMs: 5000 },
      normalize: true,
      access: "full",
    });
    expect(resolveConfig({ baseUrl: "https://h.example", retry: false }).retry).toBeNull();
    expect(resolveConfig({ baseUrl: "https://h.example", retry: { attempts: 5 } }).retry).toEqual({
      attempts: 5,
      baseMs: 250,
      maxMs: 5000,
    });
  });

  test("the default fetch is the current global one, called as a function", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", function (this: unknown, input: string) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      seen.push(input);
      return Promise.resolve(json({ issue: { id: 1 } }));
    });
    const engine = createEngine(resolveConfig({ baseUrl: "https://h.example/redmine" }));
    const call: Promise<unknown> = engine.call(ops.getIssue, { issue_id: 1 });
    await call;

    expect(seen).toEqual(["https://h.example/redmine/issues/1.json"]);
  });
});
