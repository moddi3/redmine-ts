import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { memoryGrantStore } from "../../src/index.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("memoryGrantStore", () => {
  it("lets a key be consumed once until it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const store = memoryGrantStore();
    expect(await store.has("code:a")).toBe(false);
    expect(await store.consume("code:a", 60)).toBe(true);
    expect(await store.consume("code:a", 60)).toBe(false);
    expect(await store.has("code:a")).toBe(true);
    expect(await store.consume("code:b", 60)).toBe(true);
    vi.setSystemTime(Date.now() + 60_000);
    expect(await store.has("code:a")).toBe(false);
    expect(await store.consume("code:a", 60)).toBe(true);
  });

  it("gives exactly one of many simultaneous consumers the key", async () => {
    const store = memoryGrantStore();
    const results = await Promise.all(Array.from({ length: 20 }, () => store.consume("k", 60)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
