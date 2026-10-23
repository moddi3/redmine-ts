// The pages a person sees during sign-in. Every value is escaped, the CSP allows nothing but the one
// inline stylesheet and form posts to the places the form may lead, and no site may frame the page.

import type { Client } from "./clients.ts";
import { randomToken } from "./seal.ts";
import type { Scope } from "./scopes.ts";

class Html {
  constructor(readonly text: string) {}
}

type Value = string | Html | readonly Html[];

function html(strings: TemplateStringsArray, ...values: Value[]): Html {
  let text = strings[0]!;
  values.forEach((value, at) => {
    const piece =
      typeof value === "string"
        ? escape(value)
        : value instanceof Html
          ? value.text
          : value.map((part) => part.text).join("");
    text += piece + strings[at + 1]!;
  });
  return new Html(text);
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const SCOPE_TEXT: Readonly<Record<Scope, string>> = {
  "redmine:read": "Read what you can see in Redmine: issues, projects, wiki pages, time entries.",
  "redmine:write":
    "Create and change issues, notes, time entries, wiki pages and other records as you.",
  "redmine:delete":
    "Delete issues, time entries, wiki pages and other records. Redmine has no undo.",
};

const STYLE = `body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem 1rem;background:#f6f7f9;color:#1d2330}
main{max-width:34rem;margin:0 auto;background:#fff;border:1px solid #d8dce3;border-radius:8px;padding:1.5rem}
h1{font-size:1.3rem;margin:0 0 1rem}dt{font-weight:600;margin-top:.75rem}dd{margin:0}
.note{background:#fff7e0;border:1px solid #f0d58a;border-radius:6px;padding:.5rem .75rem}
.error{background:#fdecec;border:1px solid #efb3b3;border-radius:6px;padding:.5rem .75rem}
label{display:block;margin-top:1rem;font-weight:600}input{width:100%;box-sizing:border-box;font:inherit;padding:.4rem}
.actions{display:flex;gap:.75rem;margin-top:1.5rem}button{font:inherit;padding:.5rem 1.25rem;border-radius:6px;border:1px solid #9aa3b2;background:#fff;cursor:pointer}
button[value=allow]{background:#1f5fbf;border-color:#1f5fbf;color:#fff}`;

export interface ConsentView {
  client: Client;
  redirectUri: string;
  scopes: readonly Scope[];
  /** Redmine's host as people know it. */
  redmineHost: string;
  /** Where the form posts: the authorize endpoint's path. */
  action: string;
  /** The sealed request the form carries back. */
  consent: string;
  /** Origins a submitted form may be redirected to: Redmine, and the client's redirect URI. */
  formTargets: readonly string[];
  /** The fallback that asks for the person's API key instead of sending them to Redmine. */
  apiKey?: {
    /** This server's host, which the address bar must show. */
    serverHost: string;
    /** Where Redmine shows the key. */
    accountUrl: string;
    /** Why the last key was refused. */
    error?: string;
  };
}

export function consentPage(
  view: ConsentView,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const { client, redirectUri, scopes, redmineHost } = view;
  const name = client.name ?? "An MCP client";
  const redirect = new URL(redirectUri);
  const loopback = redirect.protocol === "http:";
  const identity =
    client.documentHost === undefined
      ? html`<dd>${name}. It registered itself here, so this name is not verified.</dd>`
      : html`<dd>${name}, described by <strong>${client.documentHost}</strong></dd>`;
  const body = html`<h1>Allow ${name} to use Redmine as you?</h1>
    <p><strong>${name}</strong> asks to act as you on <strong>${redmineHost}</strong>.</p>
    <dl>
      <dt>Client</dt>
      ${identity}
      <dt>Sends you back to</dt>
      <dd><strong>${redirect.host}</strong></dd>
      <dt>Access</dt>
      <dd>
        <ul>
          ${scopes.map((scope) => html`<li>${SCOPE_TEXT[scope]}</li>`)}
        </ul>
      </dd>
    </dl>
    ${
      loopback
        ? html`<p class="note">
            The client listens on this computer. Allow only if you started this sign-in from an app
            you trust.
          </p>`
        : html``
    }
    <form method="post" action="${view.action}">
      <input type="hidden" name="consent" value="${view.consent}" />
      ${view.apiKey === undefined ? html`` : keyField(view.apiKey, redmineHost)}
      <div class="actions">
        <button name="decision" value="allow">Allow</button
        ><button name="decision" value="deny" formnovalidate>Deny</button>
      </div>
    </form>`;
  return page("Allow access to Redmine", body, view.formTargets, init);
}

/**
 * A web page that asks for a master key is what phishing looks like, so the page says how to tell it
 * is this one, and where the key goes.
 */
function keyField(field: NonNullable<ConsentView["apiKey"]>, redmineHost: string): Html {
  return html`${field.error === undefined ? html`` : html`<p class="error">${field.error}</p>`}
    <p class="note">
      Paste your key only if you opened this page from your own MCP client and the address bar shows
      <strong>${field.serverHost}</strong>. The server seals the key into the tokens it gives the
      client and sends it only to <strong>${redmineHost}</strong>. Resetting the key in Redmine ends
      this access.
    </p>
    <label for="api_key">Your Redmine API key</label>
    <input
      id="api_key"
      name="api_key"
      type="password"
      autocomplete="off"
      spellcheck="false"
      required
    />
    <p>Redmine shows it under <a href="${field.accountUrl}">My account</a>, API access key.</p>`;
}

export function errorPage(status: number, message: string): Response {
  const body = html`<h1>Sign-in failed</h1>
    <p class="error">${message}</p>`;
  return page("Sign-in failed", body, [], { status });
}

function page(
  title: string,
  body: Html,
  formTargets: readonly string[],
  init: { status?: number; headers?: Record<string, string> | undefined },
): Response {
  const nonce = randomToken();
  const document = html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${title}</title>
        <style nonce="${nonce}">
          ${new Html(STYLE)}
        </style>
      </head>
      <body>
        <main>${body}</main>
      </body>
    </html>`;
  const headers = new Headers(pageHeaders(nonce, formTargets));
  for (const [header, value] of new Headers(init.headers)) headers.append(header, value);
  return new Response(document.text, { status: init.status ?? 200, headers });
}

/**
 * Chrome checks form-action on every redirect that follows a submitted form, so the policy lists
 * where the decision may lead.
 */
function pageHeaders(nonce: string, formTargets: readonly string[]): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      `form-action ${["'self'", ...formTargets].join(" ")}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
  };
}
