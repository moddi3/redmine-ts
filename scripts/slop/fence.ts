// Old hits of a rule at "error" are fenced in lint-fence.json as a count per file, which vite.config.ts turns
// into lint.overrides that switch the rule off in those files. A file outside the fence gets the rule from
// `vp check`. A fenced file may not gain hits: --check, which the pre-commit hook runs, lints without the
// fence and fails when a count grows, and also when it shrinks, so the fence is rewritten as hits get fixed.
// --write can raise a count as easily as lower one, so CI also compares the fence with the base branch's.
// Usage:
//   node scripts/slop/fence.ts --write        record today's counts
//   node scripts/slop/fence.ts --check        compare the tree with the recorded counts
//   node scripts/slop/fence.ts --base <ref>   fail when lint-fence.json raises a count that <ref> has
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDiagnostics } from "./oxlint.ts";
import type { Diagnostic } from "./oxlint.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fenceFile = join(root, "lint-fence.json");

type Fence = Record<string, Record<string, number>>;

// "typescript(no-non-null-assertion)" is configured as "typescript/no-non-null-assertion".
const configName = (rule: string): string =>
  rule.replace(/^(.*)\((.*)\)$/, "$1/$2").replace(/^eslint\//, "");

const unfencedErrors = (): Diagnostic[] => {
  let output: string;
  try {
    output = execFileSync("vp", ["lint", "-f", "json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      env: { ...process.env, LINT_FENCE: "off" },
    });
  } catch (error) {
    if (!(error instanceof Error && "stdout" in error && typeof error.stdout === "string")) {
      throw error;
    }
    output = error.stdout;
  }
  // Compiler errors (typescript(TS2322)) are not lint rules and cannot be fenced.
  return parseDiagnostics(output.slice(output.indexOf("{"))).filter(
    (diagnostic) => diagnostic.severity === "error" && !/\(TS\d+\)$/.test(diagnostic.rule),
  );
};

const count = (diagnostics: readonly Diagnostic[]): Fence => {
  const fence: Fence = {};
  for (const { rule, file } of diagnostics) {
    const files = (fence[configName(rule)] ??= {});
    files[file] = (files[file] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(fence)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rule, files]) => [
        rule,
        Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );
};

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });

const baseAt = process.argv.indexOf("--base");
if (baseAt !== -1) {
  const base = process.argv[baseAt + 1];
  if (base === undefined) throw new Error("--base needs a ref, such as origin/main");
  // A missing ref throws here; only a ref without the file means there is no fence to compare with.
  git("rev-parse", "--verify", `${base}^{commit}`);
  if (git("ls-tree", "--name-only", base, "lint-fence.json").trim() === "") {
    console.log(`${base} has no lint-fence.json, so there is nothing to compare with.`);
  } else {
    const before: Fence = JSON.parse(git("show", `${base}:lint-fence.json`));
    const fenced: Fence = JSON.parse(readFileSync(fenceFile, "utf8"));
    const raised: string[] = [];
    for (const [rule, files] of Object.entries(fenced)) {
      for (const [file, hits] of Object.entries(files)) {
        const was = before[rule]?.[file] ?? 0;
        if (hits > was) raised.push(`${file}: ${rule} ${was} -> ${hits}`);
      }
    }
    if (raised.length > 0) {
      console.error(
        `lint-fence.json raises counts that ${base} has. Fix the new hits and run node scripts/slop/fence.ts --write:\n${raised.join("\n")}`,
      );
      process.exitCode = 1;
    }
  }
} else if (process.argv.includes("--write")) {
  writeFileSync(fenceFile, `${JSON.stringify(count(unfencedErrors()), null, 2)}\n`);
} else {
  const diagnostics = unfencedErrors();
  const now = count(diagnostics);
  const fenced: Fence = JSON.parse(readFileSync(fenceFile, "utf8"));
  const grown: string[] = [];
  const shrunk: string[] = [];
  for (const [rule, files] of Object.entries(now)) {
    for (const [file, hits] of Object.entries(files)) {
      const before = fenced[rule]?.[file];
      if (before === undefined || hits <= before) continue;
      grown.push(
        `${file}: ${rule} has ${hits} hits, ${before} before this change. Fix the new one:`,
      );
      for (const d of diagnostics.filter((d) => d.file === file && configName(d.rule) === rule)) {
        grown.push(`  ${file}:${d.line} ${d.message}`);
      }
    }
  }
  for (const [rule, files] of Object.entries(fenced)) {
    for (const [file, before] of Object.entries(files)) {
      const hits = now[rule]?.[file] ?? 0;
      if (hits < before) shrunk.push(`${file}: ${rule} ${before} -> ${hits}`);
    }
  }
  if (grown.length > 0) console.error(`New hits in fenced files:\n${grown.join("\n")}`);
  if (shrunk.length > 0) {
    console.error(
      `Old hits were fixed; run node scripts/slop/fence.ts --write:\n${shrunk.join("\n")}`,
    );
  }
  if (grown.length > 0 || shrunk.length > 0) process.exitCode = 1;
}
