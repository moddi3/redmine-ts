// target: packages/mcp/src
// expect: slop(no-non-null-assertion), slop(no-type-assertion)
// From packages/mcp/src/http.ts:183 before 19ad0dc, which made RequestAuth a union instead.
interface RequestAuth {
  auth: string;
  /** Set on bearer requests only, whose status depends on what the request's server saw. */
  observe?: () => void;
}

export function requestAuth(authInfo: { extra?: Record<string, unknown> } | undefined): RequestAuth {
  return authInfo!.extra!.redmine as RequestAuth;
}
