import { randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type { OAuthClientProvider } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createRedmineMcpHandler, memoryGrantStore } from "../../src/index.ts";
import type { GrantStore, RedmineMcpHandlerOptions } from "../../src/index.ts";
import {
  browser,
  clientKey,
  consentValue,
  fakeRedmine,
  pkce,
  REDMINE_APP,
  REDMINE_INTERNAL,
  REDMINE_PUBLIC,
  signJwt,
} from "./oauth-fakes.ts";
import type { ClientKey, FakeRedmine, SigningAlg } from "./oauth-fakes.ts";
import { createSealer } from "../../src/oauth/seal.ts";

type Handler = (request: Request) => Promise<Response>;

/** The MCP endpoint shares an origin with something else and lives under a path prefix. */
const ORIGIN = "https://mcp.example.com";
const PUBLIC_URL = `${ORIGIN}/redmine/mcp`;
const AUTHORIZE = `${PUBLIC_URL}/oauth/authorize`;
const TOKEN = `${PUBLIC_URL}/oauth/token`;
const REGISTER = `${PUBLIC_URL}/oauth/register`;
const CLAUDE = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";

const secret = () => randomBytes(32).toString("base64");

/** For handlers whose test never meets a client with a metadata document. */
const noMetadataFetch: typeof fetch = () => Promise.reject(new Error("no metadata fetch expected"));

interface Setup {
  handle: Handler;
  redmine: FakeRedmine;
  errors: Error[];
  documents: Map<string, unknown>;
  fetched: string[];
}

function setup(
  options: Partial<RedmineMcpHandlerOptions> = {},
  oauth: Partial<NonNullable<RedmineMcpHandlerOptions["oauth"]>> = {},
  redmine = fakeRedmine(),
): Setup {
  const errors: Error[] = [];
  const documents = new Map<string, unknown>([
    [CLAUDE, { client_id: CLAUDE, client_name: "Claude", redirect_uris: [CLAUDE_REDIRECT] }],
  ]);
  const fetched: string[] = [];
  const fetchClientMetadata: typeof fetch = async (input, init) => {
    const url = new Request(input, init).url;
    fetched.push(url);
    return documents.has(url)
      ? Response.json(documents.get(url))
      : new Response(null, { status: 404 });
  };
  const handle = createRedmineMcpHandler({
    baseUrl: REDMINE_INTERNAL,
    fetch: redmine.fetch,
    publicUrl: PUBLIC_URL,
    onError: (error) => errors.push(error),
    oauth: {
      secret: secret(),
      redmineApp: REDMINE_APP,
      redminePublicUrl: REDMINE_PUBLIC,
      fetchClientMetadata,
      ...oauth,
    } as NonNullable<RedmineMcpHandlerOptions["oauth"]>,
    ...options,
  });
  return { handle, redmine, errors, documents, fetched };
}

/** Sends requests for the public origin to the handler, as a proxy that keeps the path does. */
function direct(handle: Handler): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) throw new Error(`the client called ${url.href}`);
    return handle(
      new Request(new URL(url.pathname + url.search, "http://127.0.0.1:3737"), request),
    );
  };
}

function form(handle: Handler, url: string, params: Record<string, string>): Promise<Response> {
  return direct(handle)(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

function authorizeUrl(params: Record<string, string>): URL {
  const url = new URL(AUTHORIZE);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

/** Runs the browser part of a sign-in and returns where it lands: the client's redirect URI. */
async function signIn(
  { handle, redmine }: Setup,
  { clientId = CLAUDE, redirectUri = CLAUDE_REDIRECT, ...extra }: Record<string, string> = {},
) {
  const { verifier, challenge } = pkce();
  const person = browser(handle, ORIGIN, redmine);
  const page = await person.send(
    authorizeUrl({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "client-state",
      resource: PUBLIC_URL,
      ...extra,
    }),
  );
  expect(page.status, await page.clone().text()).toBe(200);
  const decision = await person.send(new URL(AUTHORIZE), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ consent: consentValue(await page.text()), decision: "allow" }),
  });
  const landed = await person.follow(decision);
  if (landed instanceof Response)
    throw new Error(`stopped at ${landed.status}: ${await landed.text()}`);
  return { landed, verifier, clientId, redirectUri };
}

interface Issued {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

async function tokens(setup: Setup, options: Record<string, string> = {}): Promise<Issued> {
  const { landed, verifier, clientId, redirectUri } = await signIn(setup, options);
  const response = await form(setup.handle, TOKEN, {
    grant_type: "authorization_code",
    code: landed.searchParams.get("code")!,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
    resource: PUBLIC_URL,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as Issued;
}

function callTool(
  handle: Handler,
  headers: Record<string, string>,
  name = "issue_statuses_list",
  args: Record<string, unknown> = {},
) {
  return direct(handle)(PUBLIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("built-in authorization server", () => {
  it("publishes the metadata at every discovery URL derived from the endpoint's path", async () => {
    const { handle } = setup();
    const get = (path: string) => direct(handle)(`${ORIGIN}${path}`);
    for (const path of [
      "/.well-known/oauth-protected-resource/redmine/mcp",
      "/redmine/mcp/.well-known/oauth-protected-resource",
    ]) {
      const resource = await get(path);
      expect(resource.status).toBe(200);
      expect(resource.headers.get("access-control-allow-origin")).toBe("*");
      expect(await resource.json()).toEqual({
        resource: PUBLIC_URL,
        authorization_servers: [PUBLIC_URL],
        scopes_supported: ["redmine:read", "redmine:write", "redmine:delete"],
        bearer_methods_supported: ["header"],
        resource_name: "Redmine",
      });
    }
    const documents = await Promise.all(
      [
        "/.well-known/oauth-authorization-server/redmine/mcp",
        "/.well-known/openid-configuration/redmine/mcp",
        "/redmine/mcp/.well-known/openid-configuration",
      ].map(async (path) => (await get(path)).json()),
    );
    expect(documents[1]).toEqual(documents[0]);
    expect(documents[2]).toEqual(documents[0]);
    expect(documents[0]).toEqual({
      issuer: PUBLIC_URL,
      authorization_endpoint: AUTHORIZE,
      token_endpoint: TOKEN,
      registration_endpoint: REGISTER,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
      token_endpoint_auth_signing_alg_values_supported: ["RS256", "PS256", "ES256"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["redmine:read", "redmine:write", "redmine:delete"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
    // The handler never claims the origin's root, where Redmine or anything else may live.
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server",
      "/.well-known/openid-configuration",
      "/mcp",
      "/authorize",
      "/token",
      "/oauth/authorize",
      "/redmine/oauth/authorize",
    ]) {
      expect([path, (await get(path)).status]).toEqual([path, 404]);
    }
  });

  it("answers 401 with a Bearer challenge naming the metadata and the server's scopes", async () => {
    const { handle } = setup({ access: "no-delete" });
    const response = await callTool(handle, {});
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource", scope="redmine:read redmine:write"`,
    );
  });

  it("admits the public origin's own pages at the endpoint without listing it", async () => {
    const { handle } = setup();
    const key = { "X-Redmine-API-Key": "jsmith-api-key" };
    const own = await callTool(handle, { ...key, Origin: ORIGIN });
    expect(own.status).toBe(200);
    expect((await callTool(handle, { ...key, Origin: "https://evil.example" })).status).toBe(403);
  });

  it("signs in through Redmine with an official MCP client that registers itself", async () => {
    const setupped = setup();
    const { handle, redmine } = setupped;
    const store: { tokens?: unknown; client?: unknown; verifier?: string; url?: URL } = {};
    const provider: OAuthClientProvider = {
      redirectUrl: "http://127.0.0.1:43210/callback",
      clientMetadata: {
        client_name: "Contract Client",
        redirect_uris: ["http://127.0.0.1/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      clientInformation: () => store.client as never,
      saveClientInformation: (client) => void (store.client = client),
      tokens: () => store.tokens as never,
      saveTokens: (tokens) => void (store.tokens = tokens),
      redirectToAuthorization: (url) => void (store.url = url),
      saveCodeVerifier: (verifier) => void (store.verifier = verifier),
      codeVerifier: () => store.verifier!,
    };
    const transport = () =>
      new StreamableHTTPClientTransport(new URL(PUBLIC_URL), {
        authProvider: provider,
        fetch: direct(handle),
      });
    const first = new Client({ name: "oauth-test", version: "0.0.0" });
    const pending = transport();
    await expect(first.connect(pending)).rejects.toBeInstanceOf(UnauthorizedError);
    // A registered client's redirect URI matches on any loopback port.
    expect(store.url!.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:43210/callback");

    const person = browser(handle, ORIGIN, redmine);
    const page = await person.send(store.url!);
    const html = await page.text();
    expect(html).toContain("Contract Client");
    expect(html).toContain("this name is not verified");
    const landed = await person.follow(
      await person.send(new URL(AUTHORIZE), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ consent: consentValue(html), decision: "allow" }),
      }),
    );
    if (landed instanceof Response) throw new Error(await landed.text());
    expect(landed.searchParams.get("iss")).toBe(PUBLIC_URL);
    await pending.finishAuth(landed.searchParams);

    const client = new Client({ name: "oauth-test", version: "0.0.0" });
    await client.connect(transport());
    const result = await client.callTool({ name: "issue_statuses_list", arguments: {} });
    expect(result.structuredContent).toMatchObject({ items: [{ name: "New for jsmith" }] });
    // A registered client is public: nothing is fetched to check it.
    expect(setupped.fetched).toEqual([]);
    // Redmine sees its own token, never ours.
    const call = redmine.apiCalls.at(-1)!;
    expect(redmine.tokens.has(call.authorization!.slice("Bearer ".length))).toBe(true);
    expect(JSON.stringify(store.tokens)).not.toContain(call.authorization!.slice("Bearer ".length));
  });

  it("exchanges a CIMD client's code for tokens, refreshes them, and serves tools with them", async () => {
    const setupped = setup();
    const { handle, redmine, fetched } = setupped;
    const { landed, verifier } = await signIn(setupped);
    expect(fetched).toEqual([CLAUDE]);
    expect(landed.origin + landed.pathname).toBe(CLAUDE_REDIRECT);
    expect(landed.searchParams.get("state")).toBe("client-state");
    expect(landed.searchParams.get("iss")).toBe(PUBLIC_URL);
    // Redmine was asked at its public URL, with our own PKCE and every permission the scopes need.
    const upstream = redmine.authorizeRequests[0]!;
    expect(upstream.get("redirect_uri")).toBe(`${PUBLIC_URL}/oauth/redmine/callback`);
    expect(upstream.get("code_challenge_method")).toBe("S256");
    expect(upstream.get("scope")!.split(" ")).toEqual(
      expect.arrayContaining(["view_issues", "edit_issues", "delete_issues"]),
    );
    expect(upstream.get("scope")).not.toContain("admin");

    const exchange = (code: string) =>
      form(handle, TOKEN, {
        grant_type: "authorization_code",
        code,
        redirect_uri: CLAUDE_REDIRECT,
        client_id: CLAUDE,
        code_verifier: verifier,
      });
    const response = await exchange(landed.searchParams.get("code")!);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const issued = (await response.json()) as Issued;
    expect(issued).toMatchObject({
      token_type: "Bearer",
      expires_in: 3600,
      scope: "redmine:read redmine:write redmine:delete",
    });
    // The code is single-use.
    expect(await (await exchange(landed.searchParams.get("code")!)).json()).toMatchObject({
      error: "invalid_grant",
    });

    const called = await callTool(handle, { Authorization: `Bearer ${issued.access_token}` });
    expect(await called.text()).toContain("New for jsmith");

    const refreshed = await form(handle, TOKEN, {
      grant_type: "refresh_token",
      refresh_token: issued.refresh_token,
      client_id: CLAUDE,
    });
    const renewed = (await refreshed.json()) as Issued;
    expect(renewed.access_token).not.toBe(issued.access_token);
    expect(
      await (await callTool(handle, { Authorization: `Bearer ${renewed.access_token}` })).text(),
    ).toContain("New for jsmith");
    // Redmine rotated its refresh token, so ours that sealed the old one is spent.
    const replayed = await form(handle, TOKEN, {
      grant_type: "refresh_token",
      refresh_token: issued.refresh_token,
      client_id: CLAUDE,
    });
    expect(await replayed.json()).toMatchObject({ error: "invalid_grant" });
    // A public client's tokens never send the server back to its document.
    expect(fetched).toEqual([CLAUDE]);
  });

  it.each([
    [30, 15],
    [1, 1],
    [120, 60],
  ])("never issues an expired token over a Redmine token of %i s: %i s", async (redmine, ours) => {
    const setupped = setup();
    const short = fakeRedmine({ expiresIn: redmine });
    const handle = createRedmineMcpHandler({
      baseUrl: REDMINE_INTERNAL,
      fetch: short.fetch,
      publicUrl: PUBLIC_URL,
      oauth: {
        secret: secret(),
        redmineApp: REDMINE_APP,
        redminePublicUrl: REDMINE_PUBLIC,
        fetchClientMetadata: async () =>
          Response.json({ client_id: CLAUDE, redirect_uris: [CLAUDE_REDIRECT] }),
      },
    });
    const issued = await tokens({ ...setupped, handle, redmine: short });
    expect(issued.expires_in).toBe(ours);
    expect(
      (await callTool(handle, { Authorization: `Bearer ${issued.access_token}` })).status,
    ).toBe(200);
  });

  it("takes a code exchange without redirect_uri, as OAuth 2.1 clients send it", async () => {
    const setupped = setup();
    const { landed, verifier } = await signIn(setupped);
    const response = await form(setupped.handle, TOKEN, {
      grant_type: "authorization_code",
      code: landed.searchParams.get("code")!,
      client_id: CLAUDE,
      code_verifier: verifier,
    });
    expect(response.status).toBe(200);
  });

  it("maps a read scope to read-only tools, under the server's own cap", async () => {
    const setupped = setup({ access: "no-delete" });
    const read = await tokens(setupped, { scope: "redmine:read" });
    expect(read.scope).toBe("redmine:read");
    expect(setupped.redmine.authorizeRequests[0]!.get("scope")).not.toContain("edit_issues");
    const list = await direct(setupped.handle)(PUBLIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${read.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const listing = await list.text();
    expect(listing).not.toContain("Needs an admin key");
    expect(listing.match(/"name":"/g)?.length).toBe(44 - 3);
    const bearer = { Authorization: `Bearer ${read.access_token}` };
    const posted = await callTool(setupped.handle, bearer, "raw_request", {
      method: "POST",
      path: "issues.json",
      body: {},
    });
    expect(posted.status).toBe(403);
    expect(posted.headers.get("www-authenticate")).toContain('scope="redmine:read redmine:write"');
    const deleted = await callTool(setupped.handle, bearer, "issues_delete", { issue_id: 1 });
    expect(deleted.status).toBe(200);
    expect(await deleted.text()).toContain('"isError":true');
    expect(setupped.redmine.apiCalls).toEqual([]);
    // Asking for more than the server offers gets what it offers.
    const capped = await tokens(setupped, { scope: "redmine:delete" });
    expect(capped.scope).toBe("redmine:read redmine:write");
  });

  it("keeps serving X-Redmine-API-Key next to OAuth", async () => {
    const { handle } = setup();
    const response = await callTool(handle, { "X-Redmine-API-Key": "jsmith-api-key" });
    expect(await response.text()).toContain("New for jsmith");
  });

  it("answers 401 invalid_token once Redmine revokes the sign-in, and the refresh fails", async () => {
    const setupped = setup();
    const issued = await tokens(setupped);
    const bearer = { Authorization: `Bearer ${issued.access_token}` };
    expect(await (await callTool(setupped.handle, bearer)).text()).toContain("New for jsmith");
    setupped.redmine.revokeAll();
    const refused = await callTool(setupped.handle, bearer);
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toBe(
      `Bearer error="invalid_token", error_description="Redmine no longer accepts this sign-in. Sign in again.", scope="redmine:read redmine:write redmine:delete", resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource"`,
    );
    const refreshed = await form(setupped.handle, TOKEN, {
      grant_type: "refresh_token",
      refresh_token: issued.refresh_token,
      client_id: CLAUDE,
    });
    expect(refreshed.status).toBe(400);
    expect(await refreshed.json()).toMatchObject({
      error: "invalid_grant",
      error_description: expect.stringContaining("Redmine refused the grant"),
    });
    expect(setupped.errors).toEqual([]);
  });

  it("refuses tokens that are forged, sealed for another purpose, or expired, with 401", async () => {
    const setupped = setup();
    const issued = await tokens(setupped);
    for (const token of [issued.refresh_token, `${issued.access_token}x`, "not-a-token"]) {
      const response = await callTool(setupped.handle, { Authorization: `Bearer ${token}` });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }
    const asRefresh = await form(setupped.handle, TOKEN, {
      grant_type: "refresh_token",
      refresh_token: issued.access_token,
      client_id: CLAUDE,
    });
    expect(await asRefresh.json()).toMatchObject({ error: "invalid_grant" });
    // Another deployment's secret, or another public URL, opens nothing of this one's.
    const other = setup();
    expect(
      (await callTool(other.handle, { Authorization: `Bearer ${issued.access_token}` })).status,
    ).toBe(401);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 3601_000);
    expect(
      (await callTool(setupped.handle, { Authorization: `Bearer ${issued.access_token}` })).status,
    ).toBe(401);
  });

  it("refuses an expired code, another client's code, a wrong redirect_uri and a wrong verifier", async () => {
    const setupped = setup();
    const signed = await signIn(setupped);
    const code = signed.landed.searchParams.get("code")!;
    const exchange = (params: Record<string, string>) =>
      form(setupped.handle, TOKEN, {
        grant_type: "authorization_code",
        code,
        redirect_uri: CLAUDE_REDIRECT,
        client_id: CLAUDE,
        code_verifier: signed.verifier,
        ...params,
      }).then((response) => response.json());
    expect(await exchange({ client_id: "https://evil.example/client.json" })).toMatchObject({
      error: "invalid_grant",
      error_description: "The code was issued to another client",
    });
    expect(await exchange({ redirect_uri: "https://claude.ai/other" })).toMatchObject({
      error: "invalid_grant",
    });
    expect(await exchange({ code_verifier: pkce().verifier })).toMatchObject({
      error: "invalid_grant",
      error_description: "code_verifier does not match the code_challenge",
    });
    expect(await exchange({ resource: "https://other.example.com/mcp" })).toMatchObject({
      error: "invalid_target",
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    expect(await exchange({})).toMatchObject({
      error: "invalid_grant",
      error_description: "The code is invalid or has expired",
    });
    // None of the refused attempts spent Redmine's code.
    expect(setupped.redmine.tokenRequests).toEqual([]);
  });

  it("answers a request it refuses before consent with a page, never a redirect", async () => {
    const setupped = setup();
    const person = browser(setupped.handle, ORIGIN, setupped.redmine);
    // Anyone may register a client whose redirect URI is a phishing page.
    const registered = await direct(setupped.handle)(REGISTER, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://evil.example/phish"] }),
    });
    const evil = ((await registered.json()) as { client_id: string }).client_id;
    const base = {
      response_type: "code",
      client_id: evil,
      redirect_uri: "https://evil.example/phish",
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
      state: "s1",
    };
    const cases: [Record<string, string>, string][] = [
      [{ code_challenge_method: "plain" }, "PKCE with code_challenge_method=S256 is required"],
      [{ code_challenge: "" }, "PKCE with code_challenge_method=S256 is required"],
      [{ response_type: "token" }, "only response_type=code is supported"],
      [{ resource: "https://mcp.example.com/other" }, "this server issues tokens only for"],
      [{ state: "s".repeat(1025) }, "state is longer than 1024 characters"],
      [{ scope: "openid offline_access" }, "the scope names none of"],
    ];
    for (const [params, reason] of cases) {
      const response = await person.send(authorizeUrl({ ...base, ...params }));
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toContain(reason);
    }
    // An unknown redirect URI never gets a redirect either.
    const stray = await person.send(
      authorizeUrl({ ...base, client_id: CLAUDE, redirect_uri: "https://evil.example/cb" }),
    );
    expect(stray.status).toBe(400);
    expect(stray.headers.get("location")).toBeNull();
  });

  it("redirects only after the person decides", async () => {
    const setupped = setup();
    const person = browser(setupped.handle, ORIGIN, setupped.redmine);
    const page = await person.send(
      authorizeUrl({
        response_type: "code",
        client_id: CLAUDE,
        redirect_uri: CLAUDE_REDIRECT,
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
        state: "s3",
      }),
    );
    expect(page.headers.get("location")).toBeNull();
    const denied = await person.send(new URL(AUTHORIZE), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ consent: consentValue(await page.text()), decision: "deny" }),
    });
    expect(denied.status).toBe(303);
    expect(new URL(denied.headers.get("location")!).searchParams.get("error")).toBe(
      "access_denied",
    );
  });

  it("grants what a scope names, everything offered without one, and refuses one naming none of ours", async () => {
    const setupped = setup();
    const scopeOf = async (scope: string | undefined) => {
      const response = await browser(setupped.handle, ORIGIN, setupped.redmine).send(
        authorizeUrl({
          response_type: "code",
          client_id: CLAUDE,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
          ...(scope === undefined ? {} : { scope }),
        }),
      );
      const text = await response.text();
      return response.status === 200 ? (text.match(/<li>/g) ?? []).length : response.status;
    };
    expect(await scopeOf(undefined)).toBe(3);
    expect(await scopeOf("")).toBe(3);
    expect(await scopeOf("redmine:read openid")).toBe(1);
    expect(await scopeOf("redmine:write")).toBe(2);
    expect(await scopeOf("redmine:raed")).toBe(400);
    expect(await scopeOf("openid offline_access")).toBe(400);
  });

  it("refuses a refresh that names a scope the grant lacks, and narrows on request", async () => {
    const setupped = setup();
    const issued = await tokens(setupped, { scope: "redmine:write" });
    const refresh = async (scope: string) =>
      (await (
        await form(setupped.handle, TOKEN, {
          grant_type: "refresh_token",
          refresh_token: issued.refresh_token,
          client_id: CLAUDE,
          scope,
        })
      ).json()) as Record<string, string>;
    expect(await refresh("redmine:delete")).toMatchObject({ error: "invalid_scope" });
    expect(await refresh("redmine:read profile")).toMatchObject({ error: "invalid_scope" });
    expect(await refresh("redmine:read")).toMatchObject({ scope: "redmine:read" });
  });

  it("guards the consent form with a sealed value bound to a __Host- cookie", async () => {
    const setupped = setup();
    const person = browser(setupped.handle, ORIGIN, setupped.redmine);
    const page = await person.send(
      authorizeUrl({
        response_type: "code",
        client_id: CLAUDE,
        redirect_uri: CLAUDE_REDIRECT,
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
      }),
    );
    const cookie = page.headers.getSetCookie()[0]!;
    expect(cookie).toMatch(
      /^__Host-redmine-mcp-oauth=[\w-]+; Path=\/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax$/,
    );
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("content-security-policy")).toContain(
      "form-action 'self' https://redmine.example.com https://claude.ai",
    );
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    const consent = consentValue(await page.text());
    const post = (cookieHeader: string | undefined, value = consent) =>
      setupped.handle(
        new Request("http://127.0.0.1:3737/redmine/mcp/oauth/authorize", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            ...(cookieHeader === undefined ? {} : { cookie: cookieHeader }),
          },
          body: new URLSearchParams({ consent: value, decision: "allow" }),
        }),
      );
    // A cross-site form post carries no cookie, and another browser's cookie does not match.
    expect((await post(undefined)).status).toBe(403);
    const crossSite = await setupped.handle(
      new Request("http://127.0.0.1:3737/redmine/mcp/oauth/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://evil.example",
          cookie: [...person.jar.get(ORIGIN)!]
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
        },
        body: new URLSearchParams({ consent, decision: "allow" }),
      }),
    );
    expect(crossSite.status).toBe(403);
    const elsewhere = browser(setupped.handle, ORIGIN, setupped.redmine);
    await elsewhere.send(
      authorizeUrl({
        response_type: "code",
        client_id: CLAUDE,
        redirect_uri: CLAUDE_REDIRECT,
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
      }),
    );
    const theirs = [...elsewhere.jar.get(ORIGIN)!]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
    expect((await post(theirs)).status).toBe(403);
    const mine = [...person.jar.get(ORIGIN)!].map(([name, value]) => `${name}=${value}`).join("; ");
    expect((await post(mine, `${consent}x`)).status).toBe(400);
    expect((await post(mine)).status).toBe(303);
  });

  it("refuses a callback in a browser that did not consent", async () => {
    const setupped = setup();
    const person = browser(setupped.handle, ORIGIN, setupped.redmine);
    const page = await person.send(
      authorizeUrl({
        response_type: "code",
        client_id: CLAUDE,
        redirect_uri: CLAUDE_REDIRECT,
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
      }),
    );
    const decision = await person.send(new URL(AUTHORIZE), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ consent: consentValue(await page.text()), decision: "allow" }),
    });
    // The attacker hands the Redmine link to a victim, whose browser comes back without the cookie.
    const atRedmine = setupped.redmine.authorize(new URL(decision.headers.get("location")!));
    const victim = browser(setupped.handle, ORIGIN, setupped.redmine);
    const callback = await victim.send(new URL(atRedmine.headers.get("location")!));
    expect(callback.status).toBe(403);
    expect(callback.headers.get("location")).toBeNull();
  });

  it("returns access_denied when the person denies", async () => {
    const setupped = setup();
    const person = browser(setupped.handle, ORIGIN, setupped.redmine);
    const page = await person.send(
      authorizeUrl({
        response_type: "code",
        client_id: CLAUDE,
        redirect_uri: CLAUDE_REDIRECT,
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
        state: "s2",
      }),
    );
    const denied = await person.send(new URL(AUTHORIZE), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ consent: consentValue(await page.text()), decision: "deny" }),
    });
    const location = new URL(denied.headers.get("location")!);
    expect(Object.fromEntries(location.searchParams)).toEqual({
      error: "access_denied",
      state: "s2",
      iss: PUBLIC_URL,
    });
    expect(setupped.redmine.authorizeRequests).toEqual([]);
  });

  it("escapes what clients say about themselves", async () => {
    const setupped = setup();
    const registered = await direct(setupped.handle)(REGISTER, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: '<script>alert("x")</script>',
        redirect_uris: ["https://app.example.com/cb"],
      }),
    });
    expect(registered.status).toBe(201);
    const client = (await registered.json()) as { client_id: string };
    const page = await browser(setupped.handle, ORIGIN, setupped.redmine).send(
      authorizeUrl({
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: "https://app.example.com/cb",
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
      }),
    );
    const html = await page.text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&#60;script&#62;alert(&#34;x&#34;)&#60;/script&#62;");
    expect(html).toContain("app.example.com");
  });

  it("registers clients statelessly and refuses unsafe redirect URIs", async () => {
    const { handle } = setup();
    const register = (body: unknown) =>
      direct(handle)(REGISTER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const ok = await register({
      client_name: "Cursor",
      redirect_uris: ["http://localhost:8787/callback"],
      token_endpoint_auth_method: "none",
    });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({
      client_name: "Cursor",
      redirect_uris: ["http://localhost:8787/callback"],
      token_endpoint_auth_method: "none",
    });
    for (const uri of [
      "http://app.example.com/cb",
      "javascript:alert(1)",
      "https://app.example.com/cb#x",
      "cursor://callback",
    ]) {
      const refused = await register({ redirect_uris: [uri] });
      expect([uri, refused.status, ((await refused.json()) as { error: string }).error]).toEqual([
        uri,
        400,
        "invalid_redirect_uri",
      ]);
    }
    expect((await register({})).status).toBe(400);
  });

  it("registers public clients only, and keeps registrations small", async () => {
    const { handle } = setup();
    const register = async (body: unknown) => {
      const response = await direct(handle)(REGISTER, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as Record<string, string> };
    };
    const uri = (length: number) => `https://app.example.com/${"c".repeat(length - 24)}`;
    // A client asking for a secret gets none, which it must then use, as RFC 7591 lets the server say.
    for (const method of [undefined, "none", "client_secret_basic", "client_secret_post"]) {
      const registered = await register({
        redirect_uris: [uri(40)],
        ...(method === undefined ? {} : { token_endpoint_auth_method: method }),
      });
      expect([method, registered.status, registered.body.token_endpoint_auth_method]).toEqual([
        method,
        201,
        "none",
      ]);
      expect(registered.body).not.toHaveProperty("client_secret");
    }
    // A name that is empty or too long is dropped, and the client registers anyway.
    for (const client_name of ["", "   ", "n".repeat(101)]) {
      const registered = await register({ redirect_uris: [uri(40)], client_name });
      expect(registered.status).toBe(201);
      expect(registered.body).not.toHaveProperty("client_name");
    }
    for (const refused of [
      { redirect_uris: [uri(40)], token_endpoint_auth_method: "private_key_jwt" },
      { redirect_uris: [uri(40)], token_endpoint_auth_method: "tls_client_auth" },
      { redirect_uris: [uri(40)], token_endpoint_auth_method: "self_signed_tls_client_auth" },
      { redirect_uris: Array.from({ length: 6 }, (_, at) => `${uri(40)}${at}`) },
      { redirect_uris: [uri(257)] },
    ]) {
      expect(await register(refused)).toMatchObject({
        status: 400,
        body: { error: "invalid_client_metadata" },
      });
    }
    // A client with keys has a way in: its own metadata document.
    expect(
      (await register({ redirect_uris: [uri(40)], token_endpoint_auth_method: "private_key_jwt" }))
        .body.error_description,
    ).toContain("metadata document that declares private_key_jwt");
    const largest = await register({
      redirect_uris: Array.from({ length: 5 }, (_, at) => `${uri(255)}${at}`),
      client_name: "n".repeat(100),
    });
    expect(largest.status).toBe(201);
    expect(largest.body.client_id!.length).toBeLessThan(2600);
  });

  it("admits a metadata document with none or private_key_jwt and one key source, and refuses the rest", async () => {
    const setupped = setup();
    const key = clientKey("ES256");
    const page = async (document: Record<string, unknown>) => {
      const id = `https://${randomBytes(4).toString("hex")}.example/client.json`;
      setupped.documents.set(id, { client_id: id, redirect_uris: [CLAUDE_REDIRECT], ...document });
      const response = await authorizePage(setupped, id);
      const text = await response.text();
      return { status: response.status, reason: /<p class="error">([^<]*)<\/p>/.exec(text)?.[1] };
    };
    const jwt = { token_endpoint_auth_method: "private_key_jwt" };
    const admitted = [
      {},
      { token_endpoint_auth_method: "none" },
      { ...jwt, jwks_uri: "https://jwt.example/jwks.json" },
      { ...jwt, jwks: { keys: [key.jwk] } },
      { ...jwt, jwks: { keys: [{ ...key.jwk, use: undefined }] } },
      {
        ...jwt,
        jwks_uri: "https://jwt.example/jwks.json",
        token_endpoint_auth_signing_alg: "PS256",
      },
    ];
    for (const document of admitted) {
      expect([document, (await page(document)).status]).toEqual([document, 200]);
    }
    const refused: [Record<string, unknown>, string][] = [
      [jwt, "its metadata document declares private_key_jwt without jwks or jwks_uri"],
      [
        { ...jwt, jwks_uri: "https://jwt.example/jwks.json", jwks: { keys: [key.jwk] } },
        "its metadata document gives both jwks and jwks_uri",
      ],
      [
        { ...jwt, jwks: { keys: [{ ...key.jwk, use: "enc" }] } },
        "its metadata document gives no signing key in jwks",
      ],
      [{ ...jwt, jwks: { keys: [] } }, "its metadata document gives no signing key in jwks"],
      [
        { ...jwt, jwks_uri: "http://jwt.example/jwks.json" },
        "its metadata document gives a jwks_uri that is not a public https URL",
      ],
      [
        { ...jwt, jwks_uri: "https://10.0.0.1/jwks.json" },
        "its metadata document gives a jwks_uri that is not a public https URL",
      ],
      ...["HS256", "RS512", "none"].map((alg): [Record<string, unknown>, string] => [
        { ...jwt, jwks_uri: "https://jwt.example/jwks.json", token_endpoint_auth_signing_alg: alg },
        "its metadata document asks for a token_endpoint_auth_signing_alg other than RS256, PS256 or ES256",
      ]),
      ...["client_secret_basic", "client_secret_post", "client_secret_jwt", "tls_client_auth"].map(
        (method): [Record<string, unknown>, string] => [
          { token_endpoint_auth_method: method, jwks_uri: "https://jwt.example/jwks.json" },
          "its metadata document asks for a token_endpoint_auth_method other than none and private_key_jwt",
        ],
      ),
    ];
    for (const [document, reason] of refused) {
      expect([document, await page(document)]).toEqual([
        document,
        { status: 400, reason: `This server refuses the client: ${reason}.` },
      ]);
    }
  });

  it("says only that a metadata document could not be fetched, whatever its server answered", async () => {
    let status = 404;
    const { handle, redmine } = setup(
      {},
      {
        fetchClientMetadata: async () =>
          new Response(null, { status, headers: { location: "https://elsewhere.example/" } }),
      },
    );
    for (status of [404, 401, 500, 302]) {
      const response = await browser(handle, ORIGIN, redmine).send(
        authorizeUrl({
          response_type: "code",
          client_id: "https://internal.example/meta.json",
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      );
      const message = /<p class="error">([^<]*)<\/p>/.exec(await response.text())?.[1];
      expect(message).toContain("its metadata document could not be fetched");
      expect(message).not.toContain(String(status));
    }
  });

  it("fetches metadata documents only from public https URLs, once per few minutes", async () => {
    const setupped = setup();
    const { handle, documents, fetched } = setupped;
    const page = (clientId: string) =>
      browser(handle, ORIGIN, setupped.redmine).send(
        authorizeUrl({
          response_type: "code",
          client_id: clientId,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      );
    for (const clientId of [
      "http://claude.ai/oauth/meta",
      "https://127.0.0.1/meta.json",
      "https://[::1]/meta.json",
      "https://localhost/meta.json",
      "https://metadata.internal/meta.json",
      "https://intranet/meta.json",
      "https://claude.ai:8443/meta.json",
      "https://claude.ai/",
      "https://user@claude.ai/meta.json",
      "https://claude.ai/a/../meta.json",
    ]) {
      const response = await page(clientId);
      expect([clientId, response.status]).toEqual([clientId, 400]);
    }
    expect(fetched).toEqual([]);
    documents.set("https://evil.example/meta.json", {
      client_id: "https://other.example/meta.json",
      redirect_uris: [CLAUDE_REDIRECT],
    });
    expect((await page("https://evil.example/meta.json")).status).toBe(400);
    documents.set("https://secret.example/meta.json", {
      client_id: "https://secret.example/meta.json",
      client_secret: "x",
      redirect_uris: [CLAUDE_REDIRECT],
    });
    expect((await page("https://secret.example/meta.json")).status).toBe(400);
    expect((await page(CLAUDE)).status).toBe(200);
    expect((await page(CLAUDE)).status).toBe(200);
    expect(fetched.filter((url) => url === CLAUDE)).toHaveLength(1);
  });

  it("does not follow a metadata document's redirect and caps its size", async () => {
    const calls: RequestInit[] = [];
    const big = "https://big.example/meta.json";
    const moved = "https://moved.example/meta.json";
    const { handle, redmine } = setup(
      {},
      {
        fetchClientMetadata: async (input, init) => {
          calls.push(init!);
          const url = new Request(input).url;
          if (url === moved)
            return new Response(null, {
              status: 302,
              headers: { location: "http://169.254.169.254/" },
            });
          return new Response(
            JSON.stringify({
              client_id: big,
              redirect_uris: [CLAUDE_REDIRECT],
              pad: "x".repeat(6000),
            }),
          );
        },
      },
    );
    for (const clientId of [moved, big]) {
      const response = await browser(handle, ORIGIN, redmine).send(
        authorizeUrl({
          response_type: "code",
          client_id: clientId,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(
      calls.every((init) => init.redirect === "manual" && init.signal instanceof AbortSignal),
    ).toBe(true);
  });

  it("admits only clients on allowed hosts", async () => {
    const setupped = setup({}, { allowedClientHosts: ["claude.ai"] });
    const { handle } = setupped;
    expect((await signIn(setupped)).landed.searchParams.has("code")).toBe(true);
    const registered = await direct(handle)(REGISTER, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://localhost:8787/callback"] }),
    });
    expect(registered.status).toBe(400);
    setupped.documents.set("https://vscode.dev/oauth/client-metadata.json", {
      client_id: "https://vscode.dev/oauth/client-metadata.json",
      redirect_uris: ["https://vscode.dev/redirect"],
    });
    const page = await browser(handle, ORIGIN, setupped.redmine).send(
      authorizeUrl({
        response_type: "code",
        client_id: "https://vscode.dev/oauth/client-metadata.json",
        redirect_uri: "https://vscode.dev/redirect",
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
      }),
    );
    expect(page.status).toBe(400);
    expect(setupped.fetched).not.toContain("https://vscode.dev/oauth/client-metadata.json");
  });

  it("calls the global fetch unbound, as Workers require, when given none", async () => {
    const setupped = setup({ fetch: undefined });
    const strict = function (this: unknown, ...args: Parameters<typeof fetch>) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return setupped.redmine.fetch(...args);
    };
    vi.stubGlobal("fetch", strict);
    try {
      expect((await tokens(setupped)).access_token).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps tokens valid across a secret rotation that lists the old secret", async () => {
    const old = secret();
    const before = setup({}, { secret: old });
    const issued = await tokens(before);
    const after = createRedmineMcpHandler({
      baseUrl: REDMINE_INTERNAL,
      fetch: before.redmine.fetch,
      publicUrl: PUBLIC_URL,
      oauth: {
        secret: secret(),
        previousSecret: old,
        redmineApp: REDMINE_APP,
        fetchClientMetadata: noMetadataFetch,
      },
    });
    expect((await callTool(after, { Authorization: `Bearer ${issued.access_token}` })).status).toBe(
      200,
    );
  });

  it("refuses to start without https, a long secret, or the Redmine application", () => {
    const create =
      (options: Partial<RedmineMcpHandlerOptions>, oauth: object = {}) =>
      () =>
        createRedmineMcpHandler({
          baseUrl: REDMINE_INTERNAL,
          publicUrl: PUBLIC_URL,
          oauth: {
            secret: secret(),
            redmineApp: REDMINE_APP,
            fetchClientMetadata: noMetadataFetch,
            ...oauth,
          } as never,
          ...options,
        });
    expect(create({ publicUrl: "http://mcp.example.com/mcp" })).toThrow("https");
    expect(create({ publicUrl: "http://127.0.0.1:3737/mcp" })).not.toThrow();
    for (const weak of ["short", "a".repeat(44), "ab".repeat(22), "0123456789".repeat(4)]) {
      expect(create({}, { secret: weak })).toThrow("at least 32 random characters");
      expect(create({}, { previousSecret: weak })).toThrow("at least 32 random characters");
    }
    expect(create({}, { secret: randomBytes(32).toString("hex") })).not.toThrow();
    expect(create({}, { redmineApp: { clientId: "", clientSecret: "" } })).toThrow("clientId");
    expect(create({ publicUrl: undefined })).toThrow("publicUrl");
    // Clients choose the metadata URLs, so the handler has no unguarded default fetch for them.
    expect(create({}, { fetchClientMetadata: undefined })).toThrow(
      "oauth.fetchClientMetadata is required: pass publicFetch from @redmine-ts/mcp/node",
    );
    for (const host of ["*.claude.ai", "claude.*", "*"]) {
      expect(create({}, { allowedClientHosts: ["claude.ai", host] })).toThrow(
        new TypeError("oauth.allowedClientHosts does not support wildcards: list each hostname"),
      );
    }
  });
});

/** A metadata server that answers only when the test releases it, and counts fetches in flight. */
function heldDocuments() {
  const fetched: string[] = [];
  const waiting: (() => void)[] = [];
  let open = 0;
  let peak = 0;
  const fetchClientMetadata: typeof fetch = async (input, init) => {
    const url = new Request(input, init).url;
    fetched.push(url);
    open++;
    peak = Math.max(peak, open);
    await new Promise<void>((resolve) => waiting.push(resolve));
    open--;
    return Response.json({ client_id: url, redirect_uris: [CLAUDE_REDIRECT] });
  };
  return {
    fetchClientMetadata,
    fetched,
    open: () => open,
    peak: () => peak,
    release: () => {
      for (const resume of waiting.splice(0)) resume();
    },
  };
}

function authorizePage({ handle, redmine }: Setup, clientId: string): Promise<Response> {
  return browser(handle, ORIGIN, redmine).send(
    authorizeUrl({
      response_type: "code",
      client_id: clientId,
      redirect_uri: CLAUDE_REDIRECT,
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
    }),
  );
}

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, at) => `https://${prefix}-${at}.example/meta.json`);

describe("metadata document fetches", () => {
  it("fetches at most 8 documents at once, and answers the rest 503 to retry", async () => {
    const held = heldDocuments();
    const setupped = setup({}, { fetchClientMetadata: held.fetchClientMetadata });
    const clients = ids("client", 12);
    const answers = new Map<string, Response>();
    const pages = clients.map(async (id) => {
      answers.set(id, await authorizePage(setupped, id));
    });
    await vi.waitFor(() => expect(answers.size).toBe(4));
    expect(held.open()).toBe(8);
    const refused = [...answers.keys()];
    for (const page of answers.values()) {
      expect(page.status).toBe(503);
      expect(page.headers.get("retry-after")).toBe("5");
      expect(await page.text()).toContain(
        "The server is busy checking clients. Reload this page in a moment.",
      );
    }
    expect(held.fetched.filter((url) => refused.includes(url))).toEqual([]);
    held.release();
    await Promise.all(pages);
    expect([...answers.values()].filter((page) => page.status === 200)).toHaveLength(8);
    expect(held.peak()).toBe(8);

    // A refusal for capacity says nothing about the client, so nothing about it is remembered.
    const retried = authorizePage(setupped, refused[0]!);
    await vi.waitFor(() => expect(held.open()).toBe(1));
    held.release();
    expect((await retried).status).toBe(200);
    expect(held.fetched.filter((url) => url === refused[0])).toHaveLength(1);
  });

  it("shares one fetch between concurrent sign-ins of the same client", async () => {
    const held = heldDocuments();
    const setupped = setup({}, { fetchClientMetadata: held.fetchClientMetadata });
    const client = ids("shared", 1)[0]!;
    const pages = Array.from({ length: 20 }, () => authorizePage(setupped, client));
    await vi.waitFor(() => expect(held.open()).toBe(1));
    held.release();
    expect((await Promise.all(pages)).map(({ status }) => status)).toEqual(Array(20).fill(200));
    expect(held.fetched).toEqual([client]);
  });

  it("serves a cached client while every slot is taken, and one fetched within the hour", async () => {
    const held = heldDocuments();
    let claudeFetches = 0;
    const setupped = setup(
      {},
      {
        fetchClientMetadata: (input, init) => {
          if (new Request(input, init).url !== CLAUDE) return held.fetchClientMetadata(input, init);
          claudeFetches++;
          return Promise.resolve(
            Response.json({ client_id: CLAUDE, redirect_uris: [CLAUDE_REDIRECT] }),
          );
        },
      },
    );
    const fill = async (prefix: string) => {
      const pages = ids(prefix, 8).map((id) => authorizePage(setupped, id));
      await vi.waitFor(() => expect(held.open()).toBe(8));
      return pages;
    };
    const drain = async (pages: Promise<Response>[]) => {
      held.release();
      await Promise.all(pages);
    };
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();

    let filling = await fill("fresh");
    expect((await authorizePage(setupped, ids("other", 1)[0]!)).status).toBe(503);
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(200);
    await drain(filling);

    vi.setSystemTime(start + 10 * 60_000);
    filling = await fill("stale");
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(200);
    await drain(filling);
    expect(claudeFetches).toBe(1);

    vi.setSystemTime(start + 61 * 60_000);
    filling = await fill("old");
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(503);
    await drain(filling);
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(200);
    expect(claudeFetches).toBe(2);
  });

  it("caches no failure or refusal, so bad URLs on a host never block its real client", async () => {
    const wrongId = "https://claude.ai/wrong-id";
    const flood = Array.from({ length: 8 }, (_, at) => `https://claude.ai/nope-${at}`);
    const documents = new Map<string, unknown>([
      [CLAUDE, { client_id: CLAUDE, redirect_uris: [CLAUDE_REDIRECT] }],
      [wrongId, { client_id: "https://claude.ai/someone-else", redirect_uris: [CLAUDE_REDIRECT] }],
    ]);
    const fetched: string[] = [];
    let gate: Promise<void> | undefined;
    const setupped = setup(
      {},
      {
        fetchClientMetadata: async (input, init) => {
          const url = new Request(input, init).url;
          fetched.push(url);
          await gate;
          return documents.has(url)
            ? Response.json(documents.get(url))
            : new Response(null, { status: 404 });
        },
      },
    );
    const times = (url: string) => fetched.filter((one) => one === url).length;
    let release!: () => void;
    gate = new Promise((resolve) => (release = resolve));
    const flooding = flood.map((clientId) => authorizePage(setupped, clientId));
    await vi.waitFor(() => expect(fetched).toHaveLength(8));
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(503);
    expect(times(CLAUDE)).toBe(0);
    release();
    gate = undefined;
    for (const page of await Promise.all(flooding)) expect(page.status).toBe(400);
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(200);
    expect(times(CLAUDE)).toBe(1);

    const failed = flood[0]!;
    expect(await (await authorizePage(setupped, failed)).text()).toContain("could not be fetched");
    expect(await (await authorizePage(setupped, wrongId)).text()).toContain(
      "names another client_id",
    );
    expect(await (await authorizePage(setupped, wrongId)).text()).toContain(
      "names another client_id",
    );
    expect([times(failed), times(wrongId)]).toEqual([2, 2]);
    documents.set(failed, { client_id: failed, redirect_uris: [CLAUDE_REDIRECT] });
    expect((await authorizePage(setupped, failed)).status).toBe(200);
    expect(times(failed)).toBe(3);
  });

  it("drops a kept document whose next fetch fails, so a busy server does not serve it", async () => {
    const held = heldDocuments();
    let claudeStatus = 200;
    const setupped = setup(
      {},
      {
        fetchClientMetadata: (input, init) => {
          if (new Request(input, init).url !== CLAUDE) return held.fetchClientMetadata(input, init);
          return Promise.resolve(
            claudeStatus === 200
              ? Response.json({ client_id: CLAUDE, redirect_uris: [CLAUDE_REDIRECT] })
              : new Response(null, { status: claudeStatus }),
          );
        },
      },
    );
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    claudeStatus = 404;
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(400);
    const filling = ids("fill", 8).map((id) => authorizePage(setupped, id));
    await vi.waitFor(() => expect(held.open()).toBe(8));
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(503);
    held.release();
    await Promise.all(filling);
  });

  it("frees the slot of a fetch that never settles, as a cancelled request's fetch on Workers", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const fetched: string[] = [];
    const starts: number[] = [];
    const setupped = setup(
      {},
      {
        fetchClientMetadata: (input, init) => {
          fetched.push(new Request(input, init).url);
          starts.push(Date.now());
          return new Promise<Response>(() => {});
        },
      },
    );
    const answered: Response[] = [];
    const stuck = ids("stuck", 8).map(async (id) => {
      const page = await authorizePage(setupped, id);
      answered.push(page);
      return page;
    });
    await vi.waitFor(() => expect(fetched).toHaveLength(8));
    const next = ids("next", 1)[0]!;
    expect((await authorizePage(setupped, next)).status).toBe(503);
    // A live fetch gives up at 5 seconds, so a stuck one holds its slot for a second past that.
    await vi.advanceTimersByTimeAsync(Math.min(...starts) + 5999 - Date.now());
    expect(answered).toEqual([]);
    expect((await authorizePage(setupped, next)).status).toBe(503);
    await vi.advanceTimersByTimeAsync(Math.max(...starts) + 6000 - Date.now());
    // The stuck fetches say nothing about their clients, so their sign-ins may retry.
    for (const page of await Promise.all(stuck)) {
      expect(page.status).toBe(503);
      expect(page.headers.get("retry-after")).toBe("5");
    }
    void authorizePage(setupped, next);
    await vi.waitFor(() => expect(fetched).toContain(next));
  });

  it("answers sign-ins that share a fetch that never settles with the copy fetched within the hour, or else 503", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    let hang = true;
    const starts: number[] = [];
    const setupped = setup(
      {},
      {
        fetchClientMetadata: () => {
          starts.push(Date.now());
          return hang
            ? new Promise<Response>(() => {})
            : Promise.resolve(
                Response.json({ client_id: CLAUDE, redirect_uris: [CLAUDE_REDIRECT] }),
              );
        },
      },
    );
    const answered: Response[] = [];
    const page = async () => answered.push(await authorizePage(setupped, CLAUDE));
    void page();
    await vi.waitFor(() => expect(starts).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(starts[0]! + 3000 - Date.now());
    void page();
    // The second sign-in joined 3 seconds in, and waits only as long as the fetch has left.
    await vi.advanceTimersByTimeAsync(starts[0]! + 6000 - Date.now());
    expect(answered.map(({ status }) => status)).toEqual([503, 503]);
    expect(answered[1]!.headers.get("retry-after")).toBe("5");
    expect(starts).toHaveLength(1);

    hang = false;
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(200);
    expect(starts).toHaveLength(2);
    expect(vi.getTimerCount(), "a settled fetch leaves no timer").toBe(0);

    vi.setSystemTime(Date.now() + 6 * 60_000);
    hang = true;
    const stale = [authorizePage(setupped, CLAUDE), authorizePage(setupped, CLAUDE)];
    await vi.advanceTimersByTimeAsync(6000);
    expect((await Promise.all(stale)).map(({ status }) => status)).toEqual([200, 200]);
    expect(starts).toHaveLength(3);
  });

  it("keeps sharing a client's newer fetch when an older one lands after its time", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const answers: ((response: Response) => void)[] = [];
    const setupped = setup(
      {},
      { fetchClientMetadata: () => new Promise<Response>((resolve) => answers.push(resolve)) },
    );
    const lapsed = authorizePage(setupped, CLAUDE);
    await vi.advanceTimersByTimeAsync(6000);
    expect((await lapsed).status).toBe(503);
    const newer = authorizePage(setupped, CLAUDE);
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    answers[0]!(new Response(null, { status: 404 }));
    await vi.advanceTimersByTimeAsync(0);
    const sharing = authorizePage(setupped, CLAUDE);
    await vi.advanceTimersByTimeAsync(0);
    expect(answers).toHaveLength(2);
    answers[1]!(Response.json({ client_id: CLAUDE, redirect_uris: [CLAUDE_REDIRECT] }));
    expect((await Promise.all([newer, sharing])).map(({ status }) => status)).toEqual([200, 200]);
  });

  it("keeps a client's newer document when an older fetch of it fails after its time", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const answers: ((response: Response) => void)[] = [];
    let fetches = 0;
    const document = () => Response.json({ client_id: CLAUDE, redirect_uris: [CLAUDE_REDIRECT] });
    const setupped = setup(
      {},
      {
        fetchClientMetadata: () =>
          ++fetches <= 2
            ? new Promise<Response>((resolve) => answers.push(resolve))
            : Promise.resolve(document()),
      },
    );
    const lapsed = authorizePage(setupped, CLAUDE);
    await vi.advanceTimersByTimeAsync(6000);
    expect((await lapsed).status).toBe(503);
    const newer = authorizePage(setupped, CLAUDE);
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    answers[1]!(document());
    expect((await newer).status).toBe(200);
    answers[0]!(new Response(null, { status: 404 }));
    await vi.advanceTimersByTimeAsync(0);
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(200);
    expect(fetches).toBe(2);
  });

  it("keeps the 256 newest documents, and a refetched one counts as new", async () => {
    const setupped = setup();
    const others = ids("kept", 256);
    for (const id of others) {
      setupped.documents.set(id, { client_id: id, redirect_uris: [CLAUDE_REDIRECT] });
    }
    const admitted = async (id: string) =>
      expect((await authorizePage(setupped, id)).status).toBe(200);
    const times = (url: string) => setupped.fetched.filter((one) => one === url).length;
    await admitted(CLAUDE);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    for (const id of others.slice(0, 254)) await admitted(id);
    await admitted(CLAUDE);
    // 255 documents are held. Two more fill the map and push out its oldest, no longer claude.ai.
    for (const id of others.slice(254)) await admitted(id);
    await admitted(CLAUDE);
    await admitted(others[0]!);
    expect([times(CLAUDE), times(others[0]!)]).toEqual([2, 2]);
  });

  it("answers 400 when a document's body breaks off, as the fetch timeout ends a stalled one", async () => {
    const setupped = setup(
      {},
      {
        fetchClientMetadata: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("{"));
                controller.error(new DOMException("The operation was aborted", "AbortError"));
              },
            }),
          ),
      },
    );
    const page = await authorizePage(setupped, "https://stalled.example/meta.json");
    expect(page.status).toBe(400);
    expect(await page.text()).toContain("its metadata document could not be fetched");
    expect(setupped.errors).toEqual([]);
  });
});

const CHATGPT = "https://chatgpt.com/oauth/client.json";
const CHATGPT_REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const CHATGPT_JWKS = "https://chatgpt.com/oauth/jwks.json";
const JWT_BEARER = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

/** ChatGPT's metadata document as chatgpt.com served it on 2026-10-26. */
const CHATGPT_DOCUMENT = {
  client_id: CHATGPT,
  client_uri: "https://chatgpt.com/",
  redirect_uris: [CHATGPT_REDIRECT],
  token_endpoint_auth_method: "private_key_jwt",
  token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  client_name: "ChatGPT",
  logo_uri: "https://persistent.oaistatic.com/sonic/misc/openai-logo.png",
  token_endpoint_auth_signing_alg: "RS256",
  jwks_uri: CHATGPT_JWKS,
};

/** ChatGPT's key set publishes one RSA key under this kid. */
const CHATGPT_KID = "cimd-20260428030119";

/** A handler that serves ChatGPT's document, or `document`, with `keys` at its jwks_uri. */
function keyed(keys: object[], document: object = CHATGPT_DOCUMENT, oauth = {}): Setup {
  const setupped = setup({}, oauth);
  setupped.documents.set(CHATGPT, document);
  setupped.documents.set(CHATGPT_JWKS, { keys });
  return setupped;
}

/** A client assertion as ChatGPT signs one: kid in the header, iss and sub its client_id, aud the issuer. */
function assertion(
  key: ClientKey,
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): string {
  const at = Math.floor(Date.now() / 1000);
  return signJwt(
    { alg: key.alg, kid: key.kid, typ: "JWT", ...header },
    {
      iss: CHATGPT,
      sub: CHATGPT,
      aud: PUBLIC_URL,
      iat: at,
      exp: at + 300,
      jti: randomBytes(16).toString("base64url"),
      ...claims,
    },
    key.privateKey,
  );
}

const proof = (jwt: string) => ({ client_assertion_type: JWT_BEARER, client_assertion: jwt });

async function chatGptSignIn(setupped: Setup) {
  return signIn(setupped, { clientId: CHATGPT, redirectUri: CHATGPT_REDIRECT });
}

async function grant(handle: Handler, params: Record<string, string>) {
  const response = await form(handle, TOKEN, params);
  return {
    status: response.status,
    body: (await response.json()) as Issued & Record<string, string>,
  };
}

function redeem(
  setupped: Setup,
  signed: Awaited<ReturnType<typeof chatGptSignIn>>,
  params: Record<string, string>,
) {
  return grant(setupped.handle, {
    grant_type: "authorization_code",
    code: signed.landed.searchParams.get("code")!,
    code_verifier: signed.verifier,
    ...params,
  });
}

function renew(setupped: Setup, refreshToken: string, params: Record<string, string>) {
  return grant(setupped.handle, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    ...params,
  });
}

const fetchesOf = (setupped: Setup, url: string) =>
  setupped.fetched.filter((fetched) => fetched === url).length;

describe("private_key_jwt clients", () => {
  it.each([
    ["RS256", "jwks_uri"],
    ["PS256", "jwks_uri"],
    ["ES256", "jwks_uri"],
    ["RS256", "jwks"],
    ["PS256", "jwks"],
    ["ES256", "jwks"],
  ] as [SigningAlg, string][])(
    "signs in a %s client whose keys are in its %s, and asks for an assertion at every refresh",
    async (alg, source) => {
      const key = clientKey(alg);
      const setupped = keyed([key.jwk], {
        client_id: CHATGPT,
        redirect_uris: [CHATGPT_REDIRECT],
        token_endpoint_auth_method: "private_key_jwt",
        token_endpoint_auth_signing_alg: alg,
        ...(source === "jwks" ? { jwks: { keys: [key.jwk] } } : { jwks_uri: CHATGPT_JWKS }),
      });
      const signed = await chatGptSignIn(setupped);
      const issued = await redeem(setupped, signed, {
        client_id: CHATGPT,
        ...proof(assertion(key)),
      });
      expect(issued.status, JSON.stringify(issued.body)).toBe(200);
      const bearer = (token: string) =>
        callTool(setupped.handle, { Authorization: `Bearer ${token}` });
      expect((await bearer(issued.body.access_token)).status).toBe(200);

      const bare = await renew(setupped, issued.body.refresh_token, { client_id: CHATGPT });
      expect([bare.status, bare.body.error]).toEqual([401, "invalid_client"]);
      const renewed = await renew(setupped, issued.body.refresh_token, proof(assertion(key)));
      expect(renewed.status, JSON.stringify(renewed.body)).toBe(200);
      expect((await bearer(renewed.body.access_token)).status).toBe(200);
      // The rotated refresh token is bound to the key as well.
      const again = await renew(setupped, renewed.body.refresh_token, { client_id: CHATGPT });
      expect([again.status, again.body.error]).toEqual([401, "invalid_client"]);
      expect(
        (await renew(setupped, renewed.body.refresh_token, proof(assertion(key)))).status,
      ).toBe(200);
      // A key set is fetched once for the whole sign-in; inline keys are never fetched.
      expect(fetchesOf(setupped, CHATGPT_JWKS)).toBe(source === "jwks_uri" ? 1 : 0);
      expect(fetchesOf(setupped, CHATGPT)).toBe(1);
    },
  );

  it("takes ChatGPT's metadata document and an assertion shaped as ChatGPT signs one", async () => {
    const key = clientKey("RS256", { kid: CHATGPT_KID });
    const setupped = keyed([key.jwk]);
    const person = browser(setupped.handle, ORIGIN, setupped.redmine);
    const page = await person.send(
      authorizeUrl({
        response_type: "code",
        client_id: CHATGPT,
        redirect_uri: CHATGPT_REDIRECT,
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
      }),
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("ChatGPT");

    const signed = await chatGptSignIn(setupped);
    const issued = await redeem(setupped, signed, {
      redirect_uri: CHATGPT_REDIRECT,
      client_id: CHATGPT,
      resource: PUBLIC_URL,
      ...proof(assertion(key)),
    });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    // The assertion names the client, so client_id may be left out.
    const renewed = await renew(setupped, issued.body.refresh_token, proof(assertion(key)));
    expect(renewed.status, JSON.stringify(renewed.body)).toBe(200);
    // The token endpoint URL also names this server as an audience.
    expect(
      (await renew(setupped, renewed.body.refresh_token, proof(assertion(key, { aud: TOKEN }))))
        .status,
    ).toBe(200);
  });

  it("refuses an assertion that fails any check with 401 invalid_client, and spends nothing", async () => {
    const key = clientKey("RS256", { kid: CHATGPT_KID });
    // Without alg on the key, only the document's token_endpoint_auth_signing_alg stops PS256.
    const setupped = keyed([{ ...key.jwk, alg: undefined }]);
    const signed = await chatGptSignIn(setupped);
    const at = Math.floor(Date.now() / 1000);
    const impostor = clientKey("RS256", { kid: CHATGPT_KID });
    const forged = (header: Record<string, unknown>) =>
      signJwt(
        { kid: CHATGPT_KID, ...header },
        { iss: CHATGPT, sub: CHATGPT, aud: PUBLIC_URL, exp: at + 300, jti: "forged" },
        header.alg === "HS256" ? key.publicKey : key.privateKey,
      );
    const other = "https://evil.example/client.json";
    const cases: [string, Record<string, string>, string][] = [
      ["no assertion", { client_id: CHATGPT }, "client_assertion"],
      [
        "another assertion type",
        {
          ...proof(assertion(key)),
          client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:saml2-bearer",
        },
        "client_assertion_type",
      ],
      ["not a JWT", proof("not.a.jwt"), "JWT"],
      ["another key under its kid", proof(assertion(impostor)), "signature"],
      ["alg none", proof(forged({ alg: "none" })), "alg"],
      ["HS256 keyed with the public key", proof(forged({ alg: "HS256" })), "alg"],
      ["another alg than the document's", proof(assertion(key, {}, { alg: "PS256" })), "alg"],
      ["iss other than sub", proof(assertion(key, { iss: other })), "iss"],
      [
        "iss and sub of another client",
        { client_id: CHATGPT, ...proof(assertion(key, { iss: other, sub: other })) },
        "client_id",
      ],
      ["client_id other than iss", { client_id: other, ...proof(assertion(key)) }, "client_id"],
      ["another aud", proof(assertion(key, { aud: "https://other.example/mcp" })), "aud"],
      ["the authorization endpoint as aud", proof(assertion(key, { aud: AUTHORIZE })), "aud"],
      ["no exp", proof(assertion(key, { exp: undefined })), "exp"],
      ["exp passed", proof(assertion(key, { exp: at - 120 })), "exp"],
      ["exp over an hour away", proof(assertion(key, { exp: at + 3600 + 120 })), "exp"],
      ["nbf ahead", proof(assertion(key, { nbf: at + 120 })), "nbf"],
      ["iat ahead", proof(assertion(key, { iat: at + 120 })), "iat"],
      ["no jti", proof(assertion(key, { jti: undefined })), "jti"],
    ];
    for (const [label, params, names] of cases) {
      const refused = await redeem(setupped, signed, params);
      expect([label, refused.status, refused.body.error]).toEqual([label, 401, "invalid_client"]);
      expect([label, refused.body.error_description]).toEqual([
        label,
        expect.stringContaining(names),
      ]);
      expect(refused.body.error_description).not.toContain(params.client_assertion ?? "\0");
    }
    expect(setupped.redmine.tokenRequests).toEqual([]);
    const issued = await redeem(setupped, signed, proof(assertion(key)));
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
  });

  it("takes each assertion once", async () => {
    const key = clientKey("ES256", { kid: CHATGPT_KID });
    const setupped = keyed([key.jwk], {
      ...CHATGPT_DOCUMENT,
      token_endpoint_auth_signing_alg: "ES256",
    });
    const once = assertion(key);
    const issued = await redeem(setupped, await chatGptSignIn(setupped), proof(once));
    expect(issued.status).toBe(200);
    const replayed = await renew(setupped, issued.body.refresh_token, proof(once));
    expect([replayed.status, replayed.body.error]).toEqual([401, "invalid_client"]);
    expect(replayed.body.error_description).toContain("already used");
    expect((await renew(setupped, issued.body.refresh_token, proof(assertion(key)))).status).toBe(
      200,
    );
  });

  it("refuses an assertion from a public client, which proves itself with PKCE alone", async () => {
    const setupped = setup();
    const key = clientKey("ES256");
    const signed = await signIn(setupped);
    const claims = { iss: CLAUDE, sub: CLAUDE };
    const refused = await redeem(setupped, signed, {
      client_id: CLAUDE,
      ...proof(assertion(key, claims)),
    });
    expect([refused.status, refused.body.error]).toEqual([401, "invalid_client"]);
    // Without client_id, the assertion's sub names the client.
    const named = await redeem(setupped, signed, proof(assertion(key, claims)));
    expect([named.status, named.body.error]).toEqual([401, "invalid_client"]);
    const issued = await redeem(setupped, signed, { client_id: CLAUDE });
    expect(issued.status).toBe(200);
    const renewed = await renew(setupped, issued.body.refresh_token, {
      client_id: CLAUDE,
      ...proof(assertion(key, claims)),
    });
    expect([renewed.status, renewed.body.error]).toEqual([401, "invalid_client"]);
    expect(setupped.fetched).toEqual([CLAUDE]);
  });

  it("refuses an RSA key under 2048 bits", async () => {
    const key = clientKey("RS256", { kid: CHATGPT_KID, bits: 1024 });
    const setupped = keyed([key.jwk]);
    const refused = await redeem(setupped, await chatGptSignIn(setupped), proof(assertion(key)));
    expect([refused.status, refused.body.error]).toEqual([401, "invalid_client"]);
  });

  it("refetches a key set for an unknown kid at most once a minute, so a rotated key works", async () => {
    const first = clientKey("RS256", { kid: "first" });
    const setupped = keyed([first.jwk]);
    const issued = await redeem(setupped, await chatGptSignIn(setupped), proof(assertion(first)));
    expect(issued.status).toBe(200);
    expect(fetchesOf(setupped, CHATGPT_JWKS)).toBe(1);

    const second = clientKey("RS256", { kid: "second" });
    setupped.documents.set(CHATGPT_JWKS, { keys: [second.jwk] });
    let refreshToken = issued.body.refresh_token;
    const attempt = async (jwt: string) => {
      const answer = await renew(setupped, refreshToken, proof(jwt));
      if (answer.status === 200) refreshToken = answer.body.refresh_token;
      return [answer.status, answer.body.error];
    };
    const random = () => assertion(second, {}, { kid: randomBytes(8).toString("hex") });
    // The set was fetched under a minute ago, so neither random kids nor the new key refetch it.
    for (let at = 0; at < 5; at++) expect(await attempt(random())).toEqual([401, "invalid_client"]);
    expect(await attempt(assertion(second))).toEqual([401, "invalid_client"]);
    expect(fetchesOf(setupped, CHATGPT_JWKS)).toBe(1);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    for (let at = 0; at < 5; at++) expect(await attempt(random())).toEqual([401, "invalid_client"]);
    expect(fetchesOf(setupped, CHATGPT_JWKS)).toBe(2);
    expect(await attempt(assertion(second))).toEqual([200, undefined]);
    expect(await attempt(assertion(first))).toEqual([401, "invalid_client"]);
    expect(fetchesOf(setupped, CHATGPT_JWKS)).toBe(2);

    // A key set is kept for five minutes, then fetched again.
    vi.setSystemTime(Date.now() + 5 * 60_000);
    expect(await attempt(assertion(second))).toEqual([200, undefined]);
    expect(fetchesOf(setupped, CHATGPT_JWKS)).toBe(3);
  });

  it("answers while a key set cannot be fetched, and remembers no failure", async () => {
    const key = clientKey("RS256", { kid: CHATGPT_KID });
    let answer = "missing";
    const calls: RequestInit[] = [];
    const setupped = setup(
      {},
      {
        fetchClientMetadata: async (input, init) => {
          const url = new Request(input, init).url;
          if (url === CHATGPT) return Response.json(CHATGPT_DOCUMENT);
          calls.push(init!);
          if (answer === "missing") return new Response(null, { status: 404 });
          if (answer === "moved") {
            return new Response(null, {
              status: 302,
              headers: { location: "http://169.254.169.254/" },
            });
          }
          if (answer === "slow") throw new DOMException("The operation timed out.", "TimeoutError");
          if (answer === "big") return Response.json({ keys: [key.jwk], pad: "x".repeat(17_000) });
          if (answer === "broken") return new Response("{ not json");
          return Response.json({ keys: [key.jwk] });
        },
      },
    );
    const signed = await chatGptSignIn(setupped);
    const outcomes: [string, number, string][] = [
      ["missing", 502, "server_error"],
      ["moved", 502, "server_error"],
      ["slow", 502, "server_error"],
      ["big", 401, "invalid_client"],
      ["broken", 401, "invalid_client"],
    ];
    for ([answer] of outcomes) {
      const refused = await redeem(setupped, signed, proof(assertion(key)));
      expect([answer, refused.status, refused.body.error]).toEqual(
        outcomes.find(([name]) => name === answer),
      );
      expect(refused.body.error_description).toContain("key set");
    }
    answer = "ok";
    expect((await redeem(setupped, signed, proof(assertion(key)))).status).toBe(200);
    expect(calls).toHaveLength(outcomes.length + 1);
    expect(
      calls.every((init) => init.redirect === "manual" && init.signal instanceof AbortSignal),
    ).toBe(true);
    expect(setupped.redmine.tokenRequests).toHaveLength(1);
  });

  it("fails closed when the client's document no longer declares private_key_jwt, or cannot be fetched", async () => {
    const key = clientKey("RS256", { kid: CHATGPT_KID });
    const setupped = keyed([key.jwk]);
    const issued = await redeem(setupped, await chatGptSignIn(setupped), proof(assertion(key)));
    expect(issued.status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    setupped.documents.set(CHATGPT, { ...CHATGPT_DOCUMENT, token_endpoint_auth_method: "none" });
    const downgraded = await renew(setupped, issued.body.refresh_token, proof(assertion(key)));
    expect([downgraded.status, downgraded.body.error]).toEqual([401, "invalid_client"]);
    expect(downgraded.body.error_description).toContain("private_key_jwt");
    expect((await renew(setupped, issued.body.refresh_token, { client_id: CHATGPT })).status).toBe(
      401,
    );
    setupped.documents.delete(CHATGPT);
    vi.setSystemTime(Date.now() + 6 * 60_000);
    const gone = await renew(setupped, issued.body.refresh_token, proof(assertion(key)));
    expect([gone.status, gone.body.error]).toEqual([502, "server_error"]);
    expect(gone.body.error_description).toContain("metadata document");
    setupped.documents.set(CHATGPT, CHATGPT_DOCUMENT);
    expect((await renew(setupped, issued.body.refresh_token, proof(assertion(key)))).status).toBe(
      200,
    );
  });

  it("answers 503 to retry when the client's document needs a fetch and every slot is taken", async () => {
    const key = clientKey("RS256", { kid: CHATGPT_KID });
    const held = heldDocuments();
    let documentFetches = 0;
    const setupped = setup(
      {},
      {
        fetchClientMetadata: (input, init) => {
          const url = new Request(input, init).url;
          if (url === CHATGPT) {
            documentFetches++;
            return Promise.resolve(Response.json(CHATGPT_DOCUMENT));
          }
          if (url === CHATGPT_JWKS) return Promise.resolve(Response.json({ keys: [key.jwk] }));
          return held.fetchClientMetadata(input, init);
        },
      },
    );
    const issued = await redeem(setupped, await chatGptSignIn(setupped), proof(assertion(key)));
    expect(issued.status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61 * 60_000);
    const pages = ids("flood", 8).map((id) => authorizePage(setupped, id));
    await vi.waitFor(() => expect(held.open()).toBe(8));
    const busy = await form(setupped.handle, TOKEN, {
      grant_type: "refresh_token",
      refresh_token: issued.body.refresh_token,
      ...proof(assertion(key)),
    });
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("5");
    expect(await busy.json()).toMatchObject({ error: "temporarily_unavailable" });
    held.release();
    await Promise.all(pages);
    expect((await renew(setupped, issued.body.refresh_token, proof(assertion(key)))).status).toBe(
      200,
    );
    expect(documentFetches).toBe(2);
  });
});

describe("API key sign-in, the opt-in fallback", () => {
  const keySetup = () => setup({}, { redmineApp: undefined, apiKeyLogin: true } as never);

  async function consent(handle: Handler, redmine: FakeRedmine) {
    const { verifier, challenge } = pkce();
    const person = browser(handle, ORIGIN, redmine);
    const page = await person.send(
      authorizeUrl({
        response_type: "code",
        client_id: CLAUDE,
        redirect_uri: CLAUDE_REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "k1",
      }),
    );
    const html = await page.text();
    const submit = (apiKey: string, value = consentValue(html)) =>
      person.send(new URL(AUTHORIZE), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ consent: value, api_key: apiKey, decision: "allow" }),
      });
    return { html, page, submit, verifier };
  }

  it("checks the key at Redmine before it issues a code, and never sends the person to Redmine", async () => {
    const { handle, redmine } = keySetup();
    const { html, page, submit } = await consent(handle, redmine);
    expect(html).toMatch(/name="api_key"\s+type="password"/);
    expect(html).toContain(`href="${REDMINE_PUBLIC}my/account"`);
    expect(html).toMatch(/the address bar shows\s+<strong>mcp\.example\.com<\/strong>/);
    expect(page.headers.get("content-security-policy")).toContain("form-action 'self'");

    const wrong = await submit("not-a-key");
    expect(wrong.status).toBe(400);
    const retry = await wrong.text();
    expect(retry).toContain("Redmine does not accept this key.");
    // The page that was answered is spent; the retry uses the page that came back.
    expect(await (await submit("jsmith-api-key")).text()).toContain("already sent");
    const right = await submit("jsmith-api-key", consentValue(retry));
    expect(right.status).toBe(303);
    const location = new URL(right.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(CLAUDE_REDIRECT);
    expect(location.searchParams.get("state")).toBe("k1");
    expect(location.searchParams.get("iss")).toBe(PUBLIC_URL);
    expect(redmine.authorizeRequests).toEqual([]);
    expect((await direct(handle)(`${PUBLIC_URL}/oauth/redmine/callback`)).status).toBe(404);
    expect(redmine.apiCalls.map((call) => [call.path, call.key])).toEqual([
      ["/users/current.json", "not-a-key"],
      ["/users/current.json", "jsmith-api-key"],
    ]);
  });

  it("lets one sign-in try five keys, counted on pages that work once", async () => {
    const { handle, redmine } = keySetup();
    const { html, submit } = await consent(handle, redmine);
    let page = html;
    // An empty field asks Redmine nothing, so it does not count.
    let answer = await submit("", consentValue(page));
    page = await answer.text();
    expect(page).toContain("Paste your API key.");
    for (let tried = 1; tried < 5; tried++) {
      answer = await submit(`wrong-${tried}`, consentValue(page));
      page = await answer.text();
      expect(page).toContain("Redmine does not accept this key.");
    }
    answer = await submit("wrong-5", consentValue(page));
    expect(answer.status).toBe(400);
    expect(await answer.text()).toContain("Too many keys were tried on this sign-in.");
    // Going back to an earlier page does not reset the count: that page was already answered.
    expect(await (await submit("jsmith-api-key", consentValue(html))).text()).toContain(
      "already sent",
    );
    expect(redmine.apiCalls.filter((call) => call.path === "/users/current.json")).toHaveLength(5);
  });

  it("checks at most four keys at Redmine at once, and asks the fifth to try again", async () => {
    const redmine = fakeRedmine();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let waiting = 0;
    const slow: typeof fetch = async (input, init) => {
      if (new Request(input, init).url.endsWith("/users/current.json")) {
        waiting++;
        await held;
      }
      return redmine.fetch(input, init);
    };
    const { handle } = setup({ fetch: slow }, {
      redmineApp: undefined,
      apiKeyLogin: true,
    } as never);
    const pages = await Promise.all(Array.from({ length: 5 }, () => consent(handle, redmine)));
    const running = pages.slice(0, 4).map(({ submit }) => submit("wrong-key"));
    await vi.waitFor(() => expect(waiting).toBe(4));
    const fifth = await pages[4]!.submit("another-key");
    expect(fifth.status).toBe(503);
    const busy = await fifth.text();
    expect(busy).toContain("Many keys are being checked right now. Try again in a moment.");
    release();
    expect((await Promise.all(running)).map(({ status }) => status)).toEqual([400, 400, 400, 400]);
    // The busy page is a fresh page, so the person retries from it once Redmine is free.
    const retried = await pages[4]!.submit("jsmith-api-key", consentValue(busy));
    expect(retried.status).toBe(303);
  });

  it("answers a retried consent 503 to retry when its client needs a fetch and every slot is taken", async () => {
    const held = heldDocuments();
    let claudeStatus = 200;
    const fetchClientMetadata: typeof fetch = (input, init) => {
      if (new Request(input, init).url !== CLAUDE) return held.fetchClientMetadata(input, init);
      return Promise.resolve(
        claudeStatus === 200
          ? Response.json({ client_id: CLAUDE, redirect_uris: [CLAUDE_REDIRECT] })
          : new Response(null, { status: claudeStatus }),
      );
    };
    const setupped = setup({}, {
      redmineApp: undefined,
      apiKeyLogin: true,
      fetchClientMetadata,
    } as never);
    const { submit } = await consent(setupped.handle, setupped.redmine);
    // A failed refetch drops the kept copy, so the retry's own resolve needs a fetch.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    claudeStatus = 404;
    expect((await authorizePage(setupped, CLAUDE)).status).toBe(400);
    const filling = ids("fill", 8).map((id) => authorizePage(setupped, id));
    await vi.waitFor(() => expect(held.open()).toBe(8));
    const answer = await submit("");
    expect(answer.status).toBe(503);
    expect(answer.headers.get("retry-after")).toBe("5");
    expect(await answer.text()).toContain(
      "The server is busy checking clients, so this sign-in stops here.",
    );
    held.release();
    await Promise.all(filling);
  });

  it("frees the slot of a key check that never settles, as a cancelled request's check on Workers", async () => {
    const redmine = fakeRedmine();
    let stuck = 0;
    const hanging: typeof fetch = (input, init) => {
      if (new Request(input, init).headers.get("x-redmine-api-key") !== "stuck-key") {
        return redmine.fetch(input, init);
      }
      stuck++;
      return new Promise<Response>(() => {});
    };
    const { handle } = setup({ fetch: hanging }, {
      redmineApp: undefined,
      apiKeyLogin: true,
    } as never);
    const pages = await Promise.all(Array.from({ length: 5 }, () => consent(handle, redmine)));
    for (const { submit } of pages.slice(0, 4)) void submit("stuck-key");
    await vi.waitFor(() => expect(stuck).toBe(4));
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    const last = pages[4]!;
    let answer = await last.submit("jsmith-api-key");
    expect(answer.status).toBe(503);
    // At 8 seconds a live check has given up, so the stuck ones still count until the margin passes.
    vi.setSystemTime(start + 8000);
    answer = await last.submit("jsmith-api-key", consentValue(await answer.text()));
    expect(answer.status).toBe(503);
    vi.setSystemTime(start + 9000);
    answer = await last.submit("jsmith-api-key", consentValue(await answer.text()));
    expect(answer.status).toBe(303);
    expect(redmine.apiCalls.filter((call) => call.key === "jsmith-api-key")).toHaveLength(1);
  });

  it("with a store, refuses a browser that failed ten keys within the hour", async () => {
    const { handle, redmine } = setup({}, {
      redmineApp: undefined,
      apiKeyLogin: true,
      store: memoryGrantStore(),
    } as never);
    const person = browser(handle, ORIGIN, redmine);
    const signIn = async () =>
      (
        await person.send(
          authorizeUrl({
            response_type: "code",
            client_id: CLAUDE,
            redirect_uri: CLAUDE_REDIRECT,
            code_challenge: pkce().challenge,
            code_challenge_method: "S256",
          }),
        )
      ).text();
    const submit = (page: string, apiKey: string) =>
      person.send(new URL(AUTHORIZE), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          consent: consentValue(page),
          api_key: apiKey,
          decision: "allow",
        }),
      });
    // Two sign-ins of five wrong keys each, the most one sign-in may try.
    for (let round = 0; round < 2; round++) {
      let page = await signIn();
      for (let tried = 1; tried <= 5; tried++) {
        const answer = await submit(page, `wrong-${round}-${tried}`);
        page = await answer.text();
      }
      expect(page).toContain("Too many keys were tried on this sign-in.");
    }
    const third = await submit(await signIn(), "jsmith-api-key");
    expect(third.status).toBe(429);
    expect(await third.text()).toContain(
      "Too many keys were tried from this browser in the last hour.",
    );
    expect(redmine.apiCalls.filter((call) => call.path === "/users/current.json")).toHaveLength(10);
    // Another browser is not affected: the count is per browser, not a lockout of the account.
    const other = await consent(handle, redmine);
    expect((await other.submit("jsmith-api-key")).status).toBe(303);
  });

  it("says Redmine did not answer when that ends a sign-in", async () => {
    const redmine = fakeRedmine();
    const down: typeof fetch = async (input, init) => {
      if (new Request(input, init).url.endsWith("/users/current.json")) {
        throw new TypeError("fetch failed");
      }
      return redmine.fetch(input, init);
    };
    const { handle } = setup({ fetch: down }, {
      redmineApp: undefined,
      apiKeyLogin: true,
    } as never);
    const { html, submit } = await consent(handle, redmine);
    let page = html;
    for (let tried = 1; tried < 5; tried++) {
      const answer = await submit("jsmith-api-key", consentValue(page));
      expect(answer.status).toBe(503);
      page = await answer.text();
      expect(page).toContain("Redmine did not answer. Try again in a moment.");
    }
    const last = await submit("jsmith-api-key", consentValue(page));
    expect(last.status).toBe(503);
    const text = await last.text();
    expect(text).toContain("Redmine did not answer, so this sign-in stops here.");
    expect(text).not.toContain("Too many keys");
  });

  it("seals the key into tokens, refuses a replayed code, and ends with a reset key", async () => {
    const { handle, redmine } = keySetup();
    const { submit, verifier } = await consent(handle, redmine);
    const code = new URL(
      (await submit("jsmith-api-key")).headers.get("location")!,
    ).searchParams.get("code")!;
    const exchange = () =>
      form(handle, TOKEN, {
        grant_type: "authorization_code",
        code,
        redirect_uri: CLAUDE_REDIRECT,
        client_id: CLAUDE,
        code_verifier: verifier,
      });
    const issued = (await (await exchange()).json()) as Issued;
    expect(issued.access_token).not.toContain("jsmith-api-key");
    expect(await (await exchange()).json()).toMatchObject({
      error: "invalid_grant",
      error_description: "The code was already used a moment ago",
    });

    const called = await callTool(handle, { Authorization: `Bearer ${issued.access_token}` });
    expect(await called.text()).toContain("New for jsmith");
    expect(redmine.apiCalls.at(-1)).toMatchObject({ key: "jsmith-api-key", authorization: null });

    const refresh = () =>
      form(handle, TOKEN, {
        grant_type: "refresh_token",
        refresh_token: issued.refresh_token,
        client_id: CLAUDE,
      });
    expect((await refresh()).status).toBe(200);
    redmine.rotateKey("jsmith-api-key", "new-key");
    const refused = await callTool(handle, { Authorization: `Bearer ${issued.access_token}` });
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect(await (await refresh()).json()).toMatchObject({
      error: "invalid_grant",
      error_description: "Redmine no longer accepts the API key",
    });
  });

  it("ends key-based grants when the server switches to Redmine sign-in", async () => {
    const shared = secret();
    const keys = setup({}, { secret: shared, redmineApp: undefined, apiKeyLogin: true } as never);
    const { submit, verifier } = await consent(keys.handle, keys.redmine);
    const code = new URL(
      (await submit("jsmith-api-key")).headers.get("location")!,
    ).searchParams.get("code")!;
    const issued = (await (
      await form(keys.handle, TOKEN, {
        grant_type: "authorization_code",
        code,
        redirect_uri: CLAUDE_REDIRECT,
        client_id: CLAUDE,
        code_verifier: verifier,
      })
    ).json()) as Issued;
    const switched = createRedmineMcpHandler({
      baseUrl: REDMINE_INTERNAL,
      fetch: keys.redmine.fetch,
      publicUrl: PUBLIC_URL,
      oauth: { secret: shared, redmineApp: REDMINE_APP, fetchClientMetadata: noMetadataFetch },
    });
    const refreshed = await form(switched, TOKEN, {
      grant_type: "refresh_token",
      refresh_token: issued.refresh_token,
      client_id: CLAUDE,
    });
    expect(await refreshed.json()).toMatchObject({ error: "invalid_grant" });
  });
});

describe("the grant store", () => {
  const DAY = 24 * 3600 * 1000;

  async function refresh(handle: Handler, token: string) {
    const response = await form(handle, TOKEN, {
      grant_type: "refresh_token",
      refresh_token: token,
      client_id: CLAUDE,
    });
    return {
      status: response.status,
      body: (await response.json()) as Issued & Record<string, string>,
    };
  }

  it("rotates refresh tokens: each works once, and a reused one ends the whole sign-in", async () => {
    const setupped = setup({}, { store: memoryGrantStore() });
    const first = await tokens(setupped);
    const second = await refresh(setupped.handle, first.refresh_token);
    expect(second.status).toBe(200);
    const bearer = (token: string) =>
      callTool(setupped.handle, { Authorization: `Bearer ${token}` });
    expect((await bearer(second.body.access_token)).status).toBe(200);

    // Within 30 seconds a second use is the client racing itself: refused, and the sign-in stays.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 5_000);
    expect((await refresh(setupped.handle, first.refresh_token)).body).toMatchObject({
      error: "invalid_grant",
      error_description: "The refresh token was already used a moment ago",
    });
    expect((await bearer(second.body.access_token)).status).toBe(200);

    // Later, someone replays it: refused, and every token of the sign-in ends.
    vi.setSystemTime(Date.now() + 26_000);
    expect((await refresh(setupped.handle, first.refresh_token)).body).toMatchObject({
      error: "invalid_grant",
      error_description:
        "The refresh token was already used; every token from this sign-in is ended",
    });
    expect((await bearer(second.body.access_token)).status).toBe(401);
    expect((await bearer(first.access_token)).status).toBe(401);
    expect((await refresh(setupped.handle, second.body.refresh_token)).body).toMatchObject({
      error: "invalid_grant",
      error_description: "This sign-in was ended. Sign in again.",
    });
  });

  /** An API-key sign-in up to the code. */
  async function keyCode(setupped: Setup) {
    const { verifier, challenge } = pkce();
    const person = browser(setupped.handle, ORIGIN, setupped.redmine);
    const page = await person.send(
      authorizeUrl({
        response_type: "code",
        client_id: CLAUDE,
        redirect_uri: CLAUDE_REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }),
    );
    const allowed = await person.send(new URL(AUTHORIZE), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        consent: consentValue(await page.text()),
        api_key: "jsmith-api-key",
        decision: "allow",
      }),
    });
    return { code: new URL(allowed.headers.get("location")!).searchParams.get("code")!, verifier };
  }

  async function exchange(handle: Handler, code: string, verifier: string) {
    const response = await form(handle, TOKEN, {
      grant_type: "authorization_code",
      code,
      client_id: CLAUDE,
      code_verifier: verifier,
    });
    return {
      status: response.status,
      body: (await response.json()) as Issued & Record<string, string>,
    };
  }

  /** The two sign-in methods with a store; Redmine keeps a used refresh token, as Doorkeeper does. */
  const methods = [
    ["API key", { redmineApp: undefined, apiKeyLogin: true }],
    ["Redmine", {}],
  ] as const;

  function racing(method: (typeof methods)[number][1]): Setup {
    const doorkeeper = fakeRedmine({ doorkeeper: true });
    const setupped = setup({ fetch: doorkeeper.fetch }, {
      ...method,
      store: memoryGrantStore(),
    } as never);
    return { ...setupped, redmine: doorkeeper };
  }

  async function signedIn(setupped: Setup, method: (typeof methods)[number][1]) {
    if (!("apiKeyLogin" in method)) return tokens(setupped);
    const { code, verifier } = await keyCode(setupped);
    return (await exchange(setupped.handle, code, verifier)).body;
  }

  it.each(methods)(
    "answers a refresh racing itself without ending the sign-in (%s)",
    async (_, method) => {
      const setupped = racing(method);
      const issued = await signedIn(setupped, method);
      // Two processes of one client saw the access token expire and refresh at once.
      const both = await Promise.all([
        refresh(setupped.handle, issued.refresh_token),
        refresh(setupped.handle, issued.refresh_token),
      ]);
      expect(both.map(({ status }) => status).sort((a, b) => a - b)).toEqual([200, 400]);
      const winner = both.find(({ status }) => status === 200)!;
      const loser = both.find(({ status }) => status === 400)!;
      expect(loser.body).toMatchObject({
        error: "invalid_grant",
        error_description: "The refresh token was already used a moment ago",
      });
      expect(
        (await callTool(setupped.handle, { Authorization: `Bearer ${winner.body.access_token}` }))
          .status,
      ).toBe(200);
      expect((await refresh(setupped.handle, winner.body.refresh_token)).status).toBe(200);
    },
  );

  it.each(methods)(
    "answers a code exchange racing itself without ending the sign-in (%s)",
    async (_, method) => {
      const setupped = racing(method);
      const flow =
        "apiKeyLogin" in method
          ? await keyCode(setupped)
          : await signIn(setupped).then(({ landed, verifier }) => ({
              code: landed.searchParams.get("code")!,
              verifier,
            }));
      const both = await Promise.all([
        exchange(setupped.handle, flow.code, flow.verifier),
        exchange(setupped.handle, flow.code, flow.verifier),
      ]);
      expect(both.map(({ status }) => status).sort((a, b) => a - b)).toEqual([200, 400]);
      const winner = both.find(({ status }) => status === 200)!;
      expect(both.find(({ status }) => status === 400)!.body.error_description).not.toContain(
        "ended",
      );
      expect(
        (await callTool(setupped.handle, { Authorization: `Bearer ${winner.body.access_token}` }))
          .status,
      ).toBe(200);
    },
  );

  it.each([
    [
      "rejects",
      {
        consume: () => Promise.reject(new Error("store down")),
        has: () => Promise.reject(new Error("store down")),
      },
    ],
    [
      "throws",
      {
        consume: () => {
          throw new Error("store down");
        },
        has: () => {
          throw new Error("store down");
        },
      },
    ],
  ] as [string, GrantStore][])(
    "fails closed, with answers to retry, when the store %s",
    async (_, broken) => {
      const shared = secret();
      const working = setup({}, { secret: shared, store: memoryGrantStore() });
      const person = browser(working.handle, ORIGIN, working.redmine);
      // A sign-in on the working instance, up to Redmine's answer, and a full one for tokens.
      const page = await person.send(
        authorizeUrl({
          response_type: "code",
          client_id: CLAUDE,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      );
      const consentPage = await page.text();
      const decision = await person.send(new URL(AUTHORIZE), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ consent: consentValue(consentPage), decision: "allow" }),
      });
      const returned = new URL(
        working.redmine
          .authorize(new URL(decision.headers.get("location")!))
          .headers.get("location")!,
      );
      const { landed, verifier } = await signIn(working);
      const issued = await tokens(working);

      const down = setup({}, { secret: shared, store: broken });
      const cookie = [...person.jar.get(ORIGIN)!]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
      const internal = (url: URL) =>
        new URL(url.pathname + url.search, "http://127.0.0.1:3737").href;

      const mcp = await callTool(down.handle, { Authorization: `Bearer ${issued.access_token}` });
      expect(mcp.status).toBe(503);
      expect(await mcp.json()).toMatchObject({ error: "temporarily_unavailable" });

      for (const params of [
        {
          grant_type: "refresh_token",
          refresh_token: issued.refresh_token,
          client_id: CLAUDE,
        } as Record<string, string>,
        {
          grant_type: "authorization_code",
          code: landed.searchParams.get("code")!,
          client_id: CLAUDE,
          code_verifier: verifier,
        },
      ]) {
        const answer = await form(down.handle, TOKEN, params);
        expect(answer.status).toBe(503);
        expect(await answer.json()).toMatchObject({ error: "temporarily_unavailable" });
      }

      const fresh = await browser(down.handle, ORIGIN, down.redmine).send(
        authorizeUrl({
          response_type: "code",
          client_id: CLAUDE,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      );
      const posted = await down.handle(
        new Request(internal(new URL(AUTHORIZE)), {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: fresh.headers.getSetCookie()[0]!.split(";")[0]!,
          },
          body: new URLSearchParams({
            consent: consentValue(await fresh.text()),
            decision: "allow",
          }),
        }),
      );
      const callback = await down.handle(new Request(internal(returned), { headers: { cookie } }));
      for (const answer of [posted, callback]) {
        expect(answer.status).toBe(503);
        expect(answer.headers.get("location")).toBeNull();
        expect(await answer.text()).toContain("Sign-in is unavailable for a moment.");
      }
      expect(down.errors.map(({ message }) => message)).toContain(
        "The grant store failed: store down",
      );
    },
  );

  it("ends what a code issued when the code comes back", async () => {
    const setupped = setup({}, { store: memoryGrantStore() });
    const { landed, verifier } = await signIn(setupped);
    const exchange = () =>
      form(setupped.handle, TOKEN, {
        grant_type: "authorization_code",
        code: landed.searchParams.get("code")!,
        client_id: CLAUDE,
        code_verifier: verifier,
      });
    const issued = (await (await exchange()).json()) as Issued;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 31_000);
    expect(await (await exchange()).json()).toMatchObject({
      error: "invalid_grant",
      error_description: "The code was already used; every token from this sign-in is ended",
    });
    expect(
      (await callTool(setupped.handle, { Authorization: `Bearer ${issued.access_token}` })).status,
    ).toBe(401);
  });

  it("makes an API-key code single-use across instances that share it, and only then", async () => {
    const shared = secret();
    const store = memoryGrantStore();
    const keyOptions = { secret: shared, redmineApp: undefined, apiKeyLogin: true } as never;
    const first = setup({}, { ...(keyOptions as object), store } as never);
    const { verifier, challenge } = pkce();
    const person = browser(first.handle, ORIGIN, first.redmine);
    const consentPage = await person.send(
      authorizeUrl({
        response_type: "code",
        client_id: CLAUDE,
        redirect_uri: CLAUDE_REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }),
    );
    const allowed = await person.send(new URL(AUTHORIZE), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        consent: consentValue(await consentPage.text()),
        api_key: "jsmith-api-key",
        decision: "allow",
      }),
    });
    const code = new URL(allowed.headers.get("location")!).searchParams.get("code")!;
    const instance = (withStore: boolean) =>
      createRedmineMcpHandler({
        baseUrl: REDMINE_INTERNAL,
        fetch: first.redmine.fetch,
        publicUrl: PUBLIC_URL,
        oauth: {
          secret: shared,
          apiKeyLogin: true,
          fetchClientMetadata: noMetadataFetch,
          ...(withStore ? { store } : {}),
        },
      });
    const exchange = (handle: Handler) =>
      form(handle, TOKEN, {
        grant_type: "authorization_code",
        code,
        client_id: CLAUDE,
        code_verifier: verifier,
      });
    expect((await exchange(first.handle)).status).toBe(200);
    expect((await exchange(instance(true))).status).toBe(400);
    // Without the shared store, another process has not seen the code: documented, and PKCE-bound.
    expect((await exchange(instance(false))).status).toBe(200);
  });

  it("takes a Redmine state once, also replayed in the same browser", async () => {
    for (const store of [undefined, memoryGrantStore()]) {
      const setupped = setup({}, store === undefined ? {} : { store });
      const person = browser(setupped.handle, ORIGIN, setupped.redmine);
      const page = await person.send(
        authorizeUrl({
          response_type: "code",
          client_id: CLAUDE,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      );
      const decision = await person.send(new URL(AUTHORIZE), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ consent: consentValue(await page.text()), decision: "allow" }),
      });
      const atRedmine = new URL(decision.headers.get("location")!);
      // Redmine approves a returning user again without asking, with a fresh code each time.
      const first = await person.follow(setupped.redmine.authorize(atRedmine));
      expect(first).toBeInstanceOf(URL);
      const again = await person.follow(setupped.redmine.authorize(atRedmine));
      expect(again).toBeInstanceOf(Response);
      expect((again as Response).status).toBe(400);
      expect(await (again as Response).text()).toContain("already came back from Redmine");
    }
  });

  it("spends neither a code nor a refresh token when Redmine does not answer", async () => {
    for (const store of [undefined, memoryGrantStore()]) {
      let down = false;
      const redmine = fakeRedmine();
      const flaky: typeof fetch = async (input, init) => {
        if (down && new Request(input, init).url.endsWith("/oauth/token")) {
          down = false;
          throw new TypeError("fetch failed");
        }
        return redmine.fetch(input, init);
      };
      const setupped = setup({ fetch: flaky }, store === undefined ? {} : { store });
      const { landed, verifier } = await signIn({ ...setupped, redmine });
      const exchange = () =>
        form(setupped.handle, TOKEN, {
          grant_type: "authorization_code",
          code: landed.searchParams.get("code")!,
          client_id: CLAUDE,
          code_verifier: verifier,
        });
      down = true;
      expect((await exchange()).status).toBe(502);
      const issued = (await (await exchange()).json()) as Issued;
      expect(issued.access_token).toBeTruthy();
      down = true;
      expect((await refresh(setupped.handle, issued.refresh_token)).status).toBe(502);
      const renewed = await refresh(setupped.handle, issued.refresh_token);
      expect(renewed.status).toBe(200);
      expect(
        (await callTool(setupped.handle, { Authorization: `Bearer ${renewed.body.access_token}` }))
          .status,
      ).toBe(200);
    }
  });

  it("ends an API-key sign-in 30 days after consent without a store, and renews it with one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const [store, at31] of [
      [undefined, 400],
      [memoryGrantStore(), 200],
    ] as const) {
      const start = Date.now();
      const setupped = setup({}, {
        redmineApp: undefined,
        apiKeyLogin: true,
        ...(store === undefined ? {} : { store }),
      } as never);
      const { verifier, challenge } = pkce();
      const person = browser(setupped.handle, ORIGIN, setupped.redmine);
      const consentPage = await person.send(
        authorizeUrl({
          response_type: "code",
          client_id: CLAUDE,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      );
      const allowed = await person.send(new URL(AUTHORIZE), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          consent: consentValue(await consentPage.text()),
          api_key: "jsmith-api-key",
          decision: "allow",
        }),
      });
      const issued = (await (
        await form(setupped.handle, TOKEN, {
          grant_type: "authorization_code",
          code: new URL(allowed.headers.get("location")!).searchParams.get("code")!,
          client_id: CLAUDE,
          code_verifier: verifier,
        })
      ).json()) as Issued;
      vi.setSystemTime(start + 20 * DAY);
      const renewed = await refresh(setupped.handle, issued.refresh_token);
      expect(renewed.status).toBe(200);
      vi.setSystemTime(start + 31 * DAY);
      expect((await refresh(setupped.handle, renewed.body.refresh_token)).status).toBe(at31);
      vi.setSystemTime(start);
    }
  });
});

async function listed(handle: Handler, accessToken: string) {
  const client = new Client({ name: "admin-tests", version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(PUBLIC_URL), {
      fetch: direct(handle),
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    }),
  );
  const { tools } = await client.listTools();
  return { count: tools.length, instructions: client.getInstructions() ?? "" };
}

const ADMIN_SENTENCE = 'Tools whose description says "Needs an admin key"';

describe("admin rights in the grant", () => {
  it.each(["jsmith", "admin"])(
    "lists %s, signed in through Redmine, no tool that needs an admin key, before and after a refresh",
    async (user) => {
      const setupped = setup({}, {}, fakeRedmine({ user }));
      const issued = await tokens(setupped);
      const first = await listed(setupped.handle, issued.access_token);
      expect(first.count).toBe(79);
      expect(first.instructions).not.toContain(ADMIN_SENTENCE);
      const renewed = (await (
        await form(setupped.handle, TOKEN, {
          grant_type: "refresh_token",
          refresh_token: issued.refresh_token,
          client_id: CLAUDE,
        })
      ).json()) as Issued;
      expect((await listed(setupped.handle, renewed.access_token)).count).toBe(79);
      expect(setupped.redmine.apiCalls).toEqual([]);
    },
  );

  it.each([
    ["jsmith-api-key", 79],
    ["admin-api-key", 93],
  ])(
    "lists %s, signed in with the key, %i tools, from the check at consent",
    async (key, count) => {
      const setupped = setup({}, { redmineApp: undefined, apiKeyLogin: true } as never);
      const { verifier, challenge } = pkce();
      const person = browser(setupped.handle, ORIGIN, setupped.redmine);
      const page = await person.send(
        authorizeUrl({
          response_type: "code",
          client_id: CLAUDE,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
      );
      const submitted = await person.send(new URL(AUTHORIZE), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          consent: consentValue(await page.text()),
          api_key: key,
          decision: "allow",
        }),
      });
      const code = new URL(submitted.headers.get("location")!).searchParams.get("code")!;
      const issued = (await (
        await form(setupped.handle, TOKEN, {
          grant_type: "authorization_code",
          code,
          redirect_uri: CLAUDE_REDIRECT,
          client_id: CLAUDE,
          code_verifier: verifier,
        })
      ).json()) as Issued;
      expect((await listed(setupped.handle, issued.access_token)).count).toBe(count);
      expect(setupped.redmine.apiCalls.map(({ path }) => path)).toEqual(["/users/current.json"]);
    },
  );

  it("lists every tool for a token sealed before admin rights were recorded", async () => {
    const shared = secret();
    const { handle } = setup({}, { secret: shared }, fakeRedmine({ user: "jsmith" }));
    const sealer = createSealer([shared], PUBLIC_URL);
    const older = await sealer.seal(
      "access",
      {
        family: "f",
        credential: { bearer: "redmine-token" },
        scopes: ["redmine:read", "redmine:write", "redmine:delete"],
        client: "c",
        audience: PUBLIC_URL,
      },
      3600,
    );
    const { count, instructions } = await listed(handle, older);
    expect(count).toBe(93);
    expect(instructions).toContain(ADMIN_SENTENCE);
  });
});
