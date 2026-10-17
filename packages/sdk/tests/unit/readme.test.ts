import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { SLOTS } from "../../src/generated/slots.ts";
import { createRedmine, VERSIONS } from "../../src/index.ts";

const root = resolve(import.meta.dirname, "../..");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const examples = readdirSync(resolve(root, "examples"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => readFileSync(resolve(root, "examples", name), "utf8"));

describe("README.md", () => {
  test("every ts block is a verbatim excerpt of a typechecked example", () => {
    const blocks = [...readme.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map(([, code]) => code!);
    expect(blocks.length).toBeGreaterThan(0);
    const drifted = blocks.filter((code) => !examples.some((example) => example.includes(code)));
    expect(drifted).toEqual([]);
  });

  test("the namespace table lists the client's methods", () => {
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
    const start = readme.indexOf("| Namespace");
    expect(readme.slice(start, readme.indexOf("\n\n", start))).toBe(table);
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
