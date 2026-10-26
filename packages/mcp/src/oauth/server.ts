// The built-in authorization server. MCP clients register and get tokens here; people sign in at
// Redmine's own OAuth (Redmine 6.1+) through one confidential application the admin creates, or, as an
// opt-in fallback, paste their API key into the consent page. Codes, tokens, states and registrations
// are sealed; what must be used once, and token families that end, are marked in a grant store, or in
// a per-process cache without one. The client's token never reaches Redmine; each request opens it to
// the Redmine credential it seals.

import type { Access, RedmineVersion } from "@redmine-ts/sdk";
import { z } from "zod";
import type { BearerGrant, BearerVerifier } from "../http.ts";
import { checkApiKey, KEY_CHECK_TIMEOUT_MS } from "../redmine-key.ts";
import type { KeyVerdict } from "../redmine-key.ts";
import { JWT_BEARER, peek, SIGNING_ALGS } from "./assertion.ts";
import { allowsRedirect, BUSY, BUSY_RETRY_SECONDS, createClients } from "./clients.ts";
import type { Client, ClientAuthentication } from "./clients.ts";
import { consentPage, errorPage } from "./pages.ts";
import { grantedScopes, redmineScope, scopeNames, scopesFor } from "./scopes.ts";
import type { Scope } from "./scopes.ts";
import { createSealer, isStrongSecret, now, randomToken, SECRET_RULE, sha256 } from "./seal.ts";
import { failingClosed, memoryGrantStore, StoreUnavailable } from "./store.ts";
import type { GrantStore } from "./store.ts";
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
   * The secret everything the server hands out is sealed with: at least 32 random characters, such as
   * the output of `openssl rand -base64 32`, never a passphrase. Changing it signs every client out.
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
   * of a registered client. Each entry matches one name exactly, and a `*` throws when the server is
   * created, as `--allow-client` refuses it. Default: any client.
   */
  allowedClientHosts?: readonly string[];
  /**
   * Fetches the Client ID Metadata Documents clients name by URL, and the key sets those documents
   * name. Required, because those URLs are the caller's choice: the fetch must not reach the server's
   * own network. On Node pass `publicFetch` from `@redmine-ts/mcp/node`, which refuses private and
   * special-use addresses; the CLI does. On Workers, which cannot reach private addresses, pass the
   * global fetch with the `global_fetch_strictly_public` compatibility flag on, so a URL on the
   * Worker's own zone goes through Cloudflare's front door, and its security settings, instead of
   * straight to the origin.
   */
  fetchClientMetadata: typeof fetch;
  /**
   * Marks codes, Redmine states and refresh tokens used, and ends token families. With it, a refresh
   * token works once, and reusing it, or a code, ends every token issued from the same sign-in. Every
   * instance that serves this publicUrl must share it, atomically: `memoryGrantStore()` for a single
   * process, as the CLI runs; a Durable Object on Workers, where KV is not consistent enough. Without
   * it, codes and states are single-use per process only, refresh tokens do not rotate, and an
   * API-key sign-in ends 30 days after consent.
   */
  store?: GrantStore;
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
/**
 * A code or refresh token that comes back this soon after its first use is the same client racing
 * itself, such as two processes refreshing at once or a retry after a timeout. It is refused, and the
 * sign-in stays; later, a second use means one leaked, and the sign-in ends.
 */
const REUSE_WINDOW = 30;
/**
 * Margin between our token's end and Redmine's, for clocks and slow requests. A Redmine token shorter
 * than twice this keeps half its life as the margin, so ours is never issued expired.
 */
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

/**
 * API keys one sign-in may try. Each consent value is used once, so the count holds within a
 * sign-in; a new sign-in starts again, which the per-browser count and the in-flight cap bound.
 */
const KEY_ATTEMPTS = 5;
/**
 * Failed keys one browser may try in an hour, counted in the grant store. A browser that drops its
 * cookie starts again, so this is no rate limit per address; a proxy in front can add one.
 */
const KEY_FAILURES_PER_HOUR = 10;
const HOUR = 3600;
/** Keys the consent form may be checking at Redmine at once, in this process. */
const KEY_CHECKS_IN_FLIGHT = 4;
/**
 * A key check gives up within its timeout, unless the request that started it was cancelled, as
 * Workers cancel the work of a request whose client disconnects. Its slot is then free after this long.
 */
const KEY_CHECK_MS = KEY_CHECK_TIMEOUT_MS + 1000;

const OTHER_BROWSER =
  "This sign-in did not start in this browser, or the browser dropped its cookie. Start again from your client.";

const PKCE_VERIFIER = /^[\w.~-]{43,128}$/;
const S256_CHALLENGE = /^[\w-]{43}$/;

/** A client that must prove a key at the token endpoint, as its metadata document declared. */
type KeyBound = Exclude<ClientAuthentication["method"], "none">;

/** The request the person sees on the consent page, carried through the form. */
interface ConsentPayload {
  /** Single use: each answer to the page needs a page of its own. */
  id: string;
  /** API keys Redmine was asked about from this sign-in so far. */
  attempts: number;
  /** The browser nonce from the cookie. */
  n: string;
  client: string;
  redirect: string;
  challenge: string;
  scopes: Scope[];
  state: string | undefined;
  /** From the client's document at authorize, so every grant of the sign-in needs the key. */
  auth?: KeyBound;
}

/** What the redirect to Redmine carries and the callback needs. */
interface StatePayload {
  /** Single use: replaying the redirect to Redmine must not mint a second code. */
  id: string;
  n: string;
  /** SHA-256 of the client_id, which binds the code without carrying a long registration. */
  client: string;
  redirect: string;
  challenge: string;
  scopes: Scope[];
  state: string | undefined;
  /** The PKCE verifier for Redmine's code. */
  verifier: string;
  auth?: KeyBound;
}

/** What a code stands for at Redmine: its code and our PKCE verifier for it, or a checked API key. */
type CodeGrant = { redmineCode: string; verifier: string } | { apiKey: string };

/** What a refresh token stands for at Redmine. */
type RefreshGrant = { redmineRefresh: string } | { apiKey: string };

/** What the code and every refresh token of one sign-in carry. */
interface SignIn {
  /** The sign-in every token from the code belongs to, which a store can end as one. */
  family: string;
  /** Seconds since the epoch when an API-key grant ends, without a store to rotate it. */
  until?: number;
  /** SHA-256 of the client_id. */
  client: string;
  /** Set when the client must prove a key at the token endpoint; a public client proves PKCE alone. */
  auth?: KeyBound;
}

interface CodePayload extends SignIn {
  /** Single use. */
  id: string;
  grant: CodeGrant;
  redirect: string;
  challenge: string;
  scopes: Scope[];
}

interface AccessPayload {
  family: string;
  credential: BearerGrant["credential"];
  scopes: Scope[];
  client: string;
  audience: string;
}

interface RefreshPayload extends SignIn {
  /** Single use, with a store. */
  id: string;
  grant: RefreshGrant;
  scopes: Scope[];
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
  expires_in: z.number().int().positive().optional(),
});

type TokenError = { status: number; error: string; description: string; retryAfter?: number };

/** Who a token request comes from: its client_id, that client_id hashed, and its assertion if any. */
interface Caller {
  id: string;
  hash: string;
  assertion: string | undefined;
}

export function createAuthorizationServer(
  options: RedmineOAuthOptions,
  context: AuthorizationServerContext,
): AuthorizationServer {
  // Called unbound, never as context.fetch(): Workers refuse their fetch called as a method.
  const { paths, redmineUrl, fetch: send, version, access, onError } = context;
  const secrets = [options.secret, ...(options.previousSecret ? [options.previousSecret] : [])];
  if (!secrets.every(isStrongSecret)) {
    throw new TypeError(`oauth.secret and oauth.previousSecret ${SECRET_RULE}`);
  }
  const app = options.redmineApp;
  if (app === undefined ? options.apiKeyLogin !== true : !app.clientId || !app.clientSecret) {
    throw new TypeError(
      "oauth needs redmineApp with the clientId and clientSecret Redmine showed, or apiKeyLogin",
    );
  }
  if (typeof options.fetchClientMetadata !== "function") {
    throw new TypeError(
      "oauth.fetchClientMetadata is required: pass publicFetch from @redmine-ts/mcp/node on Node, or on Workers the global fetch with the global_fetch_strictly_public flag",
    );
  }
  // URL parsing keeps a `*` in a hostname, so a wildcard would pass as a name and match only itself.
  if (options.allowedClientHosts?.some((host) => host.includes("*"))) {
    throw new TypeError("oauth.allowedClientHosts does not support wildcards: list each hostname");
  }
  const redminePublic = withSlash(new URL(options.redminePublicUrl ?? redmineUrl));
  const issuer = paths.identifier;
  const sealer = createSealer(secrets, issuer);
  const clients = createClients({
    sealer,
    fetch: options.fetchClientMetadata,
    allowedHosts: options.allowedClientHosts,
    audiences: [issuer, paths.origin + paths.token],
  });
  const callbackUrl = paths.origin + paths.callback;
  // Codes and states are used once: across instances through the store, or in this process.
  const shared = options.store && failingClosed(options.store);
  const once = shared ?? memoryGrantStore();
  // Rotation and ending families need every instance to agree, so they need a store.
  const families = shared;
  /** Ends every token of a sign-in: a reused code or refresh token means one leaked. */
  const end = async (family: string) => {
    await families?.consume(`family:${family}`, REFRESH_TTL);
  };
  /** Key checks under way, each counted until it settles or its time is up. */
  const keyChecks = new Set<{ until: number }>();
  const metadata = {
    issuer,
    authorization_endpoint: paths.origin + paths.authorize,
    token_endpoint: paths.origin + paths.token,
    registration_endpoint: paths.origin + paths.register,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    token_endpoint_auth_signing_alg_values_supported: SIGNING_ALGS,
    code_challenge_methods_supported: ["S256"],
    scopes_supported: scopesFor(access),
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };

  /**
   * When no fetch can answer in time, because every slot is taken or the client's own fetch did not
   * settle. Nothing is known against the client, so it may retry.
   */
  const busy = (message: string) =>
    errorPage(503, message, { "Retry-After": String(BUSY_RETRY_SECONDS) });

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
    if (client === BUSY) {
      return busy("The server is busy checking clients. Reload this page in a moment.");
    }
    if (typeof client === "string") {
      return errorPage(400, `This server refuses the client: ${client}.`);
    }
    if (!allowsRedirect(client, redirectUri)) {
      return errorPage(400, "The redirect_uri is not one the client registered.");
    }
    // Until the person decides, nothing redirects: a registered client could otherwise send a
    // malformed request and turn this trusted URL into a redirect to wherever it registered.
    const refuse = (reason: string) =>
      errorPage(
        400,
        `The client's sign-in request is invalid: ${reason}. Start again from your client.`,
      );
    const state = params.get("state") ?? undefined;
    if (state !== undefined && state.length > STATE_MAX_LENGTH) {
      return refuse(`state is longer than ${STATE_MAX_LENGTH} characters`);
    }
    if (params.get("response_type") !== "code") {
      return refuse("only response_type=code is supported");
    }
    const challenge = params.get("code_challenge") ?? "";
    if (params.get("code_challenge_method") !== "S256" || !S256_CHALLENGE.test(challenge)) {
      return refuse("PKCE with code_challenge_method=S256 is required");
    }
    const resource = params.get("resource");
    if (resource !== null && !sameResource(resource, issuer)) {
      return refuse(`this server issues tokens only for ${issuer}`);
    }
    const scopes = grantedScopes(params.get("scope"), access);
    if (scopes === undefined) {
      return refuse(`the scope names none of ${scopesFor(access).join(", ")}`);
    }
    const nonce = (await browserNonce(request)) ?? randomToken();
    const consent: ConsentPayload = {
      id: randomToken(),
      attempts: 0,
      n: nonce,
      client: clientId,
      redirect: redirectUri,
      challenge,
      scopes,
      state,
      auth: client.authentication.method === "none" ? undefined : client.authentication.method,
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
    if (!(await once.consume(`consent:${consent.id}`, FLOW_TTL))) {
      return errorPage(400, "This sign-in page was already sent. Start again from your client.");
    }
    if (form?.get("decision") !== "allow") {
      return back(consent.redirect, { error: "access_denied", state: consent.state }, 303);
    }
    if (app === undefined) return checkKey(form, consent);
    const verifier = randomToken();
    const state: StatePayload = {
      id: randomToken(),
      n: consent.n,
      client: await sha256(consent.client),
      redirect: consent.redirect,
      challenge: consent.challenge,
      scopes: consent.scopes,
      state: consent.state,
      verifier,
      auth: consent.auth,
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
  async function checkKey(
    form: URLSearchParams,
    consent: ConsentPayload & { exp?: number },
  ): Promise<Response> {
    const apiKey = form.get("api_key")?.trim() ?? "";
    // The page that answered is spent; the next try needs a new one, which carries the count.
    const again = async (attempts: number, status: number, keyError: string) => {
      const client = await clients.resolve(consent.client);
      if (client === BUSY) {
        return busy(
          "The server is busy checking clients, so this sign-in stops here. Start again from your client in a moment.",
        );
      }
      if (typeof client === "string") {
        return errorPage(400, `This server refuses the client: ${client}.`);
      }
      const next: ConsentPayload = { ...consent, id: randomToken(), attempts };
      const sealed = await sealer.seal("consent", next, consent.exp! - now());
      return showConsent(client, next, sealed, { status, keyError });
    };
    if (apiKey === "") return again(consent.attempts, 400, "Paste your API key.");
    const failures = `keyfail:${consent.n}`;
    if (families !== undefined && (await families.has(`${failures}:${KEY_FAILURES_PER_HOUR}`))) {
      return errorPage(
        429,
        "Too many keys were tried from this browser in the last hour. Try again later.",
      );
    }
    const at = Date.now();
    for (const lease of keyChecks) if (lease.until <= at) keyChecks.delete(lease);
    if (keyChecks.size >= KEY_CHECKS_IN_FLIGHT) {
      return again(
        consent.attempts,
        503,
        "Many keys are being checked right now. Try again in a moment.",
      );
    }
    const lease = { until: at + KEY_CHECK_MS };
    keyChecks.add(lease);
    let check: KeyVerdict;
    try {
      check = await checkKeyAtRedmine(apiKey);
    } finally {
      keyChecks.delete(lease);
    }
    if (check !== "ok") {
      if (families !== undefined) await countFailure(families, failures);
      const attempts = consent.attempts + 1;
      const unanswered = check === "unreachable";
      if (attempts >= KEY_ATTEMPTS) {
        return errorPage(
          unanswered ? 503 : 400,
          unanswered
            ? "Redmine did not answer, so this sign-in stops here. Start again from your client in a moment."
            : "Too many keys were tried on this sign-in. Start again from your client.",
        );
      }
      return unanswered
        ? again(attempts, 503, "Redmine did not answer. Try again in a moment.")
        : again(attempts, 400, "Redmine does not accept this key.");
    }
    const ours: CodePayload = {
      id: randomToken(),
      family: randomToken(),
      // Without a store to detect a stolen refresh token, the grant does not renew past 30 days.
      ...(families === undefined ? { until: now() + REFRESH_TTL } : {}),
      grant: { apiKey },
      client: await sha256(consent.client),
      auth: consent.auth,
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

  /** Records one failed key in the first free hourly slot under `key`. */
  async function countFailure(store: GrantStore, key: string): Promise<void> {
    for (let slot = 1; slot <= KEY_FAILURES_PER_HOUR; slot++) {
      if (await store.consume(`${key}:${slot}`, HOUR)) return;
    }
  }

  function checkKeyAtRedmine(apiKey: string): Promise<KeyVerdict> {
    return checkApiKey({ baseUrl: redmineUrl, fetch: send }, apiKey, { onError });
  }

  /** Redmine sends the person back here, signed in or not. */
  async function callback(request: Request): Promise<Response> {
    if (request.method !== "GET") return methodNotAllowed("GET");
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
    if (!(await once.consume(`state:${state.id}`, FLOW_TTL))) {
      return errorPage(
        400,
        "This sign-in already came back from Redmine. Start again from your client.",
      );
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
      family: randomToken(),
      grant: { redmineCode: code, verifier: state.verifier },
      client: state.client,
      auth: state.auth,
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
    const caller = await identify(form);
    if ("error" in caller) return tokenError(caller);
    const grantType = form.get("grant_type");
    const result =
      grantType === "authorization_code"
        ? await redeemCode(form, caller)
        : grantType === "refresh_token"
          ? await refresh(form, caller)
          : {
              status: 400,
              error: "unsupported_grant_type",
              description: "Use authorization_code or refresh_token",
            };
    return "access_token" in result ? tokenResponse(result) : tokenError(result);
  }

  /**
   * The client a token request names: its client_id, or the sub of its client_assertion, which RFC
   * 7521 makes client_id optional for. When both are sent they must agree. Nothing is verified yet.
   */
  async function identify(form: URLSearchParams): Promise<Caller | TokenError> {
    const sent = form.get("client_id") || undefined;
    const assertion = form.get("client_assertion") ?? undefined;
    if (assertion === undefined && !form.has("client_assertion_type")) {
      if (sent === undefined) return invalidClient("Send client_id");
      return { id: sent, hash: await sha256(sent), assertion };
    }
    if (assertion === undefined || form.get("client_assertion_type") !== JWT_BEARER) {
      return invalidClient(`Send client_assertion with client_assertion_type ${JWT_BEARER}`);
    }
    const claimed = peek(assertion)?.sub;
    if (typeof claimed !== "string") {
      return invalidClient("The client_assertion is not a JWT that names its client in sub");
    }
    if (sent !== undefined && sent !== claimed) {
      return invalidClient("client_id differs from the sub of the client_assertion");
    }
    return { id: claimed, hash: await sha256(claimed), assertion };
  }

  /**
   * Checks the client's proof for a grant sealed with `auth`. A grant bound to a key needs a
   * client_assertion that verifies, once; any other grant must come without one, as RFC 6749 allows
   * one authentication method per request.
   */
  async function authenticate(caller: Caller, auth: KeyBound | undefined) {
    if (auth === undefined) {
      return caller.assertion === undefined
        ? undefined
        : invalidClient("Send no client_assertion: this client is public, and PKCE proves it");
    }
    if (caller.assertion === undefined) {
      return invalidClient(
        "Send a client_assertion: this client authenticates with private_key_jwt",
      );
    }
    const verdict = await clients.authenticate(caller.id, caller.assertion);
    if (verdict === BUSY) return CLIENTS_BUSY;
    if ("unreachable" in verdict) {
      return {
        status: 502,
        error: "server_error",
        description: `Client authentication failed: ${verdict.unreachable}`,
      };
    }
    if ("refused" in verdict) {
      return invalidClient(`Client authentication failed: ${verdict.refused}`);
    }
    const jti = `assertion:${caller.hash}:${await sha256(verdict.jti)}`;
    if (!(await once.consume(jti, verdict.ttl))) {
      return invalidClient("Client authentication failed: the client_assertion was already used");
    }
    return undefined;
  }

  async function redeemCode(form: URLSearchParams, caller: Caller) {
    const code = await sealer.open<CodePayload>("code", form.get("code") ?? "");
    if (code === undefined) return invalidGrant("The code is invalid or has expired");
    if (code.client !== caller.hash) return invalidGrant("The code was issued to another client");
    const unauthenticated = await authenticate(caller, code.auth);
    if (unauthenticated !== undefined) return unauthenticated;
    // OAuth 2.1 clients leave redirect_uri out; PKCE binds the exchange. When sent, it must match.
    const redirectUri = form.get("redirect_uri");
    if (redirectUri !== null && redirectUri !== code.redirect) {
      return invalidGrant("redirect_uri differs from the authorization request");
    }
    const verifier = form.get("code_verifier") ?? "";
    if (!PKCE_VERIFIER.test(verifier) || (await sha256(verifier)) !== code.challenge) {
      return invalidGrant("code_verifier does not match the code_challenge");
    }
    // Checked before Redmine and marked after it, so an outage spends nothing and the client may
    // retry; a second use ends what the first one issued, unless it races the first.
    const used = `code:${code.id}`;
    const again = "The code was already used";
    if (await once.has(used)) return usedAgain(once, code.id, code.family, again);
    const upstream = await redeemUpstream(code.grant);
    if ("error" in upstream) return upstream;
    if (!(await spend(once, used, code.id, CODE_TTL))) {
      return usedAgain(once, code.id, code.family, again);
    }
    return issue(upstream, code.scopes, code);
  }

  /**
   * Marks `id` used once Redmine has answered. The reuse marker goes first, so a request that loses the
   * race for the same id always finds it.
   */
  async function spend(store: GrantStore, key: string, id: string, ttl: number): Promise<boolean> {
    await store.consume(`recent:${id}`, REUSE_WINDOW);
    return store.consume(key, ttl);
  }

  /** A second use of `id`: within the reuse window a race, refused; after it a leak. */
  async function usedAgain(
    store: GrantStore,
    id: string,
    family: string,
    description: string,
  ): Promise<TokenError> {
    if (await store.has(`recent:${id}`)) return invalidGrant(`${description} a moment ago`);
    return reused(family, description);
  }

  async function reused(family: string, description: string): Promise<TokenError> {
    if (families === undefined) return invalidGrant(description);
    await end(family);
    return invalidGrant(`${description}; every token from this sign-in is ended`);
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
      const check = await checkKeyAtRedmine(grant.apiKey);
      if (check === "ok") return keyTokens(grant.apiKey);
      return check === "refused"
        ? invalidGrant("Redmine no longer accepts the API key")
        : UNREACHABLE;
    }
    if (app === undefined) return METHOD_CHANGED;
    return redmineToken(app, { grant_type: "refresh_token", refresh_token: grant.redmineRefresh });
  }

  async function refresh(form: URLSearchParams, caller: Caller) {
    const old = await sealer.open<RefreshPayload>("refresh", form.get("refresh_token") ?? "");
    if (old === undefined) return invalidGrant("The refresh token is invalid or has expired");
    if (old.client !== caller.hash) {
      return invalidGrant("The refresh token was issued to another client");
    }
    const unauthenticated = await authenticate(caller, old.auth);
    if (unauthenticated !== undefined) return unauthenticated;
    // A refresh may narrow the grant, never widen it or name anything else.
    const requested = scopeNames(form.get("scope"));
    if (requested.some((name) => !(old.scopes as string[]).includes(name))) {
      return {
        status: 400,
        error: "invalid_scope",
        description: "scope names what the grant lacks",
      };
    }
    const top =
      requested.length === 0
        ? old.scopes.length - 1
        : old.scopes.findLastIndex((scope) => requested.includes(scope));
    // With a store, a refresh token works once, checked before Redmine and marked after it, as codes.
    const used = `refresh:${old.id}`;
    const again = "The refresh token was already used";
    if (families !== undefined) {
      if (await families.has(`family:${old.family}`)) {
        return invalidGrant("This sign-in was ended. Sign in again.");
      }
      if (await families.has(used)) return usedAgain(families, old.id, old.family, again);
    }
    const upstream = await refreshUpstream(old.grant);
    if ("error" in upstream) return upstream;
    if (families !== undefined && !(await spend(families, used, old.id, REFRESH_TTL))) {
      return usedAgain(families, old.id, old.family, again);
    }
    return issue(upstream, old.scopes.slice(0, top + 1), old);
  }

  function keyTokens(apiKey: string): Upstream {
    return { credential: { apiKey }, refresh: { apiKey }, expiresIn: ACCESS_TTL };
  }

  /**
   * Our token pair over Redmine's credential, never outliving Redmine's access token, nor the end of
   * an API-key grant without a store.
   */
  async function issue(
    upstream: Upstream,
    scopes: Scope[],
    { family, until, client, auth }: SignIn,
  ): Promise<TokenSet> {
    const left = until === undefined ? REFRESH_TTL : until - now();
    const skew = Math.min(EXPIRY_SKEW, Math.floor(upstream.expiresIn / 2));
    const lifetime = Math.min(ACCESS_TTL, upstream.expiresIn - skew, left);
    const accessPayload: AccessPayload = {
      family,
      credential: upstream.credential,
      scopes,
      client,
      audience: issuer,
    };
    const refreshPayload: RefreshPayload = {
      id: randomToken(),
      family,
      ...(until === undefined ? {} : { until }),
      grant: upstream.refresh,
      scopes,
      client,
      auth,
    };
    return {
      access_token: await sealer.seal("access", accessPayload, lifetime),
      token_type: "Bearer",
      expires_in: lifetime,
      refresh_token: await sealer.seal("refresh", refreshPayload, Math.min(REFRESH_TTL, left)),
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
      response = await send(new URL("oauth/token", redmineUrl), {
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

  /**
   * A grant store that fails refuses what needs it, closed, with an answer to retry: an error page
   * for a person, temporarily_unavailable for a client.
   */
  const whenStoreFails =
    (serve: (request: Request) => Promise<Response>, answer: () => Response) =>
    async (request: Request): Promise<Response> => {
      try {
        return await serve(request);
      } catch (error) {
        if (!(error instanceof StoreUnavailable)) throw error;
        onError?.(error);
        return answer();
      }
    };
  const pageWhenStoreFails = () =>
    errorPage(503, "Sign-in is unavailable for a moment. Try again shortly from your client.");
  const routes = new Map<string, (request: Request) => Promise<Response>>([
    ...paths.authorizationServerMetadata.map(
      (path) => [path, async (request: Request) => publicDocument(request, metadata)] as const,
    ),
    [paths.authorize, whenStoreFails(authorize, pageWhenStoreFails)],
    // API key sign-in never sends anyone to Redmine, so nothing comes back.
    ...(app === undefined
      ? []
      : [[paths.callback, whenStoreFails(callback, pageWhenStoreFails)] as const]),
    [paths.token, whenStoreFails(token, () => tokenError(STORE_DOWN))],
    [paths.register, register],
  ]);

  return {
    verifier: {
      issuer,
      async verify(value) {
        const payload = await sealer.open<AccessPayload>("access", value);
        if (payload === undefined) return undefined;
        if (families !== undefined && (await families.has(`family:${payload.family}`))) {
          return undefined;
        }
        return {
          credential: payload.credential,
          scopes: payload.scopes,
          resource: payload.audience,
          expiresAt: payload.exp!,
          clientId: payload.client,
        };
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

function tokenError({ status, error, description, retryAfter }: TokenError): Response {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers:
        retryAfter === undefined
          ? TOKEN_HEADERS
          : { ...TOKEN_HEADERS, "Retry-After": String(retryAfter) },
    },
  );
}

function invalidGrant(description: string): TokenError {
  return { status: 400, error: "invalid_grant", description };
}

/** RFC 6749 section 5.2: client authentication failed. */
function invalidClient(description: string): TokenError {
  return { status: 401, error: "invalid_client", description };
}

/** When no fetch can check the client in time; nothing is known against it, so it may retry. */
const CLIENTS_BUSY: TokenError = {
  status: 503,
  error: "temporarily_unavailable",
  description: "The server is busy checking clients. Try again in a moment.",
  retryAfter: BUSY_RETRY_SECONDS,
};

const STORE_DOWN: TokenError = {
  status: 503,
  error: "temporarily_unavailable",
  description: "The server cannot record grants right now. Try again in a moment.",
};

const UNREACHABLE: TokenError = {
  status: 502,
  error: "server_error",
  description: "Redmine did not answer",
};

/** Turning apiKeyLogin off ends the key-based grants, and the other way round. */
const METHOD_CHANGED = invalidGrant("This server signs people in another way now. Sign in again.");

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
