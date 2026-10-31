import pkg from "../package.json" with { type: "json" };

const REPOSITORY = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

const USER_AGENT = `redmine-ts-mcp/${pkg.version} (+${REPOSITORY})`;

export function withUserAgent(
  send: typeof fetch = (input, init) => globalThis.fetch(input, init),
): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("user-agent")) headers.set("user-agent", USER_AGENT);
    return send(input, { ...init, headers });
  };
}
