import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vite-plus/test";

const mcp = resolve(import.meta.dirname, "../..");
const repo = resolve(mcp, "../..");
const examples = readdirSync(resolve(mcp, "examples"), { recursive: true, encoding: "utf8" })
  .filter((name) => name.endsWith(".ts"))
  .map((name) => readFileSync(resolve(mcp, "examples", name), "utf8"));

/** Pages for MCP users, relative to the repository root. */
const pages = [
  "packages/mcp/README.md",
  ...readdirSync(resolve(repo, "docs/mcp"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/mcp/${name}`),
];
const embedding = "docs/mcp/embedding.md";

const tsBlocks = (page: string) =>
  [...readFileSync(resolve(repo, page), "utf8").matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map(
    ([, code]) => code!,
  );

describe("MCP documentation", () => {
  test("reads typechecked examples, including the Bun and Workers ones", () => {
    expect(examples.length).toBeGreaterThanOrEqual(5);
  });

  test(`finds the code of ${embedding}`, () => {
    expect(pages).toContain(embedding);
    expect(tsBlocks(embedding).length).toBeGreaterThan(0);
  });

  test.each(pages)(
    "every ts block in %s is a verbatim excerpt of a typechecked example",
    (page) => {
      const drifted = tsBlocks(page).filter(
        (code) => !examples.some((example) => example.includes(code)),
      );
      expect(drifted).toEqual([]);
    },
  );
});
