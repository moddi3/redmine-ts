import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// Checks the repository's Markdown, except the records under .audit/:
// - every relative link, and every link to this repository's main branch on GitHub, names a file
//   that exists, and a heading on that page when it has an anchor;
// - a package README links to other files by absolute URL, because npm ships it without docs/;
// - every code fence names its language, and TypeScript sits in `ts` fences, the label the
//   example tests read.

const root = resolve(import.meta.dirname, "..");
const repoUrl =
  /^https:\/\/(?:github\.com\/moddi3\/redmine-ts\/(?:blob|tree)\/main|raw\.githubusercontent\.com\/moddi3\/redmine-ts\/main)\/([^#]*)(?:#(.*))?$/;
const hiddenTypeScript = new Set([
  "js",
  "javascript",
  "jsx",
  "mjs",
  "cjs",
  "typescript",
  "tsx",
  "mts",
  "cts",
]);
let linkCount = 0;

function markdownFiles(): string[] {
  const listed = (...args: string[]) =>
    execFileSync("git", ["ls-files", ...args, "*.md"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  const files = new Set([...listed(), ...listed("--others", "--exclude-standard")]);
  return [...files].filter((file) => !file.startsWith(".audit/") && existsSync(join(root, file)));
}

function withoutCode(text: string): string {
  return text.replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1/gm, "").replace(/`[^`\n]*`/g, "");
}

/** The anchor GitHub gives a heading. */
function slug(heading: string): string {
  return heading
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

const anchorCache = new Map<string, Set<string>>();
function anchors(path: string): Set<string> {
  let found = anchorCache.get(path);
  if (found) return found;
  found = new Set();
  const seen = new Map<string, number>();
  const text = readFileSync(path, "utf8").replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1/gm, "");
  for (const [, title] of text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = slug(title!);
    const count = seen.get(base) ?? 0;
    found.add(count === 0 ? base : `${base}-${count}`);
    seen.set(base, count + 1);
  }
  anchorCache.set(path, found);
  return found;
}

function checkLinks(file: string, text: string): string[] {
  const problems: string[] = [];
  const path = join(root, file);
  const packageReadme = /^packages\/[^/]+\/README\.md$/.test(file);
  for (const [, target] of withoutCode(text).matchAll(
    /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
  )) {
    let targetPath: string;
    let anchor: string | undefined;
    const ours = repoUrl.exec(target!);
    if (ours) {
      targetPath = join(root, decodeURIComponent(ours[1]!));
      anchor = ours[2];
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(target!)) {
      continue;
    } else {
      const [pathPart, anchorPart] = target!.split("#");
      if (packageReadme && pathPart) {
        problems.push(`${file}: relative link ${target} breaks on npm, use a GitHub URL`);
        continue;
      }
      targetPath = pathPart ? resolve(dirname(path), decodeURIComponent(pathPart)) : path;
      anchor = anchorPart;
    }
    linkCount++;
    if (!existsSync(targetPath)) {
      problems.push(`${file}: ${target} names a missing file`);
    } else if (anchor && targetPath.endsWith(".md") && statSync(targetPath).isFile()) {
      if (!anchors(targetPath).has(decodeURIComponent(anchor))) {
        problems.push(`${file}: ${target} names no heading in ${relative(root, targetPath)}`);
      }
    }
  }
  return problems;
}

function checkFences(file: string, text: string): string[] {
  const problems: string[] = [];
  let open: string | undefined;
  for (const [index, line] of text.split("\n").entries()) {
    const fence = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (!fence) continue;
    if (open === undefined) {
      open = fence[1]!;
      const label = fence[2]!.toLowerCase();
      if (label === "") problems.push(`${file}:${index + 1}: code fence without a language`);
      if (hiddenTypeScript.has(label)) {
        problems.push(`${file}:${index + 1}: \`${label}\` fence, put TypeScript in a \`ts\` fence`);
      }
    } else if (fence[1]!.startsWith(open) && fence[2] === "") {
      open = undefined;
    }
  }
  return problems;
}

const files = markdownFiles();
const problems = files.flatMap((file) => {
  const text = readFileSync(join(root, file), "utf8");
  return [...checkLinks(file, text), ...checkFences(file, text)];
});

console.log(`Checked ${linkCount} links and the code fences in ${files.length} Markdown files.`);
for (const problem of problems) console.error(problem);
if (problems.length > 0) {
  console.error(`${problems.length} ${problems.length === 1 ? "problem" : "problems"}.`);
  process.exitCode = 1;
}
