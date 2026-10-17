import { describe, expect, test } from "vite-plus/test";
import { parseRedmineVersion, RedmineError } from "../../src/index.ts";

describe("parseRedmineVersion", () => {
  test("accepts x.y and x.y.z of supported versions", () => {
    expect(parseRedmineVersion("7.0.1")).toBe("7.0");
    expect(parseRedmineVersion(" 6.1 ")).toBe("6.1");
  });

  test("rejects unsupported versions with invalid_input", () => {
    expect(() => parseRedmineVersion("5.1")).toThrowError(RedmineError);
    try {
      parseRedmineVersion("latest");
    } catch (e) {
      expect(RedmineError.is(e, "invalid_input")).toBe(true);
    }
  });
});
