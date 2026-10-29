import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type { OAuthClientProvider } from "@modelcontextprotocol/client";
import { expect, it } from "vite-plus/test";
import { createRedmineMcpHandler } from "../../src/index.ts";
import { publicFetch } from "../../src/node.ts";
import { describeServers } from "./servers.ts";
import type { ContractServer } from "./servers.ts";

/** What `node scripts/redmine-env.ts up` seeds: the OAuth application and jsmith's password. */
const REDMINE_APP = {
  clientId: "redmine-mcp-contract",
  clientSecret: "redmine-mcp-contract-secret",
};
const JSMITH = { username: "jsmith", password: "sdk-user-pass-1" };
/** The MCP client's loopback callback, which nothing listens on: the browser below stops there. */
const CLIENT_REDIRECT = "http://127.0.0.1:43210/callback";

const cli = fileURLToPath(new URL("../../dist/cli.mjs", import.meta.url));

type Serve = (request: Request) => Promise<Response>;

/** Browsers reach Redmine at 127.0.0.1 while the server keeps the configured localhost URL. */
const browserUrl = (server: ContractServer) => server.baseUrl.replace("localhost", "127.0.0.1");

/**
 * A browser with a cookie jar per origin. Requests for the MCP server's public origin go to `serve`,
 * the rest to the network; it answers our consent page, Redmine's login and Redmine's consent, and
 * stops at the client's redirect URI.
 */
function browser(publicOrigin: string, serve: Serve) {
  const jar = new Map<string, Map<string, string>>();
  const visited: string[] = [];
  async function send(url: URL, init: RequestInit = {}): Promise<Response> {
    visited.push(`${init.method ?? "GET"} ${url.origin}${url.pathname}`);
    const cookies = jar.get(url.origin) ?? new Map<string, string>();
    const headers = new Headers(init.headers);
    if (cookies.size > 0) {
      headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    const request = new Request(url, { ...init, headers, redirect: "manual" });
    const response = url.origin === publicOrigin ? await serve(request) : await fetch(request);
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair!.indexOf("=");
      cookies.set(pair!.slice(0, at), pair!.slice(at + 1));
      jar.set(url.origin, cookies);
    }
    return response;
  }
  const submit = (url: URL, fields: Record<string, string>) =>
    send(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
  return {
    visited,
    async signIn(start: URL): Promise<URL> {
      let url = start;
      let response = await send(url);
      for (let step = 0; step < 12; step++) {
        if (response.status >= 300 && response.status < 400) {
          url = new URL(response.headers.get("location")!, url);
          if (url.href.startsWith(CLIENT_REDIRECT)) return url;
          response = await send(url);
          continue;
        }
        const page = await response.text();
        const ours = form(page, (action) => action.endsWith("/mcp/oauth/authorize"));
        const login = form(page, (action) => action.endsWith("/login"));
        const consent = form(
          page,
          (action, fields) => action.endsWith("/oauth/authorize") && !("_method" in fields),
        );
        if (ours !== undefined) {
          response = await submit(new URL(ours.action, url), { ...ours.fields, decision: "allow" });
        } else if (login !== undefined) {
          response = await submit(new URL(login.action, url), { ...login.fields, ...JSMITH });
        } else if (consent !== undefined) {
          response = await submit(new URL(consent.action, url), consent.fields);
        } else {
          throw new Error(`stuck at ${url.href} (${response.status}): ${page.slice(0, 500)}`);
        }
      }
      throw new Error("too many steps");
    },
    /** Ends jsmith's Redmine session, as Redmine's own sign-out form does. */
    async signOut(redmine: string): Promise<void> {
      const page = await (await send(new URL("logout", `${redmine}/`))).text();
      const logout = form(page, (action) => action.endsWith("/logout"));
      if (logout !== undefined) await submit(new URL(logout.action, redmine), logout.fields);
    },
    /**
     * Signs jsmith in to Redmine and revokes every application on its authorized applications page,
     * as each row's Revoke link does: a DELETE that Rails reads from `_method`.
     */
    async revokeAll(redmine: string): Promise<number> {
      const login = form(await (await send(new URL("login", `${redmine}/`))).text(), (action) =>
        action.endsWith("/login"),
      );
      await submit(new URL(login!.action, redmine), { ...login!.fields, ...JSMITH });
      const page = await (
        await send(new URL("oauth/authorized_applications", `${redmine}/`))
      ).text();
      const token = /<meta name="csrf-token" content="([^"]+)"/.exec(page)![1]!;
      const links = [...page.matchAll(/href="([^"]*\/oauth\/authorized_applications\/\d+)"/g)];
      for (const [, href] of links) {
        const revoked = await submit(new URL(decode(href!), redmine), {
          _method: "delete",
          authenticity_token: decode(token),
        });
        expect(revoked.status, `revoking ${href}`).toBe(302);
      }
      await this.signOut(redmine);
      return links.length;
    },
  };
}

/** The first form whose action and hidden fields match, with its hidden fields. */
function form(
  page: string,
  matches: (action: string, fields: Record<string, string>) => boolean,
): { action: string; fields: Record<string, string> } | undefined {
  for (const [, attributes, body] of page.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/g)) {
    const action = decode(/action="([^"]*)"/.exec(attributes!)?.[1] ?? "");
    const fields: Record<string, string> = {};
    for (const [input] of body!.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = /name="([^"]*)"/.exec(input)?.[1];
      if (name !== undefined) fields[name] = decode(/value="([^"]*)"/.exec(input)?.[1] ?? "");
    }
    if (matches(action, fields)) return { action, fields };
  }
  return undefined;
}

function decode(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/**
 * The whole sign-in with the official MCP client: it registers itself, the browser signs jsmith in,
 * the client redeems the code, and a tool runs as jsmith. Then a refresh, and the old refresh token
 * dies once the new access token has been used, as Doorkeeper rotates it.
 */
async function signInAndUse(server: ContractServer, publicUrl: string, serve: Serve) {
  const toServer: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    return new URL(request.url).origin === new URL(publicUrl).origin
      ? serve(request)
      : fetch(request);
  };
  const store: {
    tokens?: { access_token: string; refresh_token?: string };
    client?: { client_id: string };
    verifier?: string;
    url?: URL;
  } = {};
  const provider: OAuthClientProvider = {
    redirectUrl: CLIENT_REDIRECT,
    clientMetadata: {
      client_name: "redmine-mcp contract",
      redirect_uris: ["http://127.0.0.1/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    clientInformation: () => store.client,
    saveClientInformation: (client) => void (store.client = client as never),
    tokens: () => store.tokens as never,
    saveTokens: (tokens) => void (store.tokens = tokens),
    redirectToAuthorization: (url) => void (store.url = url),
    saveCodeVerifier: (verifier) => void (store.verifier = verifier),
    codeVerifier: () => store.verifier!,
  };
  const transport = () =>
    new StreamableHTTPClientTransport(new URL(publicUrl), {
      authProvider: provider,
      fetch: toServer,
    });
  const pending = transport();
  await expect(
    new Client({ name: "contract", version: "0" }).connect(pending),
  ).rejects.toBeInstanceOf(UnauthorizedError);
  const person = browser(new URL(publicUrl).origin, serve);
  const landed = await person.signIn(store.url!);
  await person.signOut(browserUrl(server));
  const redmine =
    new URL(browserUrl(server)).origin + new URL(server.baseUrl).pathname.replace(/\/$/, "");
  expect(person.visited).toEqual(
    expect.arrayContaining([
      `GET ${publicUrl}/oauth/authorize`,
      `POST ${publicUrl}/oauth/authorize`,
      `GET ${redmine}/oauth/authorize`,
      `POST ${redmine}/login`,
      `GET ${publicUrl}/oauth/redmine/callback`,
    ]),
  );
  expect(landed.searchParams.get("iss")).toBe(publicUrl);
  await pending.finishAuth(landed.searchParams);

  const client = new Client({ name: "contract", version: "0" });
  await client.connect(transport());
  const me = await client.callTool({ name: "users_current", arguments: {} });
  expect(me.structuredContent).toMatchObject({ login: "jsmith" });

  const refresh = (token: string) =>
    toServer(`${publicUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token,
        client_id: store.client!.client_id,
      }),
    });
  const first = store.tokens!.refresh_token!;
  const renewed = (await (await refresh(first)).json()) as {
    access_token: string;
    refresh_token: string;
  };
  const callTool = (name: string, args: Record<string, unknown> = {}) =>
    toServer(publicUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${renewed.access_token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
  expect(await (await callTool("users_current")).text()).toContain('"login":"jsmith"');
  expect(await (await refresh(first)).json()).toMatchObject({ error: "invalid_grant" });
  return { person, callTool, refresh: () => refresh(renewed.refresh_token) };
}

describeServers("OAuth through Redmine", (server) => {
  // The subpath server's MCP endpoint sits under Redmine's own path, as a same-origin proxy mounts it.
  const mount = server.name === "7.0-subpath" ? "/redmine/mcp" : "/mcp";
  // Nothing listens on this URL: the browser and the client hand its requests to the handler.
  const publicUrl = `http://127.0.0.1:3737${mount}`;
  const handler = () =>
    createRedmineMcpHandler({
      baseUrl: server.baseUrl,
      version: server.version,
      publicUrl,
      oauth: {
        secret: randomBytes(32).toString("base64"),
        redmineApp: REDMINE_APP,
        redminePublicUrl: browserUrl(server),
        fetchClientMetadata: publicFetch,
      },
    });

  it(`signs jsmith in through Redmine's own OAuth with the endpoint at ${mount}`, async () => {
    await signInAndUse(server, publicUrl, handler());
  });

  it("keeps a raw_request 403 for my/page.json and 401 for my/page.js tool errors on a live sign-in", async () => {
    const { callTool } = await signInAndUse(server, publicUrl, handler());
    // Redmine ignores the credential on an action without accept_api_auth, and answers 403 on a JSON
    // path and 401 elsewhere.
    const forbidden = await callTool("raw_request", { method: "GET", path: "my/page.json" });
    expect(forbidden.status).toBe(200);
    expect(await forbidden.text()).toContain("Redmine answered 403 for raw_request");
    const outside = await callTool("raw_request", { method: "GET", path: "my/page.js" });
    expect(outside.status).toBe(200);
    expect(outside.headers.has("www-authenticate")).toBe(false);
    const advice = await outside.text();
    expect(advice).toContain("401 for my/page.js");
    expect(advice).toContain("end the path in .json");
    expect(await (await callTool("users_current")).text()).toContain('"login":"jsmith"');
  });

  it("answers 401 invalid_token once jsmith revokes the sign-in in Redmine", async () => {
    const { person, callTool, refresh } = await signInAndUse(server, publicUrl, handler());
    expect(await person.revokeAll(browserUrl(server))).toBeGreaterThan(0);
    const refused = await callTool("users_current");
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toBe(
      `Bearer error="invalid_token", error_description="Redmine no longer accepts this sign-in. Sign in again.", scope="redmine:read redmine:write redmine:delete", resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`,
    );
    const refreshed = await refresh();
    expect(refreshed.status).toBe(400);
    expect(await refreshed.json()).toMatchObject({ error: "invalid_grant" });
  });

  it.runIf(server.name === "7.0")("does the same through the CLI", async () => {
    const port = await freePort();
    const publicUrl = `http://127.0.0.1:${port}/mcp`;
    const child = spawn(process.execPath, [cli, "--http", "--port", String(port)], {
      env: {
        PATH: process.env.PATH,
        REDMINE_URL: server.baseUrl,
        REDMINE_VERSION: server.version,
        REDMINE_PUBLIC_URL: browserUrl(server),
        REDMINE_MCP_PUBLIC_URL: publicUrl,
        REDMINE_MCP_AUTH_SECRET: randomBytes(32).toString("base64"),
        REDMINE_OAUTH_CLIENT_ID: REDMINE_APP.clientId,
        REDMINE_OAUTH_CLIENT_SECRET: REDMINE_APP.clientSecret,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    try {
      await new Promise<void>((resolve, reject) => {
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk;
          if (stderr.includes("redirect URI is")) resolve();
        });
        child.once("exit", (code) => reject(new Error(`exited with ${code}: ${stderr}`)));
      });
      expect(stderr).toContain(`redirect URI is ${publicUrl}/oauth/redmine/callback`);
      await signInAndUse(server, publicUrl, (request) => fetch(request, { redirect: "manual" }));
      expect(stderr).not.toContain(REDMINE_APP.clientSecret);
    } finally {
      child.kill();
      await once(child, "exit");
    }
  });
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
