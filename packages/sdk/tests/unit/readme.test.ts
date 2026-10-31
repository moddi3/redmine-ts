import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { SLOTS } from "../../src/generated/slots.ts";
import { createRedmine, VERSIONS } from "../../src/index.ts";

const sdk = resolve(import.meta.dirname, "../..");
const repo = resolve(sdk, "../..");
const examples = readdirSync(resolve(sdk, "examples"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => readFileSync(resolve(sdk, "examples", name), "utf8"));

const guides = readdirSync(resolve(repo, "docs/sdk"))
  .filter((name) => name.endsWith(".md"))
  .map((name) => `docs/sdk/${name}`);

/** Pages with SDK code, relative to the repository root. Each must hold at least one ts block. */
const pages = ["packages/sdk/README.md", "README.md", ...guides];
const namespaceTable = "docs/sdk/reference.md";

const read = (page: string) => readFileSync(resolve(repo, page), "utf8");

describe("SDK documentation", () => {
  test("reads typechecked examples", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  test("finds the SDK guides in docs/sdk", () => {
    expect(guides).toContain(namespaceTable);
  });

  test.each(pages)(
    "every ts block in %s is a verbatim excerpt of a typechecked example",
    (page) => {
      const blocks = [...read(page).matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map(([, code]) => code!);
      expect(blocks.length).toBeGreaterThan(0);
      const drifted = blocks.filter((code) => !examples.some((example) => example.includes(code)));
      expect(drifted).toEqual([]);
    },
  );

  test(`the namespace table in ${namespaceTable} lists the client's methods`, () => {
    const rm = createRedmine({ baseUrl: "https://redmine.test" });
    const rows = Object.entries(rm).flatMap(([namespace, methods]) => {
      if (typeof methods !== "object" || methods === null) return [];
      const verbs = Object.keys(methods).map((verb) => {
        const since = SLOTS[namespace]?.[verb]?.since ?? VERSIONS[0];
        return since === VERSIONS[0] ? `\`${verb}\`` : `\`${verb}\` (${since}+)`;
      });
      return [[`\`${namespace}\``, verbs.join(", ")]];
    });
    const table = markdownTable(["Namespace", "Methods"], rows);
    const page = read(namespaceTable);
    const start = page.indexOf("| Namespace");
    expect(start).toBeGreaterThan(-1);
    expect(page.slice(start, page.indexOf("\n\n", start))).toBe(table);
  });
});

/** Column-aligned, as the formatter writes it. */
function markdownTable(header: string[], rows: string[][]): string {
  const widths = header.map((cell, i) =>
    Math.max(cell.length, ...rows.map((row) => row[i]!.length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((cell, i) => cell.padEnd(widths[i]!)).join(" | ")} |`;
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}
