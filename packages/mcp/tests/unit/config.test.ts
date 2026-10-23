import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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

  it("reads REDMINE_MCP_FILES_DIR as an absolute directory", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "redmine-mcp-config-")));
    expect(parseCli([], { ...env, REDMINE_MCP_FILES_DIR: dir })).toMatchObject({
      kind: "serve",
      filesDir: dir,
    });
    expect(
      parseCli([], { ...env, REDMINE_MCP_FILES_DIR: relative(process.cwd(), dir) }),
    ).toMatchObject({
      filesDir: dir,
    });
    expect(parseCli([], { ...env, REDMINE_MCP_FILES_DIR: " " })).not.toHaveProperty("filesDir");
  });

  it.each(["missing", "file"])("refuses a REDMINE_MCP_FILES_DIR that is a %s", (what) => {
    const dir = mkdtempSync(join(tmpdir(), "redmine-mcp-config-"));
    const path = join(dir, what);
    if (what === "file") writeFileSync(path, "");
    const command = parseCli([], { ...env, REDMINE_MCP_FILES_DIR: path });
    expect(command).toEqual({
      kind: "error",
      message: "REDMINE_MCP_FILES_DIR must be an existing directory",
    });
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

describe("parseCli --http", () => {
  const url = { REDMINE_URL: "https://tracker.example.com/redmine" };
  const LOCAL = ["localhost", "127.0.0.1", "[::1]"];

  it("serves loopback on 3737 with Host checks and no Origin allowed, without REDMINE_API_KEY", () => {
    expect(parseCli(["--http"], url)).toEqual({
      kind: "http",
      host: "127.0.0.1",
      port: 3737,
      options: {
        baseUrl: "https://tracker.example.com/redmine",
        access: "full",
        allowedOrigins: [],
        allowedHosts: [...LOCAL, "127.0.0.1"],
      },
      warnings: [],
    });
  });

  it("warns about REDMINE_API_KEY and keeps it out of the command", () => {
    const command = parseCli(["--http"], env);
    expect(command).toMatchObject({
      kind: "http",
      warnings: [
        "REDMINE_API_KEY is ignored over HTTP; each request sends its own key in X-Redmine-API-Key",
      ],
    });
    expect(JSON.stringify(command)).not.toContain(KEY);
    expect(parseCli(["--http"], { ...url, REDMINE_API_KEY: " " })).toMatchObject({ warnings: [] });
  });

  it("warns about REDMINE_MCP_FILES_DIR instead of reading it, even when it is not a directory", () => {
    const command = parseCli(["--http"], { ...url, REDMINE_MCP_FILES_DIR: "/no/such/dir" });
    expect(command).toMatchObject({
      kind: "http",
      warnings: [
        "REDMINE_MCP_FILES_DIR is ignored over HTTP; clients over HTTP cannot use the server's local files",
      ],
    });
  });

  it.each([
    [["--host", "0.0.0.0"], "0.0.0.0", undefined],
    [["--host", "::1"], "::1", [...LOCAL, "[::1]"]],
    [["--host", "127.0.0.2"], "127.0.0.2", [...LOCAL, "127.0.0.2"]],
    [["--host", "localhost"], "localhost", [...LOCAL, "localhost"]],
  ] as const)("checks Host for %j only on loopback", (argv, host, allowedHosts) => {
    const command = parseCli(["--http", ...argv], url);
    expect(command).toMatchObject({ kind: "http", host });
    expect(command.kind === "http" && command.options.allowedHosts).toEqual(allowedHosts);
  });

  it.each([
    ["0", 0],
    ["8080", 8080],
    ["65535", 65535],
  ])("takes --port %s", (port, expected) => {
    expect(parseCli(["--http", "--port", port], url)).toMatchObject({ port: expected });
  });

  it("collects repeated --allow-origin hostnames and origins and applies the strictest access", () => {
    const argv = [
      "--http",
      "--allow-origin",
      "app.example.com",
      "--allow-origin",
      "[::1]",
      "--allow-origin",
      "https://inspector.example.com:6274",
    ];
    const command = parseCli([...argv, "--no-delete"], { ...url, REDMINE_VERSION: "6.1" });
    expect(command).toMatchObject({
      kind: "http",
      options: {
        allowedOrigins: ["app.example.com", "[::1]", "https://inspector.example.com:6274"],
        access: "no-delete",
        version: "6.1",
      },
    });
  });

  it.each([
    [["--port", "65536"], "--port must be a port from 0 to 65535"],
    [["--port=-1"], "--port must be a port"],
    [["--port", "http"], "--port must be a port"],
    [["--host", " "], "--host is empty"],
    [["--allow-origin", "https://app.example.com/app"], "--allow-origin takes a hostname"],
    [["--allow-origin", "https://app.example.com/"], "--allow-origin takes a hostname"],
    [["--allow-origin", "https://App.Example.com"], "--allow-origin takes a hostname"],
    [["--allow-origin", "ftp://app.example.com"], "--allow-origin takes a hostname"],
    [["--allow-origin", "app.example.com:8443"], "--allow-origin takes a hostname"],
    [["--allow-origin", "App.Example.com"], "--allow-origin takes a hostname"],
  ])("explains a bad flag %j", (argv, message) => {
    const command = parseCli(["--http", ...argv], url);
    expect(command.kind === "error" && command.message).toContain(message);
  });

  it("still needs REDMINE_URL, and refuses HTTP flags without --http", () => {
    expect(parseCli(["--http"], {})).toMatchObject({
      kind: "error",
      message: expect.stringContaining("REDMINE_URL"),
    });
    expect(parseCli(["--host", "::"], env)).toEqual({
      kind: "error",
      message: "--host needs --http",
    });
    expect(parseCli(["--port", "80", "--allow-origin", "a.example"], env)).toEqual({
      kind: "error",
      message: "--port, --allow-origin need --http",
    });
  });
});
