import { describe, expect, it } from "vite-plus/test";
import { CHANGE_CAP, clip, LINE_CAP } from "../../src/workflow/clip.ts";
import type { Clip } from "../../src/workflow/clip.ts";
import { lineDiff } from "../../src/workflow/diff.ts";

const CLIPPED: Clip = (text, cap, start) => clip(text, cap, "Read the rest elsewhere.", start);
const WHOLE: Clip = (text) => text;
const MARKER = /^\[clipped: (\d+) more characters\. Read the rest elsewhere\.\]$/;

/** Mulberry32, so a failing seed reruns the same case. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fewestEdits(a: readonly string[], b: readonly string[]): number {
  const row = Array.from({ length: b.length + 1 }, () => 0);
  for (const line of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = line === b[j - 1] ? diagonal + 1 : Math.max(above, row[j - 1]!);
      diagonal = above;
    }
  }
  return a.length + b.length - 2 * row[b.length]!;
}

const WORDS = ["alpha", "beta", "gamma", "delta", "😀", "x", "", " "];

function texts(random: () => number) {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const paragraphs = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
    Array.from({ length: 70 + Math.floor(random() * 150) }, () => pick(WORDS.slice(0, 5))).join(
      " ",
    ),
  );
  const edit = (text: string): string => {
    const at = Math.floor(random() * (text.length + 1));
    const cut = Math.floor(random() * 4);
    return `${text.slice(0, at)}${pick(["", "X", "new words"])}${text.slice(at + cut)}`;
  };
  // Lines that share a long middle make the closest counterpart hard to tell from the others.
  const middle = "m".repeat(300 + Math.floor(random() * 100));
  const tail = () => Array.from({ length: 4 }, () => pick(["a", "b"])).join("");
  const similar = random() < 0.2;
  const line = (): string =>
    similar && random() < 0.6
      ? `${tail()}${middle}${tail()}`
      : random() < 0.35
        ? random() < 0.5
          ? pick(paragraphs)
          : edit(pick(paragraphs))
        : pick(WORDS);
  const old = Array.from({ length: Math.floor(random() * 9) }, line);
  const next = [...old];
  for (let n = Math.floor(random() * 5); n > 0; n--) {
    const at = Math.floor(random() * (next.length + 1));
    const run = 1 + Math.floor(random() * 5);
    const roll = random();
    if (roll < 0.25) next.splice(at, run);
    else if (roll < 0.5) next.splice(at, 0, ...Array.from({ length: run }, line));
    else if (at < next.length) next[at] = edit(next[at]!);
  }
  const join = (lines: readonly string[]) =>
    lines.reduce(
      (text, line, n) => (n === 0 ? line : `${text}${pick(["\n", "\r\n", "\r"])}${line}`),
      "",
    );
  const from = join(old);
  const to = join(next);
  // "\r" then an empty line then "\n" reads back as one CRLF, so the lines are what the text splits into.
  const split = (text: string) => (text === "" ? [] : text.split(/\r\n|\r|\n/));
  return { old: split(from), next: split(to), from, to };
}

interface Shown {
  sign: string;
  shown: string;
  marker: number | undefined;
  actual: string;
}

/** Each line the diff shows, matched to the line of the old or new text it stands for. */
function read(diff: string, old: readonly string[], next: readonly string[], capped: boolean) {
  const rows = diff.split("\n");
  if (capped) rows.splice(-2);
  const shown: Shown[][] = [];
  let oldAt = 0;
  let newAt = 0;
  for (const row of rows) {
    const hunk = /^@@ line (\d+) @@$/.exec(row);
    const marker = MARKER.exec(row);
    if (hunk) {
      const start = Number(hunk[1]) - 1;
      const oldStart = start + oldAt - newAt;
      expect(old.slice(oldAt, oldStart)).toEqual(next.slice(newAt, start));
      oldAt = oldStart;
      newAt = start;
      shown.push([]);
    } else if (marker) {
      shown.at(-1)!.at(-1)!.marker = Number(marker[1]);
    } else {
      const sign = row.slice(0, 1);
      const actual = sign === "+" ? next[newAt++]! : old[oldAt++]!;
      if (sign === " ") expect(next[newAt++]).toBe(actual);
      shown.at(-1)!.push({ sign, shown: row.slice(2), marker: undefined, actual });
    }
  }
  if (!capped) expect(old.slice(oldAt)).toEqual(next.slice(newAt));
  return { capped, lines: shown.flat(), hunks: shown };
}

function check(from: string, to: string, old: readonly string[], next: readonly string[]) {
  const diff = lineDiff(from, to, CLIPPED);
  if (fewestEdits(old, next) === 0) {
    expect(diff).toBe(from === to ? "No change." : "Only line endings changed.");
    return { cut: 0 };
  }
  const { capped, lines, hunks } = read(diff, old, next, diff.length > CHANGE_CAP);
  let cut = 0;
  for (const [n, { shown, marker, actual }] of lines.entries()) {
    // The cap can fall between the last line it keeps and that line's marker.
    if (capped && n === lines.length - 1 && marker === undefined) continue;
    if (actual.length <= LINE_CAP) {
      expect(shown).toBe(actual);
      expect(marker).toBeUndefined();
      continue;
    }
    cut++;
    const head = shown.startsWith("…");
    const core = shown.slice(head ? 1 : 0);
    expect(core.length).toBeLessThanOrEqual(LINE_CAP);
    expect(head ? actual.indexOf(core, 1) > 0 : actual.startsWith(core)).toBe(true);
    expect(marker).toBe(actual.length - core.length);
  }
  for (const hunk of hunks) {
    let block: Shown[] = [];
    for (const line of [...hunk, undefined]) {
      if (line !== undefined && line.sign !== " ") {
        block.push(line);
        continue;
      }
      const removed = new Set(
        block.filter((l) => l.sign === "-").map((l) => `${l.shown}${l.marker}`),
      );
      for (const added of block.filter((l) => l.sign === "+")) {
        expect(removed.has(`${added.shown}${added.marker}`)).toBe(false);
      }
      block = [];
    }
  }
  if (!capped) {
    const changed = lines.filter((line) => line.sign !== " ").length;
    expect(changed).toBe(fewestEdits(old, next));
  }
  const whole = read(lineDiff(from, to, WHOLE), old, next, false);
  for (const { shown, marker, actual } of whole.lines) {
    expect(shown).toBe(actual);
    expect(marker).toBeUndefined();
  }
  expect(whole.lines.filter((line) => line.sign !== " ")).toHaveLength(fewestEdits(old, next));
  return { cut };
}

describe("lineDiff against a reference LCS", () => {
  it("transforms the old text into the new with the fewest edits, never shows a changed long line as unchanged, and marks every cut, or shows every line whole for a journal in full", () => {
    const random = generator(53);
    let cut = 0;
    for (let n = 0; n < 6000; n++) {
      const { old, next, from, to } = texts(random);
      cut += check(from, to, old, next).cut;
    }
    expect(cut).toBeGreaterThan(1000);
  });
});
