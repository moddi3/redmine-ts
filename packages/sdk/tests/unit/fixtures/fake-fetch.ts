import type { Listing } from "../../../src/core/listing.ts";
import type { AnyOp } from "../../../src/core/op.ts";
import { createEngine, type Engine } from "../../../src/core/engine.ts";
import { RedmineError } from "../../../src/core/errors.ts";
import { resolveConfig, type CallOptions, type RedmineConfig } from "../../../src/core/config.ts";

export interface Recorded {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly bytes: Uint8Array;
  readonly signal: AbortSignal;
  text(): string;
  json(): unknown;
}

export type Responder = (request: Recorded, call: number) => Response | Promise<Response>;

export interface Fake {
  readonly fetch: typeof fetch;
  readonly requests: Recorded[];
}

/** A fetch that records every Request it receives and answers through `respond`. */
export function fakeFetch(respond: Responder): Fake {
  const requests: Recorded[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const bytes = new Uint8Array(await request.clone().arrayBuffer());
    const recorded: Recorded = {
      url: new URL(request.url),
      method: request.method,
      headers: request.headers,
      bytes,
      signal: request.signal,
      text: () => new TextDecoder().decode(bytes),
      json: () => JSON.parse(new TextDecoder().decode(bytes)),
    };
    requests.push(recorded);
    return respond(recorded, requests.length);
  };
  return { fetch: fetchImpl, requests };
}

/** Answers with each response in turn, repeating the last one. */
export function sequence(...responses: Array<Response | (() => Response)>): Responder {
  return (_request, call) => {
    const next = responses[Math.min(call, responses.length) - 1];
    if (next === undefined) throw new Error("empty sequence");
    return typeof next === "function" ? next() : next.clone();
  };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export const empty = (status = 204, headers: Record<string, string> = {}): Response =>
  new Response(null, { status, headers });

export const html = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "content-type": "text/html" } });

/** Never answers; rejects with the abort reason once the request's signal fires, like a real fetch. */
export function hang(request: Recorded): Promise<Response> {
  return new Promise((_resolve, reject) => {
    request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
  });
}

/** The impersonation guard's own check: users/current without the switch header. */
export const isGuardCheck = (request: Recorded): boolean =>
  request.url.pathname.endsWith("/users/current.json") &&
  !request.headers.has("x-redmine-switch-user");

/**
 * Answers the guard's check for a key that belongs to an admin or to a plain member, and hands every
 * other request to `respond` with a call count that does not include the check.
 */
export function keyOf(role: "admin" | "member", respond: Responder): Responder {
  let forwarded = 0;
  return (request) =>
    isGuardCheck(request)
      ? json({ user: { id: 1, login: "key-owner", admin: role === "admin" } })
      : respond(request, ++forwarded);
}

export const exceptGuard = (requests: readonly Recorded[]): Recorded[] =>
  requests.filter((request) => !isGuardCheck(request));

export const BASE_URL = "https://tracker.example.com/redmine";

export interface TestEngine extends Fake {
  readonly engine: Engine;
  /** `engine.call` for operations that resolve to a value. AnyOp erases the return type to never. */
  readonly call: (
    op: AnyOp,
    input: Record<string, unknown>,
    options?: CallOptions,
  ) => Promise<unknown>;
  readonly list: (
    op: AnyOp,
    input?: Record<string, unknown>,
    options?: CallOptions,
  ) => Listing<unknown>;
}

/** An engine over a fake fetch with fast retries, behind a `/redmine` subpath. */
export function testEngine(respond: Responder, config: Partial<RedmineConfig> = {}): TestEngine {
  const fake = fakeFetch(respond);
  const engine = createEngine(
    resolveConfig({
      baseUrl: BASE_URL,
      auth: { apiKey: "secret-key" },
      fetch: fake.fetch,
      retry: { attempts: 2, baseMs: 1, maxMs: 5 },
      ...config,
    }),
  );
  return {
    ...fake,
    engine,
    call: (op, input, options) => engine.call(op, input, options),
    list: (op, input = {}, options) => engine.call(op, input, options),
  };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The RedmineError a promise rejects with. Fails the test when it resolves or rejects with anything else. */
export async function failure(promise: Promise<unknown>): Promise<RedmineError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RedmineError) return error;
    throw error;
  }
  throw new Error("expected the call to reject");
}
