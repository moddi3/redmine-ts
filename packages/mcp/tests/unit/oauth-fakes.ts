import { createHash, randomBytes } from "node:crypto";

/** Redmine as the server reaches it, and as browsers do, which a sidecar setup keeps apart. */
export const REDMINE_INTERNAL = "http://redmine.internal:3000/";
export const REDMINE_PUBLIC = "https://redmine.example.com/";
export const REDMINE_APP = { clientId: "redmine-app-id", clientSecret: "redmine-app-secret" };

interface Grant {
  user: string;
  scope: string;
  challenge: string;
  redirectUri: string;
  /** The refresh token this access token replaced, which Doorkeeper revokes on its first use. */
  previous?: string;
}

/**
 * Redmine's OAuth as Doorkeeper runs it: single-use codes bound to PKCE and the redirect URI,
 * rotating refresh tokens, and the REST API answering Bearer tokens and API keys a moment later, as
 * over a network. Its authorize page
 * approves at once for `user`, as a signed-in person who clicks Authorize would. A refresh token dies
 * on use, unless `doorkeeper`, which keeps it valid until the new access token is first used, as
 * Doorkeeper's previous_refresh_token does.
 */
export function fakeRedmine({ user = "jsmith", expiresIn = 7200, doorkeeper = false } = {}) {
  const codes = new Map<string, Grant>();
  const tokens = new Map<string, Grant>();
  const refreshTokens = new Map<string, Grant>();
  const authorizeRequests: URLSearchParams[] = [];
  const tokenRequests: URLSearchParams[] = [];
  const apiCalls: { path: string; authorization: string | null; key: string | null }[] = [];
  const keys = new Map([["jsmith-api-key", "jsmith"]]);
  const random = () => randomBytes(16).toString("hex");
  const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

  /** The browser's view: Redmine's public authorize page. */
  function authorize(url: URL): Response {
    const params = url.searchParams;
    authorizeRequests.push(params);
    const redirect = new URL(params.get("redirect_uri")!);
    if (params.get("client_id") !== REDMINE_APP.clientId)
      return new Response("unknown client", { status: 401 });
    const code = random();
    codes.set(code, {
      user,
      scope: params.get("scope") ?? "",
      challenge: params.get("code_challenge")!,
      redirectUri: params.get("redirect_uri")!,
    });
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", params.get("state")!);
    return new Response(null, { status: 302, headers: { location: redirect.href } });
  }

  function issue(grant: Grant, previous?: string): Response {
    const access = random();
    const refresh = random();
    tokens.set(access, { ...grant, ...(previous === undefined ? {} : { previous }) });
    refreshTokens.set(refresh, grant);
    return Response.json({
      access_token: access,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: refresh,
      scope: grant.scope,
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  /** The server's view: the token endpoint and the REST API at the internal URL. */
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (!url.href.startsWith(REDMINE_INTERNAL)) {
      throw new Error(`the server called ${url.origin}, not Redmine's internal URL`);
    }
    const path = `/${url.href.slice(REDMINE_INTERNAL.length)}`.replace(/\?.*/, "");
    if (path === "/oauth/token" && request.method === "POST") {
      const form = new URLSearchParams(await request.text());
      tokenRequests.push(form);
      if (
        form.get("client_id") !== REDMINE_APP.clientId ||
        form.get("client_secret") !== REDMINE_APP.clientSecret
      ) {
        return Response.json({ error: "invalid_client" }, { status: 401 });
      }
      if (form.get("grant_type") === "authorization_code") {
        const grant = codes.get(form.get("code") ?? "");
        codes.delete(form.get("code") ?? "");
        if (
          grant === undefined ||
          grant.redirectUri !== form.get("redirect_uri") ||
          s256(form.get("code_verifier") ?? "") !== grant.challenge
        ) {
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        }
        return issue(grant);
      }
      if (form.get("grant_type") === "refresh_token") {
        const used = form.get("refresh_token") ?? "";
        const grant = refreshTokens.get(used);
        if (!doorkeeper) refreshTokens.delete(used);
        return grant === undefined
          ? Response.json({ error: "invalid_grant" }, { status: 400 })
          : issue(grant, doorkeeper ? used : undefined);
      }
      return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
    const authorization = request.headers.get("authorization");
    const key = request.headers.get("x-redmine-api-key");
    apiCalls.push({ path, authorization, key });
    const grant = authorization?.startsWith("Bearer ")
      ? tokens.get(authorization.slice(7))
      : undefined;
    if (grant?.previous !== undefined) {
      refreshTokens.delete(grant.previous);
      delete grant.previous;
    }
    const who = authorization?.startsWith("Bearer ") ? grant?.user : keys.get(key ?? "");
    if (who === undefined) return new Response(null, { status: 401 });
    if (path === "/users/current.json") {
      return Response.json({ user: { id: 2, login: who, firstname: "John", lastname: "Smith" } });
    }
    if (path === "/issue_statuses.json") {
      return Response.json({
        issue_statuses: [{ id: 1, name: `New for ${who}`, is_closed: false, description: null }],
      });
    }
    return Response.json({}, { status: 404 });
  };

  return {
    fetch,
    authorize,
    authorizeRequests,
    tokenRequests,
    apiCalls,
    tokens,
    revokeAll: () => {
      tokens.clear();
      refreshTokens.clear();
    },
    rotateKey: (from: string, to: string) => {
      keys.delete(from);
      keys.set(to, "jsmith");
    },
  };
}

export type FakeRedmine = ReturnType<typeof fakeRedmine>;

/**
 * A browser: it keeps cookies per origin and follows redirects, sending requests for the MCP server's
 * public origin to the handler and those for Redmine's public origin to the fake Redmine, until a
 * redirect leaves both, which is where the client listens.
 */
export function browser(
  handle: (request: Request) => Promise<Response>,
  publicOrigin: string,
  redmine: FakeRedmine,
) {
  const jar = new Map<string, Map<string, string>>();
  async function send(url: URL, init: RequestInit = {}): Promise<Response> {
    const cookies = jar.get(url.origin) ?? new Map<string, string>();
    const headers = new Headers(init.headers);
    if (cookies.size > 0) {
      headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    let response: Response;
    if (url.origin === publicOrigin) {
      // The proxy in front of the handler forwards the path unchanged to an internal address.
      const internal = new URL(url.pathname + url.search, "http://127.0.0.1:3737");
      response = await handle(new Request(internal, { ...init, headers }));
    } else if (url.origin === new URL(REDMINE_PUBLIC).origin) {
      response = redmine.authorize(url);
    } else {
      throw new Error(`the browser went to ${url.href}`);
    }
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair!.indexOf("=");
      cookies.set(pair!.slice(0, at), pair!.slice(at + 1));
      jar.set(url.origin, cookies);
    }
    return response;
  }
  return {
    jar,
    send,
    /** Follows redirects from `response` until one leaves the server and Redmine: the client's redirect. */
    async follow(response: Response): Promise<URL | Response> {
      for (let hops = 0; hops < 10; hops++) {
        if (response.status < 300 || response.status >= 400) return response;
        const location = new URL(response.headers.get("location")!);
        if (
          location.origin !== publicOrigin &&
          location.origin !== new URL(REDMINE_PUBLIC).origin
        ) {
          return location;
        }
        response = await send(location);
      }
      throw new Error("too many redirects");
    },
  };
}

/** The consent form's hidden value, read from the page. */
export function consentValue(page: string): string {
  return /name="consent" value="([^"]+)"/.exec(page)![1]!;
}

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
