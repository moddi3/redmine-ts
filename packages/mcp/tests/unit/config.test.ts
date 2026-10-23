import { describe, expect, it } from "vite-plus/test";
import { parseCli } from "../../src/config.ts";

const KEY = "0d1e2a3d4b5e6e7f8a9b0c1d2e3f4a5b6c7d8e9f";
const env = { REDMINE_URL: "https://tracker.example.com/redmine", REDMINE_API_KEY: KEY };

describe("parseCli", () => {
  it("builds the client config from the environment, full access by default", () => {
    expect(parseCli([], env)).toEqual({
      kind: "serve",
      config: {
        baseUrl: "https://tracker.example.com/redmine",
        auth: { apiKey: KEY },
        access: "full",
      },
    });
  });

  it("reads REDMINE_VERSION as a supported x.y", () => {
    expect(parseCli([], { ...env, REDMINE_VERSION: "6.1.3" })).toMatchObject({
      config: { version: "6.1" },
    });
  });

  it.each([
    [[], "no-delete", "no-delete"],
    [["--no-delete"], undefined, "no-delete"],
    [["--read-only"], undefined, "read-only"],
    [["--no-delete"], "read-only", "read-only"],
    [["--read-only"], "no-delete", "read-only"],
    [["--read-only", "--no-delete"], "full", "read-only"],
    [[], "", "full"],
  ] as const)(
    "picks the strictest of flags %j and REDMINE_MCP_ACCESS=%s",
    (argv, access, expected) => {
      const command = parseCli(argv, { ...env, REDMINE_MCP_ACCESS: access });
      expect(command).toMatchObject({ kind: "serve", config: { access: expected } });
    },
  );

  it.each([
    [{ REDMINE_URL: "tracker.example.com" }, "REDMINE_URL must be an http or https URL"],
    [{ REDMINE_URL: "ftp://tracker.example.com" }, "REDMINE_URL must be an http or https URL"],
    [{ REDMINE_API_KEY: undefined }, "REDMINE_API_KEY is required"],
    [{ REDMINE_API_KEY: "  " }, "REDMINE_API_KEY is empty"],
    [{ REDMINE_VERSION: "5.1" }, 'REDMINE_VERSION unsupported Redmine version "5.1"'],
    [
      { REDMINE_MCP_ACCESS: "readonly" },
      "REDMINE_MCP_ACCESS must be one of full, no-delete, read-only",
    ],
  ])("explains a bad setting %j", (override, message) => {
    const command = parseCli([], { ...env, ...override });
    expect(command.kind).toBe("error");
    expect(command.kind === "error" && command.message).toContain(message);
  });

  it("never echoes the API key", () => {
    const command = parseCli([], {
      REDMINE_URL: KEY,
      REDMINE_API_KEY: KEY,
      REDMINE_MCP_ACCESS: KEY,
    });
    expect(command.kind).toBe("error");
    expect(JSON.stringify(command)).not.toContain(KEY);
  });

  it("refuses an unknown flag and answers --help", () => {
    expect(parseCli(["--write"], env).kind).toBe("error");
    expect(parseCli(["--help"], {})).toEqual({ kind: "help" });
  });
});
