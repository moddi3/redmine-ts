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

/** With `reveal`, nothing is hidden, and an error still becomes its JSON. */
export function redactor(auth: Auth | undefined, reveal: boolean): Redact {
  const sent =
    auth && ("apiKey" in auth ? auth.apiKey : "bearer" in auth ? auth.bearer : undefined);
  const credential =
    !reveal && typeof sent === "string" && sent.length >= SHORTEST_CREDENTIAL_TO_HIDE
      ? sent
      : undefined;
  function redact(text: string): string;
  function redact(error: RedmineError): ReturnType<RedmineError["toJSON"]>;
  function redact(value: unknown): unknown;
  function redact(value: unknown): unknown {
    if (typeof value === "string") {
      return credential === undefined ? value : value.replaceAll(credential, HIDDEN);
    }
    if (value instanceof RedmineError) return redact(value.toJSON());
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value !== "object" || value === null) return value;
    const fields = httpError(value) ? { ...value, body: redactBody(value.body) } : value;
    return Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [
        key,
        key === "api_key" && !reveal ? HIDDEN : redact(field),
      ]),
    );
  }
  const redactBody = (body: string): string => {
    if (reveal) return body;
    try {
      return JSON.stringify(redact(JSON.parse(body)));
    } catch {
      return body.replace(API_KEY_IN_JSON_CUT_ANYWHERE, `$1"${HIDDEN}"`);
    }
  };
  return redact;
}

/** An HTTP error as its JSON, whatever serialized it, with the body Redmine sent. */
function httpError(value: object): value is { kind: "http"; body: string } {
  return (
    "kind" in value && value.kind === "http" && "body" in value && typeof value.body === "string"
  );
}
