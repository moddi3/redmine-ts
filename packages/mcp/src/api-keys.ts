// Redmine sends working API keys as api_key. A user gets their own key, and an admin gets the key of
// any user.

import { RedmineError } from "@redmine-ts/sdk";
import type { Auth } from "@redmine-ts/sdk";

const HIDDEN = "[hidden by @redmine-ts/mcp]";

const SHORTEST_CREDENTIAL_TO_HIDE = 20;

const API_KEY_IN_JSON_CUT_ANYWHERE = /("api_key"\s*:\s*)"(?:[^"\\]|\\.)*"?/g;

export interface Redact {
  (text: string): string;
  (error: RedmineError): ReturnType<RedmineError["toJSON"]>;
  (value: unknown): unknown;
}

export function redactor(auth: Auth | undefined): Redact {
  const sent =
    auth && ("apiKey" in auth ? auth.apiKey : "bearer" in auth ? auth.bearer : undefined);
  const credential =
    typeof sent === "string" && sent.length >= SHORTEST_CREDENTIAL_TO_HIDE ? sent : undefined;
  function redact(text: string): string;
  function redact(error: RedmineError): ReturnType<RedmineError["toJSON"]>;
  function redact(value: unknown): unknown;
  function redact(value: unknown): unknown {
    if (typeof value === "string") {
      return credential === undefined ? value : value.replaceAll(credential, HIDDEN);
    }
    if (value instanceof RedmineError) {
      const json = value.toJSON();
      return redact(json.kind === "http" ? { ...json, body: redactBody(json.body) } : json);
    }
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [
        key,
        key === "api_key" ? HIDDEN : redact(field),
      ]),
    );
  }
  const redactBody = (body: string): string => {
    try {
      return JSON.stringify(redact(JSON.parse(body)));
    } catch {
      return body.replace(API_KEY_IN_JSON_CUT_ANYWHERE, `$1"${HIDDEN}"`);
    }
  };
  return redact;
}
