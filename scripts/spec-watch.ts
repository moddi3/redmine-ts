import { readdir } from "node:fs/promises";

// Prints the upstream d-yoshi/redmine-openapi tags newer than the vendored specs, one per line.
// A tag is newer when it beats every vendored spec of its Redmine x.y line, or when it starts an
// x.y line above all vendored ones. Older tag schemes such as `2.0.1+redmine.6.1.3` are ignored.

const tagPattern = /^(\d+)\.(\d+)\.(\d+)-r(\d+)$/;

function parse(tag: string): number[] | undefined {
  return tagPattern.exec(tag)?.slice(1).map(Number);
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

async function upstreamTags(): Promise<string[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const tags: string[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(
      `https://api.github.com/repos/d-yoshi/redmine-openapi/tags?per_page=100&page=${page}`,
      { headers },
    );
    if (!response.ok) throw new Error(`GitHub tags API answered ${response.status}`);
    const batch = (await response.json()) as { name: string }[];
    tags.push(...batch.map((tag) => tag.name));
    if (batch.length < 100) return tags;
  }
}

const specDir = new URL("../spec/redmine-openapi/", import.meta.url);
const vendored = (await readdir(specDir))
  .map((file) => parse(file.replace(/\.yaml$/, "")))
  .filter((version) => version !== undefined);
if (vendored.length === 0) throw new Error("no vendored specs found in spec/redmine-openapi");

const newest = (versions: number[][]) => versions.reduce((a, b) => (compare(a, b) >= 0 ? a : b));
const newestLine = newest(vendored).slice(0, 2);

const newer = (await upstreamTags())
  .map((tag) => ({ tag, version: parse(tag) }))
  .filter(({ version }) => {
    if (!version) return false;
    const line = vendored.filter((v) => v[0] === version[0] && v[1] === version[1]);
    return line.length > 0
      ? compare(version, newest(line)) > 0
      : compare(version.slice(0, 2), newestLine) > 0;
  })
  .sort((a, b) => compare(a.version!, b.version!))
  .map(({ tag }) => tag);

for (const tag of newer) console.log(tag);
