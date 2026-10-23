// The built-in authorization server. MCP clients register and get tokens here; people sign in at
// Redmine's own OAuth (Redmine 6.1+) through one confidential application the admin creates, or, as an
// opt-in fallback, paste their API key into the consent page. Nothing is stored: codes, tokens, states
// and registrations are sealed, and Redmine's single-use codes and refresh tokens carry what state
// there is. The client's token never reaches Redmine; each request opens it to the Redmine credential
// it seals.

import { createRedmine, RedmineError } from "@redmine-ts/sdk";
import type { Access, RedmineVersion } from "@redmine-ts/sdk";
import { z } from "zod";
import type { BearerGrant, BearerVerifier } from "../http.ts";
import { allowsRedirect, createClients } from "./clients.ts";
import type { Client } from "./clients.ts";
import { consentPage, errorPage } from "./pages.ts";
import { grantedScopes, redmineScope, scopesFor } from "./scopes.ts";
import type { Scope } from "./scopes.ts";
import { createSealer, MIN_SECRET_LENGTH, now, randomToken, sha256 } from "./seal.ts";
import {
  comparablePath,
  methodNotAllowed,
  openPreflight,
  publicDocument,
  readText,
} from "./web.ts";
import type { PublicPaths } from "./web.ts";

export type RedmineOAuthOptions = OAuthSettings &
  (
    | {
        /** The confidential Redmine OAuth application people sign in through, created by an admin. */
        redmineApp: { clientId: string; clientSecret: string };
        apiKeyLogin?: never;
      }
    | {
        /**
         * Instead of a Redmine application: the consent page asks for the person's API key, checks
         * it, and seals it into the tokens. For Redmine without OAuth applications; it teaches people
         * to paste a master key into a web page, so prefer redmineApp.
         */
        apiKeyLogin: true;
        redmineApp?: never;
      }
  );

interface OAuthSettings {
  /**
   * The secret everything the server hands out is sealed with, at least 32 characters, such as the
   * output of `openssl rand -base64 32`. Changing it signs every client out.
   */
  secret: string;
  /** The secret before the last change, still accepted to open what it sealed. */
  previousSecret?: string;
  /**
   * Redmine's URL as browsers reach it, when the server reaches Redmine at another, internal one.
   * Sign-in redirects there; token requests and the REST API keep using baseUrl. Default: baseUrl.
   */
  redminePublicUrl?: string;
  /**
   * Hostnames clients must belong to: the host of a metadata document's URL, or of every redirect URI
   * of a registered client. Default: any client.
   */
  allowedClientHosts?: readonly string[];
  /**
   * Fetches Client ID Metadata Documents, whose URLs clients choose. It should refuse private and
   * loopback addresses: `publicFetch` from `@redmine-ts/mcp/node` does on Node, and Workers' fetch
   * does with the `global_fetch_strictly_public` flag. Default: globalThis.fetch.
   */
  fetchClientMetadata?: typeof fetch;
}

/** What the handler lends the authorization server. */
export interface AuthorizationServerContext {
  paths: PublicPaths;
  /** Redmine as the server reaches it, ending in a slash. */
  redmineUrl: URL;
  fetch: typeof fetch;
  version: RedmineVersion | undefined;
  access: Access;
  onError: ((error: Error) => void) | undefined;
}

export interface AuthorizationServer {
  verifier: BearerVerifier;
  /** The answer for one of the server's paths, or undefined for any other path. */
  serve(request: Request, path: string): Promise<Response> | undefined;
}

/**
 * Authorization codes are redeemed at once; a minute covers the redirect and the exchange. It is also
 * how long an API-key code could be replayed by a process that has not seen it redeemed.
 */
const CODE_TTL = 60;
/** Sign-in pages and states. OAuth 2.1 recommends at most 10 minutes. */
const FLOW_TTL = 600;
/** Never longer than Redmine's own token, which lasts 2 hours. An API key does not expire. */
const ACCESS_TTL = 3600;
/** Refreshing renews it, so only a client idle this long signs in again. */
const REFRESH_TTL = 30 * 24 * 3600;
/** Margin between our token's end and Redmine's, for clocks and slow requests. */
const EXPIRY_SKEW = 60;
/** claude.ai gives token calls 10 seconds. */
const REDMINE_TIMEOUT_MS = 8000;
const FORM_MAX_BYTES = 16 * 1024;
const STATE_MAX_LENGTH = 1024;
/**
 * Binds a sign-in to the browser that started it. `__Host-` keeps it on this exact origin with Path=/,
 * so a Redmine on the same origin sees it but cannot be confused by its name.
 */
const BROWSER_COOKIE = "__Host-redmine-mcp-oauth";
const BROWSER_TTL = 3600;

const OTHER_BROWSER =
  "This sign-in did not start in this browser, or the browser dropped its cookie. Start again from your client.";

const PKCE_VERIFIER = /^[\w.~-]{43,128}$/;
const S256_CHALLENGE = /^[\w-]{43}$/;

/** The request the person sees on the consent page, carried through the form. */
interface ConsentPayload {
  /** The browser nonce from the cookie. */
  n: string;
  client: string;
  redirect: string;
  challenge: string;
  scopes: Scope[];
  state: string | undefined;
}

/** What the redirect to Redmine carries and the callback needs. */
interface StatePayload {
  n: string;
  /** SHA-256 of the client_id, which binds the code without carrying a long registration. */
  client: string;
  redirect: string;
  challenge: string;
  scopes: Scope[];
  state: string | undefined;
  /** The PKCE verifier for Redmine's code. */
  verifier: string;
}

/** What a code stands for at Redmine: its code and our PKCE verifier for it, or a checked API key. */
type CodeGrant = { redmineCode: string; verifier: string } | { apiKey: string };

/** What a refresh token stands for at Redmine. */
type RefreshGrant = { redmineRefresh: string } | { apiKey: string };

interface CodePayload {
  /** A replay id. */
  id: string;
  grant: CodeGrant;
  client: string;
  redirect: string;
  challenge: string;
  scopes: Scope[];
}

interface AccessPayload {
  credential: BearerGrant["credential"];
  scopes: Scope[];
  client: string;
  audience: string;
}

interface RefreshPayload {
  grant: RefreshGrant;
  scopes: Scope[];
  client: string;
}

/** Redmine's side of a token pair. */
interface Upstream {
  credential: BearerGrant["credential"];
  refresh: RefreshGrant;
  expiresIn: number;
}

const RedmineTokens = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
});

type TokenError = { status: number; error: string; description: string };

export function createAuthorizationServer(
  options: RedmineOAuthOptions,
  context: AuthorizationServerContext,
): AuthorizationServer {
  const { paths, redmineUrl, version, access, onError } = context;
  const secrets = [options.secret, ...(options.previousSecret ? [options.previousSecret] : [])];
  if (secrets.some((secret) => secret.length < MIN_SECRET_LENGTH)) {
    throw new TypeError(`oauth.secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const app = options.redmineApp;
  if (app === undefined ? options.apiKeyLogin !== true : !app.clientId || !app.clientSecret) {
    throw new TypeError(
      "oauth needs redmineApp with the clientId and clientSecret Redmine showed, or apiKeyLogin",
    );
  }
  const redminePublic = withSlash(new URL(options.redminePublicUrl ?? redmineUrl));
  const issuer = paths.identifier;
  const sealer = createSealer(secrets, issuer);
  const clients = createClients({
    sealer,
    fetch: options.fetchClientMetadata ?? fetch,
    allowedHosts: options.allowedClientHosts,
  });
  const callbackUrl = paths.origin + paths.callback;
  const redeemed = replayGuard();
  const metadata = {
    issuer,
    authorization_endpoint: paths.origin + paths.authorize,
    token_endpoint: paths.origin + paths.token,
    registration_endpoint: paths.origin + paths.register,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: scopesFor(access),
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };

  /** Every redirect back to the client says who answers, as RFC 9207 asks. */
  const back = (redirectUri: string, params: Record<string, string | undefined>, status = 302) =>
    redirect(redirectUri, { ...params, iss: issuer }, status);

  async function browserNonce(request: Request): Promise<string | undefined> {
    const sealed = cookie(request, BROWSER_COOKIE);
    return sealed === undefined
      ? undefined
      : (await sealer.open<{ n: string }>("browser", sealed))?.n;
  }

  async function authorize(request: Request): Promise<Response> {
    if (request.method === "POST") return decide(request);
    if (request.method !== "GET") return methodNotAllowed("GET, POST");
    const params = new URL(request.url).searchParams;
    for (const name of new Set(params.keys())) {
      if (params.getAll(name).length > 1) return errorPage(400, `The request repeats ${name}.`);
    }
    const clientId = params.get("client_id");
    const redirectUri = params.get("redirect_uri");
    if (!clientId || !redirectUri) {
      return errorPage(
        400,
        "The request lacks client_id or redirect_uri. Start again from your client.",
      );
    }
    const client = await clients.resolve(clientId);
    if (typeof client === "string") {
      return errorPage(400, `This server refuses the client: ${client}.`);
    }
    if (!allowsRedirect(client, redirectUri)) {
      return errorPage(400, "The redirect_uri is not one the client registered.");
    }
    const state = params.get("state") ?? undefined;
    if (state !== undefined && state.length > STATE_MAX_LENGTH) {
      return back(redirectUri, {
        error: "invalid_request",
        error_description: "state is too long",
      });
    }
    const fail = (error: string, description: string) =>
      back(redirectUri, { error, error_description: description, state });
    if (params.get("response_type") !== "code") {
      return fail("unsupported_response_type", "Only response_type=code is supported");
    }
    const challenge = params.get("code_challenge") ?? "";
    if (params.get("code_challenge_method") !== "S256" || !S256_CHALLENGE.test(challenge)) {
      return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
    }
    const resource = params.get("resource");
    if (resource !== null && !sameResource(resource, issuer)) {
      return fail("invalid_target", `This server issues tokens only for ${issuer}`);
    }
    const nonce = (await browserNonce(request)) ?? randomToken();
    const consent: ConsentPayload = {
      n: nonce,
      client: clientId,
      redirect: redirectUri,
      challenge,
      scopes: grantedScopes(params.get("scope")?.split(" ") ?? [], access),
      state,
    };
    return showConsent(client, consent, await sealer.seal("consent", consent, FLOW_TTL), {
      headers: { "Set-Cookie": await browserCookie(nonce) },
    });
  }

  function showConsent(
    client: Client,
    consent: ConsentPayload,
    sealed: string,
    { keyError, ...init }: { status?: number; headers?: Record<string, string>; keyError?: string },
  ): Response {
    return consentPage(
      {
        client,
        redirectUri: consent.redirect,
        scopes: consent.scopes,
        redmineHost: redminePublic.host,
        action: paths.authorize,
        consent: sealed,
        // Chrome checks form-action on the redirect that follows the decision, to Redmine or back.
        formTargets: [redminePublic.origin, new URL(consent.redirect).origin],
        ...(app === undefined
          ? {
              apiKey: {
                serverHost: new URL(paths.origin).host,
                accountUrl: new URL("my/account", redminePublic).href,
                ...(keyError === undefined ? {} : { error: keyError }),
              },
            }
          : {}),
      },
      init,
    );
  }

  async function browserCookie(nonce: string): Promise<string> {
    const sealed = await sealer.seal("browser", { n: nonce }, BROWSER_TTL);
    return `${BROWSER_COOKIE}=${sealed}; Path=/; Max-Age=${BROWSER_TTL}; Secure; HttpOnly; SameSite=Lax`;
  }

  /** The consent form's answer. It must come from the browser the page was shown to. */
  async function decide(request: Request): Promise<Response> {
    // Browsers name the page a form was posted from; the consent page is on the public origin.
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== paths.origin) {
      return errorPage(403, "The sign-in form was sent from another site.");
    }
    const form = await readForm(request);
    const consent =
      form === undefined
        ? undefined
        : await sealer.open<ConsentPayload>("consent", form.get("consent") ?? "");
    if (consent === undefined) {
      return errorPage(400, "This sign-in page has expired. Start again from your client.");
    }
    if ((await browserNonce(request)) !== consent.n) {
      return errorPage(403, OTHER_BROWSER);
    }
    if (form?.get("decision") !== "allow") {
      return back(consent.redirect, { error: "access_denied", state: consent.state }, 303);
    }
    if (app === undefined) return checkKey(form, consent);
    const verifier = randomToken();
    const state: StatePayload = {
      n: consent.n,
      client: await sha256(consent.client),
      redirect: consent.redirect,
      challenge: consent.challenge,
      scopes: consent.scopes,
      state: consent.state,
      verifier,
    };
    return redirect(
      new URL("oauth/authorize", redminePublic).href,
      {
        response_type: "code",
        client_id: app.clientId,
        redirect_uri: callbackUrl,
        scope: redmineScope(consent.scopes, version),
        state: await sealer.seal("state", state, FLOW_TTL),
        code_challenge: await sha256(verifier),
        code_challenge_method: "S256",
      },
      303,
    );
  }

  /**
   * The fallback's consent: the key must work at Redmine before anything is issued, and the code is
   * handed out at once, since there is no Redmine sign-in to wait for.
   */
  async function checkKey(form: URLSearchParams, consent: ConsentPayload): Promise<Response> {
    const apiKey = form.get("api_key")?.trim() ?? "";
    const check = apiKey === "" ? "missing" : await checkApiKey(apiKey);
    if (check !== "ok") {
      const keyError = {
        missing: "Paste your API key.",
        refused: "Redmine does not accept this key.",
        unreachable: "Redmine did not answer. Try again in a moment.",
      }[check];
      const client = await clients.resolve(consent.client);
      if (typeof client === "string") {
        return errorPage(400, `This server refuses the client: ${client}.`);
      }
      return showConsent(client, consent, form.get("consent")!, { status: 400, keyError });
    }
    const ours: CodePayload = {
      id: randomToken(),
      grant: { apiKey },
      client: await sha256(consent.client),
      redirect: consent.redirect,
      challenge: consent.challenge,
      scopes: consent.scopes,
    };
    return back(
      consent.redirect,
      { code: await sealer.seal("code", ours, CODE_TTL), state: consent.state },
      303,
    );
  }

  /** Whether Redmine accepts `apiKey`, refuses it with 401, or did not answer. */
  async function checkApiKey(apiKey: string): Promise<"ok" | "refused" | "unreachable"> {
    const rm = createRedmine({
      baseUrl: redmineUrl,
      auth: { apiKey },
      fetch: context.fetch,
      timeoutMs: REDMINE_TIMEOUT_MS,
      retry: false,
    });
    try {
      await rm.users.current();
      return "ok";
    } catch (error) {
      if (RedmineError.is(error, "unauthorized")) return "refused";
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return "unreachable";
    }
  }

  /** Redmine sends the person back here, signed in or not. */
  async function callback(request: Request): Promise<Response> {
    if (request.method !== "GET" || app === undefined) return methodNotAllowed("GET");
    const params = new URL(request.url).searchParams;
    const state = await sealer.open<StatePayload>("state", params.get("state") ?? "");
    if (state === undefined) {
      return errorPage(
        400,
        "This sign-in has expired or did not start here. Start again from your client.",
      );
    }
    if ((await browserNonce(request)) !== state.n) {
      return errorPage(403, OTHER_BROWSER);
    }
    const error = params.get("error");
    const code = params.get("code");
    if (error !== null || code === null) {
      // The person said no at Redmine, or Redmine refused the request, which only its admin can fix.
      const denied = error === "access_denied";
      return back(state.redirect, {
        error: denied ? "access_denied" : "server_error",
        error_description: denied
          ? "Redmine sign-in was cancelled"
          : `Redmine refused the sign-in (${(error ?? "no code").replace(/[^\w ]/g, "")})`,
        state: state.state,
      });
    }
    const ours: CodePayload = {
      id: randomToken(),
      grant: { redmineCode: code, verifier: state.verifier },
      client: state.client,
      redirect: state.redirect,
      challenge: state.challenge,
      scopes: state.scopes,
    };
    return back(state.redirect, {
      code: await sealer.seal("code", ours, CODE_TTL),
      state: state.state,
    });
  }

  async function token(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return openPreflight(request, "POST");
    if (request.method !== "POST") return methodNotAllowed("POST");
    const form = await readForm(request);
    if (form === undefined) {
      return tokenError({
        status: 400,
        error: "invalid_request",
        description: `Send application/x-www-form-urlencoded, at most ${FORM_MAX_BYTES} bytes`,
      });
    }
    const resource = form.get("resource");
    if (resource !== null && !sameResource(resource, issuer)) {
      return tokenError({
        status: 400,
        error: "invalid_target",
        description: `This server issues tokens only for ${issuer}`,
      });
    }
    const clientId = form.get("client_id");
    if (!clientId) {
      return tokenError({ status: 401, error: "invalid_client", description: "Send client_id" });
    }
    const client = await sha256(clientId);
    const grantType = form.get("grant_type");
    const result =
      grantType === "authorization_code"
        ? await redeemCode(form, client)
        : grantType === "refresh_token"
          ? await refresh(form, client)
          : {
              status: 400,
              error: "unsupported_grant_type",
              description: "Use authorization_code or refresh_token",
            };
    return "access_token" in result ? tokenResponse(result) : tokenError(result);
  }

  async function redeemCode(form: URLSearchParams, client: string) {
    const code = await sealer.open<CodePayload>("code", form.get("code") ?? "");
    if (code === undefined) return invalidGrant("The code is invalid or has expired");
    if (code.client !== client) return invalidGrant("The code was issued to another client");
    if (form.get("redirect_uri") !== code.redirect) {
      return invalidGrant("redirect_uri differs from the authorization request");
    }
    const verifier = form.get("code_verifier") ?? "";
    if (!PKCE_VERIFIER.test(verifier) || (await sha256(verifier)) !== code.challenge) {
      return invalidGrant("code_verifier does not match the code_challenge");
    }
    if (!redeemed(code.id, code.exp ?? now())) return invalidGrant("The code was already used");
    const upstream = await redeemUpstream(code.grant);
    return "error" in upstream ? upstream : issue(upstream, code.scopes, client);
  }

  /**
   * Redmine's side of a code. Redmine's code is spent only here, which makes it single-use; a key was
   * checked a moment ago, at consent. A grant of the sign-in method the server no longer uses fails.
   */
  async function redeemUpstream(grant: CodeGrant): Promise<Upstream | TokenError> {
    if ("apiKey" in grant) return app === undefined ? keyTokens(grant.apiKey) : METHOD_CHANGED;
    if (app === undefined) return METHOD_CHANGED;
    return redmineToken(app, {
      grant_type: "authorization_code",
      code: grant.redmineCode,
      redirect_uri: callbackUrl,
      code_verifier: grant.verifier,
    });
  }

  /** Redmine's side of a refresh. A reset key fails here, which sends the client to sign in again. */
  async function refreshUpstream(grant: RefreshGrant): Promise<Upstream | TokenError> {
    if ("apiKey" in grant) {
      if (app !== undefined) return METHOD_CHANGED;
      const check = await checkApiKey(grant.apiKey);
      if (check === "ok") return keyTokens(grant.apiKey);
      return check === "refused"
        ? invalidGrant("Redmine no longer accepts the API key")
        : UNREACHABLE;
    }
    if (app === undefined) return METHOD_CHANGED;
    return redmineToken(app, { grant_type: "refresh_token", refresh_token: grant.redmineRefresh });
  }

  async function refresh(form: URLSearchParams, client: string) {
    const old = await sealer.open<RefreshPayload>("refresh", form.get("refresh_token") ?? "");
    if (old === undefined) return invalidGrant("The refresh token is invalid or has expired");
    if (old.client !== client) {
      return invalidGrant("The refresh token was issued to another client");
    }
    const requested = form.get("scope");
    const top = requested === null ? old.scopes.length - 1 : lastIndexIn(old.scopes, requested);
    if (top === -1) {
      return { status: 400, error: "invalid_scope", description: "scope exceeds the grant" };
    }
    const upstream = await refreshUpstream(old.grant);
    return "error" in upstream ? upstream : issue(upstream, old.scopes.slice(0, top + 1), client);
  }

  function keyTokens(apiKey: string): Upstream {
    return { credential: { apiKey }, refresh: { apiKey }, expiresIn: ACCESS_TTL };
  }

  /** Our token pair over Redmine's credential, never outliving Redmine's access token. */
  async function issue(upstream: Upstream, scopes: Scope[], client: string): Promise<TokenSet> {
    const lifetime = Math.min(ACCESS_TTL, upstream.expiresIn - EXPIRY_SKEW);
    const accessPayload: AccessPayload = {
      credential: upstream.credential,
      scopes,
      client,
      audience: issuer,
    };
    const refreshPayload: RefreshPayload = { grant: upstream.refresh, scopes, client };
    return {
      access_token: await sealer.seal("access", accessPayload, lifetime),
      token_type: "Bearer",
      expires_in: lifetime,
      refresh_token: await sealer.seal("refresh", refreshPayload, REFRESH_TTL),
      scope: scopes.join(" "),
    };
  }

  /** A grant at Redmine's token endpoint, authenticated as the confidential application. */
  async function redmineToken(
    app: { clientId: string; clientSecret: string },
    params: Record<string, string>,
  ): Promise<Upstream | TokenError> {
    let response: Response;
    try {
      response = await context.fetch(new URL("oauth/token", redmineUrl), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          ...params,
          client_id: app.clientId,
          client_secret: app.clientSecret,
        }),
        signal: AbortSignal.timeout(REDMINE_TIMEOUT_MS),
      });
    } catch (error) {
      onError?.(new Error(`Redmine's token endpoint did not answer: ${String(error)}`));
      return UNREACHABLE;
    }
    const body: unknown = await response.json().catch(() => undefined);
    const tokens = RedmineTokens.safeParse(body);
    if (response.ok && tokens.success) {
      return {
        credential: { bearer: tokens.data.access_token },
        refresh: { redmineRefresh: tokens.data.refresh_token },
        expiresIn: tokens.data.expires_in ?? ACCESS_TTL,
      };
    }
    const error = (body as { error?: unknown } | undefined)?.error;
    if (error === "invalid_grant") {
      return invalidGrant("Redmine refused the grant: it was used, revoked or has expired");
    }
    // Anything else is the operator's to fix, such as a wrong client secret.
    onError?.(
      new Error(
        `Redmine's token endpoint answered ${response.status}${typeof error === "string" ? ` ${error}` : ""}`,
      ),
    );
    return { status: 502, error: "server_error", description: "Redmine refused the token request" };
  }

  async function register(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return openPreflight(request, "POST");
    if (request.method !== "POST") return methodNotAllowed("POST");
    const text = await readText(request, FORM_MAX_BYTES);
    let body: unknown;
    try {
      body = text === undefined ? undefined : JSON.parse(text);
    } catch {
      body = undefined;
    }
    const registered = await clients.register(body);
    return registered.ok
      ? Response.json(registered.body, { status: 201, headers: TOKEN_HEADERS })
      : Response.json(
          { error: registered.error, error_description: registered.description },
          { status: 400, headers: TOKEN_HEADERS },
        );
  }

  const routes = new Map<string, (request: Request) => Promise<Response>>([
    ...paths.authorizationServerMetadata.map(
      (path) => [path, async (request: Request) => publicDocument(request, metadata)] as const,
    ),
    [paths.authorize, authorize],
    [paths.callback, callback],
    [paths.token, token],
    [paths.register, register],
  ]);

  return {
    verifier: {
      issuer,
      async verify(value) {
        const payload = await sealer.open<AccessPayload>("access", value);
        return (
          payload && {
            credential: payload.credential,
            scopes: payload.scopes,
            resource: payload.audience,
            expiresAt: payload.exp!,
            clientId: payload.client,
          }
        );
      },
    },
    serve: (request, path) => routes.get(path)?.(request),
  };
}

interface TokenSet {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** Token and registration answers: never cached, and readable from any origin. */
const TOKEN_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
};

function tokenResponse(tokens: TokenSet): Response {
  return Response.json(tokens, { headers: TOKEN_HEADERS });
}

function tokenError({ status, error, description }: TokenError): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: TOKEN_HEADERS },
  );
}

function invalidGrant(description: string): TokenError {
  return { status: 400, error: "invalid_grant", description };
}

const UNREACHABLE: TokenError = {
  status: 502,
  error: "server_error",
  description: "Redmine did not answer",
};

/** Turning apiKeyLogin off ends the key-based grants, and the other way round. */
const METHOD_CHANGED = invalidGrant("This server signs people in another way now. Sign in again.");

/** The index of the highest of `granted` that `requested` names, or -1. */
function lastIndexIn(granted: readonly Scope[], requested: string): number {
  const names = requested.split(" ");
  return granted.findLastIndex((scope) => names.includes(scope));
}

/** Codes redeemed by this process, until they expire. */
function replayGuard(): (id: string, exp: number) => boolean {
  const seen = new Map<string, number>();
  return (id, exp) => {
    const at = now();
    for (const [key, until] of seen) if (until < at) seen.delete(key);
    if (seen.has(id)) return false;
    seen.set(id, exp);
    return true;
  };
}

async function readForm(request: Request): Promise<URLSearchParams | undefined> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) return undefined;
  const text = await readText(request, FORM_MAX_BYTES);
  return text === undefined ? undefined : new URLSearchParams(text);
}

function cookie(request: Request, name: string): string | undefined {
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at !== -1 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return undefined;
}

function redirect(
  target: string,
  params: Record<string, string | undefined>,
  status: number,
): Response {
  const url = new URL(target);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  return new Response(null, {
    status,
    headers: { Location: url.href, "Cache-Control": "no-store" },
  });
}

/** Resource identifiers compared as the MCP SDK compares audiences: parsed, without one trailing slash. */
function sameResource(requested: string, identifier: string): boolean {
  try {
    return comparablePath(new URL(requested).href) === comparablePath(new URL(identifier).href);
  } catch {
    return false;
  }
}

function withSlash(url: URL): URL {
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}
