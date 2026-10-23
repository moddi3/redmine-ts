import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { Client } from "@modelcontextprotocol/client";
import type { RedmineConfig } from "@redmine-ts/sdk";
import { expect } from "vite-plus/test";
import { connect, texts } from "../connect.ts";
import type { ServerSettings } from "../connect.ts";

// ajv-formats is CommonJS with its plugin on `default`.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

export interface Seen {
  method: string;
  url: URL;
  contentType: string | null;
  bytes: Uint8Array;
  /** The parsed JSON body, when there is one. */
  body: unknown;
}

/** Answers one `METHOD /path` of the fake Redmine. */
export type Route = (request: Seen) => Response;

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A Redmine at http://redmine.test that answers `routes` and 404s anything else, recording every request. */
export async function serve(
  routes: Readonly<Record<string, Route>>,
  config: Partial<RedmineConfig> = {},
  settings?: ServerSettings,
): Promise<{ client: Client; seen: Seen[] }> {
  const seen: Seen[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const contentType = request.headers.get("content-type");
    const entry: Seen = {
      method: request.method,
      url: new URL(request.url),
      contentType,
      bytes,
      body:
        contentType === "application/json" && bytes.length > 0
          ? JSON.parse(new TextDecoder().decode(bytes))
          : undefined,
    };
    seen.push(entry);
    return routes[`${entry.method} ${entry.url.pathname}`]?.(entry) ?? json({}, 404);
  };
  const client = await connect(
    { baseUrl: "http://redmine.test", auth: { apiKey: "test-key" }, fetch, ...config },
    settings,
  );
  return { client, seen };
}

/** `METHOD /path?query` of each request, for asserting what was sent. */
export function sent(seen: readonly Seen[]): string[] {
  return seen.map(({ method, url }) => `${method} ${url.pathname}${url.search}`);
}

/**
 * Calls a tool, expects success, and checks structuredContent against the outputSchema tools/list
 * published, compiled under strict draft 2020-12.
 */
export async function callOk(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, `${name}: ${texts(result).join("\n")}`).toBeFalsy();
  const tool = (await client.listTools()).tools.find((candidate) => candidate.name === name);
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(tool!.outputSchema!);
  expect(validate(result.structuredContent) ? [] : validate.errors, name).toEqual([]);
  return result;
}

/** Calls a tool and expects an error result. */
export async function callError(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, `${name} should fail`).toBe(true);
  return result;
}
