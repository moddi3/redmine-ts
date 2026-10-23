import { randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type { OAuthClientProvider } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createRedmineMcpHandler } from "../../src/index.ts";
import type { RedmineMcpHandlerOptions } from "../../src/index.ts";
import {
  browser,
  consentValue,
  fakeRedmine,
  pkce,
  REDMINE_APP,
  REDMINE_INTERNAL,
  REDMINE_PUBLIC,
} from "./oauth-fakes.ts";
import type { FakeRedmine } from "./oauth-fakes.ts";

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
): Setup {
  const redmine = fakeRedmine();
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

function callTool(handle: Handler, headers: Record<string, string>, name = "issue_statuses_list") {
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
      params: { name, arguments: {} },
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
      token_endpoint_auth_methods_supported: ["none"],
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
    expect((await list.text()).match(/"name":"/g)?.length).toBe(43);
    // Asking for more than the server offers gets what it offers.
    const capped = await tokens(setupped, { scope: "redmine:delete" });
    expect(capped.scope).toBe("redmine:read redmine:write");
  });

  it("keeps serving X-Redmine-API-Key next to OAuth", async () => {
    const { handle } = setup();
    const response = await callTool(handle, { "X-Redmine-API-Key": "jsmith-api-key" });
    expect(await response.text()).toContain("New for jsmith");
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

  it("sends PKCE, response_type and resource errors back to the client with iss", async () => {
    const setupped = setup();
    const person = browser(setupped.handle, ORIGIN, setupped.redmine);
    const { challenge } = pkce();
    const base = {
      response_type: "code",
      client_id: CLAUDE,
      redirect_uri: CLAUDE_REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "s1",
    };
    const cases: [Record<string, string>, string][] = [
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge: "" }, "invalid_request"],
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ resource: "https://mcp.example.com/other" }, "invalid_target"],
    ];
    for (const [params, error] of cases) {
      const response = await person.send(authorizeUrl({ ...base, ...params }));
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("location")!);
      expect(location.origin + location.pathname).toBe(CLAUDE_REDIRECT);
      expect(Object.fromEntries(location.searchParams)).toMatchObject({
        error,
        state: "s1",
        iss: PUBLIC_URL,
      });
    }
    // An unknown redirect URI never gets a redirect.
    const stray = await person.send(
      authorizeUrl({ ...base, redirect_uri: "https://evil.example/cb" }),
    );
    expect(stray.status).toBe(400);
    expect(stray.headers.get("location")).toBeNull();
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
    for (const refused of [
      { redirect_uris: [uri(40)], token_endpoint_auth_method: "client_secret_basic" },
      { redirect_uris: [uri(40)], token_endpoint_auth_method: "private_key_jwt" },
      { redirect_uris: Array.from({ length: 6 }, (_, at) => `${uri(40)}${at}`) },
      { redirect_uris: [uri(257)] },
      { redirect_uris: [uri(40)], client_name: "n".repeat(101) },
    ]) {
      expect(await register(refused)).toMatchObject({
        status: 400,
        body: { error: "invalid_client_metadata" },
      });
    }
    const largest = await register({
      redirect_uris: Array.from({ length: 5 }, (_, at) => `${uri(255)}${at}`),
      client_name: "n".repeat(100),
    });
    expect(largest.status).toBe(201);
    expect(largest.body.client_id!.length).toBeLessThan(2600);
  });

  it("refuses a metadata document that asks for client authentication", async () => {
    const setupped = setup();
    const page = async (clientId: string) => {
      const response = await browser(setupped.handle, ORIGIN, setupped.redmine).send(
        authorizeUrl({
          response_type: "code",
          client_id: clientId,
          redirect_uri: CLAUDE_REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      );
      return { status: response.status, text: await response.text() };
    };
    const jwt = "https://jwt.example/meta.json";
    setupped.documents.set(jwt, {
      client_id: jwt,
      redirect_uris: [CLAUDE_REDIRECT],
      token_endpoint_auth_method: "private_key_jwt",
      jwks_uri: "https://jwt.example/jwks.json",
    });
    expect(await page(jwt)).toMatchObject({
      status: 400,
      text: expect.stringContaining("public clients only"),
    });
    const none = "https://none.example/meta.json";
    setupped.documents.set(none, {
      client_id: none,
      redirect_uris: [CLAUDE_REDIRECT],
      token_endpoint_auth_method: "none",
    });
    expect((await page(none)).status).toBe(200);
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
      const text = await response.text();
      expect(text).toContain("its metadata document could not be fetched");
      expect(text).not.toContain(String(status));
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
    expect(create({}, { secret: "short" })).toThrow("32 characters");
    expect(create({}, { redmineApp: { clientId: "", clientSecret: "" } })).toThrow("clientId");
    expect(create({ publicUrl: undefined })).toThrow("publicUrl");
    // Clients choose the metadata URLs, so the handler has no unguarded default fetch for them.
    expect(create({}, { fetchClientMetadata: undefined })).toThrow(
      "oauth.fetchClientMetadata is required: pass publicFetch from @redmine-ts/mcp/node",
    );
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
    expect(await wrong.text()).toContain("Redmine does not accept this key.");
    const right = await submit("jsmith-api-key");
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
      error_description: "The code was already used",
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
