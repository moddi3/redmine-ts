import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { checkApiKey } from "../../src/redmine-key.ts";

function redmine(answer: (signal: AbortSignal | null) => Promise<Response>) {
  const seen: { url: string; key: string | null }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    seen.push({ url: request.url, key: request.headers.get("x-redmine-api-key") });
    return answer(init?.signal ?? request.signal);
  };
  return { fetch, seen };
}

const status = (code: number) => async () => new Response(null, { status: code });

const hanging = (signal: AbortSignal | null) =>
  new Promise<Response>((_, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason));
  });

describe("checkApiKey", () => {
  afterEach(() => void vi.useRealTimers());

  it("answers ok when Redmine returns the key's user, asking once at users/current.json", async () => {
    const { fetch, seen } = redmine(async () =>
      Response.json({ user: { id: 1, login: "alice", admin: false } }),
    );
    const verdict = await checkApiKey({ baseUrl: "http://redmine.test/redmine", fetch }, "key-1");
    expect(verdict).toBe("ok");
    expect(seen).toEqual([{ url: "http://redmine.test/redmine/users/current.json", key: "key-1" }]);
  });

  it("answers refused on 401, without telling onError", async () => {
    const errors: Error[] = [];
    const { fetch } = redmine(status(401));
    const verdict = await checkApiKey({ baseUrl: "http://redmine.test", fetch }, "bogus", {
      onError: (error) => errors.push(error),
    });
    expect(verdict).toBe("refused");
    expect(errors).toEqual([]);
  });

  it.each([
    ["403", status(403)],
    ["500", status(500)],
    ["503", status(503)],
    [
      "a network error",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("answers unreachable on %s, asking once and telling onError once", async (_, answer) => {
    const errors: Error[] = [];
    const { fetch, seen } = redmine(answer);
    const verdict = await checkApiKey({ baseUrl: "http://redmine.test", fetch }, "key-1", {
      onError: (error) => errors.push(error),
    });
    expect(verdict).toBe("unreachable");
    expect(seen).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("answers unreachable without telling onError when the caller gave up", async () => {
    const errors: Error[] = [];
    const { fetch } = redmine(hanging);
    const verdict = await checkApiKey({ baseUrl: "http://redmine.test", fetch }, "key-1", {
      signal: AbortSignal.abort(),
      onError: (error) => errors.push(error),
    });
    expect(verdict).toBe("unreachable");
    expect(errors).toEqual([]);
  });

  it.each([
    ["8 seconds, below the default 30", undefined, 8000],
    ["8 seconds, below a longer timeoutMs", 20_000, 8000],
    ["a shorter timeoutMs", 2000, 2000],
  ])("gives up after %s", async (_, timeoutMs, after) => {
    vi.useFakeTimers();
    const errors: Error[] = [];
    const { fetch } = redmine(hanging);
    let verdict: string | undefined;
    void checkApiKey({ baseUrl: "http://redmine.test", fetch, timeoutMs }, "key-1", {
      onError: (error) => errors.push(error),
    }).then((answer) => (verdict = answer));
    await vi.advanceTimersByTimeAsync(after - 1);
    expect(verdict).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(verdict).toBe("unreachable");
    expect(errors).toHaveLength(1);
  });
});
