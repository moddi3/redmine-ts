import { describe, expect, it } from "vite-plus/test";
import { publicFetch } from "../../src/node.ts";

describe("publicFetch", () => {
  it.each([
    "http://example.com/client.json",
    "https://127.0.0.1/client.json",
    "https://10.1.2.3/client.json",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/client.json",
    "https://[::ffff:127.0.0.1]/client.json",
    "https://[fd00::1]/client.json",
  ])("refuses %s before connecting", async (url) => {
    await expect(publicFetch(url)).rejects.toThrow(TypeError);
  });

  it("refuses a name that resolves to loopback, checked where the connection looks it up", async () => {
    await expect(publicFetch("https://localhost:1/client.json")).rejects.toThrow(
      "localhost does not resolve to public addresses only",
    );
  });

  it("lets a public address through the check, to fail only at connecting", async () => {
    const attempt = publicFetch("https://1.1.1.1:1/client.json", {
      signal: AbortSignal.timeout(300),
    });
    await expect(attempt).rejects.not.toBeInstanceOf(TypeError);
  });

  it("sends only GET", async () => {
    await expect(publicFetch("https://example.com/", { method: "POST" })).rejects.toThrow(
      "only GET over https",
    );
  });
});
