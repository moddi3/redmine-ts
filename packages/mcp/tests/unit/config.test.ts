import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { parseCli } from "../../src/config.ts";
import { publicFetch } from "../../src/node.ts";

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

describe("parseCli --http with OAuth", () => {
  const SECRET = "c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0LXNlY3JldA==";
  const oauth = {
    REDMINE_URL: "http://redmine:3000",
    REDMINE_MCP_PUBLIC_URL: "https://redmine.example.com/redmine/mcp",
    REDMINE_MCP_AUTH_SECRET: SECRET,
    REDMINE_OAUTH_CLIENT_ID: "app-id",
    REDMINE_OAUTH_CLIENT_SECRET: "app-secret",
  };

  it("builds the authorization server from the environment and checks Metadata URLs publicly", () => {
    const command = parseCli(["--http", "--allow-client", "claude.ai"], {
      ...oauth,
      REDMINE_PUBLIC_URL: "https://redmine.example.com/redmine",
      REDMINE_MCP_AUTH_PREVIOUS_SECRET: `old-${SECRET}`,
    });
    expect(command).toMatchObject({
      kind: "http",
      options: {
        baseUrl: "http://redmine:3000",
        publicUrl: "https://redmine.example.com/redmine/mcp",
        // A proxy that keeps the public Host still reaches a loopback listener.
        allowedHosts: ["localhost", "127.0.0.1", "[::1]", "127.0.0.1", "redmine.example.com"],
        oauth: {
          secret: SECRET,
          previousSecret: `old-${SECRET}`,
          redmineApp: { clientId: "app-id", clientSecret: "app-secret" },
          redminePublicUrl: "https://redmine.example.com/redmine",
          allowedClientHosts: ["claude.ai"],
          fetchClientMetadata: publicFetch,
          // One process, so its memory is a real store: single use and rotation hold.
          store: { consume: expect.any(Function), has: expect.any(Function) },
        },
      },
    });
  });

  it("takes --api-key-login instead of the Redmine application", () => {
    const { REDMINE_OAUTH_CLIENT_ID: _, REDMINE_OAUTH_CLIENT_SECRET: __, ...keys } = oauth;
    const command = parseCli(["--http", "--api-key-login"], keys);
    expect(command).toMatchObject({ kind: "http", options: { oauth: { apiKeyLogin: true } } });
    expect(command.kind === "http" && command.options.oauth).not.toHaveProperty("redmineApp");
  });

  it("serves a public URL's path without OAuth, unchanged otherwise", () => {
    const command = parseCli(["--http"], {
      REDMINE_URL: "http://redmine:3000",
      REDMINE_MCP_PUBLIC_URL: "http://example.com/mcp",
    });
    expect(command).toMatchObject({
      kind: "http",
      options: { publicUrl: "http://example.com/mcp" },
    });
    expect(command.kind === "http" && command.options).not.toHaveProperty("oauth");
  });

  it.each([
    [
      { REDMINE_MCP_AUTH_SECRET: "short" },
      [],
      "REDMINE_MCP_AUTH_SECRET must be at least 32 random characters",
    ],
    [
      { REDMINE_MCP_AUTH_SECRET: "redmine".repeat(6) },
      [],
      "REDMINE_MCP_AUTH_SECRET must be at least 32 random characters",
    ],
    [
      { REDMINE_MCP_PUBLIC_URL: "https://redmine.example.com/redmine/mcp/" },
      [],
      "REDMINE_MCP_PUBLIC_URL must be written as https://redmine.example.com/redmine/mcp",
    ],
    [
      { REDMINE_MCP_PUBLIC_URL: undefined },
      [],
      "REDMINE_MCP_AUTH_SECRET needs REDMINE_MCP_PUBLIC_URL",
    ],
    [
      { REDMINE_MCP_PUBLIC_URL: "http://redmine.example.com/mcp" },
      [],
      "REDMINE_MCP_PUBLIC_URL must be https for OAuth, except on localhost",
    ],
    [
      { REDMINE_MCP_PUBLIC_URL: "https://redmine.example.com/mcp#x" },
      [],
      "REDMINE_MCP_PUBLIC_URL must not carry a query, a fragment or credentials",
    ],
    [{ REDMINE_OAUTH_CLIENT_SECRET: " " }, [], "REDMINE_OAUTH_CLIENT_SECRET is required"],
    [{}, ["--api-key-login"], "--api-key-login replaces the Redmine application"],
    [{}, ["--allow-client", "https://claude.ai"], "--allow-client takes a hostname"],
    [
      { REDMINE_MCP_AUTH_SECRET: undefined },
      [],
      "REDMINE_OAUTH_CLIENT_ID needs REDMINE_MCP_AUTH_SECRET",
    ],
    [
      {
        REDMINE_MCP_AUTH_SECRET: undefined,
        REDMINE_OAUTH_CLIENT_ID: undefined,
        REDMINE_OAUTH_CLIENT_SECRET: undefined,
      },
      ["--api-key-login"],
      "--api-key-login needs REDMINE_MCP_AUTH_SECRET",
    ],
  ] as const)("explains %j %j", (override, argv, message) => {
    const command = parseCli(["--http", ...argv], { ...oauth, ...override });
    expect(command.kind === "error" && command.message).toContain(message);
    expect(JSON.stringify(command)).not.toMatch(/app-secret|c2VjcmV0/);
  });

  it("refuses the OAuth flags without --http", () => {
    expect(parseCli(["--api-key-login", "--allow-client", "claude.ai"], env)).toEqual({
      kind: "error",
      message: "--api-key-login, --allow-client need --http",
    });
  });
});
