// Checks that the repo's lint config, compiler options and hooks reject each fixture of real slop. A fixture
// names its target folder and the diagnostics it must get; it is copied there, linted with `vp lint`, and
// removed. Commit messages run through .vite-hooks/commit-msg, which must refuse each one in commit-msg/ and
// accept each one in commit-msg-accepted/.
// Usage: node scripts/slop/fixtures.ts
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDiagnostics } from "./oxlint.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = join(root, "scripts/slop/fixtures");

interface Fixture {
  name: string;
  copy: string;
  expected: string[];
}

const header = (text: string, key: string): string => {
  const value = new RegExp(`^// ${key}: (.*)$`, "m").exec(text)?.[1];
  if (value === undefined) throw new Error(`a fixture lacks its "// ${key}:" line`);
  return value.trim();
};

const sources: Fixture[] = readdirSync(fixtures)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => {
    const text = readFileSync(join(fixtures, name), "utf8");
    return {
      name,
      copy: join(header(text, "target"), `slop-fixture-${name}`),
      expected: header(text, "expect").split(/,\s*/),
    };
  });

const failures: string[] = [];
try {
  for (const fixture of sources)
    copyFileSync(join(fixtures, fixture.name), join(root, fixture.copy));
  let output: string;
  try {
    output = execFileSync("vp", ["lint", "-f", "json", ...sources.map((fixture) => fixture.copy)], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1 << 26,
    });
  } catch (error) {
    if (!(error instanceof Error && "stdout" in error && typeof error.stdout === "string"))
      throw error;
    output = error.stdout;
  }
  const diagnostics = parseDiagnostics(output.slice(output.indexOf("{")));
  for (const fixture of sources) {
    const got = new Set(diagnostics.filter((d) => d.file === fixture.copy).map((d) => d.rule));
    const missing = fixture.expected.filter((rule) => !got.has(rule));
    console.log(
      `${missing.length === 0 ? "rejected" : "PASSED  "}\t${fixture.name}\t${[...got].sort().join(" ")}`,
    );
    if (missing.length > 0) failures.push(`${fixture.name}: no ${missing.join(", ")}`);
  }
} finally {
  for (const fixture of sources) rmSync(join(root, fixture.copy), { force: true });
}

const messages: [string, boolean][] = [
  ["commit-msg", true],
  ["commit-msg-accepted", false],
];
for (const [dir, refuse] of messages) {
  for (const name of readdirSync(join(fixtures, dir))) {
    const hook = spawnSync("sh", [
      "-e",
      join(root, ".vite-hooks/commit-msg"),
      join(fixtures, dir, name),
    ]);
    const refused = hook.status !== 0;
    console.log(`${refused ? "rejected" : "accepted"}\t${dir}/${name}`);
    if (refused !== refuse) {
      failures.push(`${dir}/${name}: the hook ${refused ? "refused" : "accepted"} it`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\nThe setup got these wrong:\n${failures.join("\n")}`);
  process.exitCode = 1;
}
