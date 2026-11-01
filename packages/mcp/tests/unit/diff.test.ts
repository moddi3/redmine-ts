import { describe, expect, it } from "vite-plus/test";
import { CHANGE_CAP } from "../../src/workflow/clip.ts";
import { LINE_CAP, lineDiff } from "../../src/workflow/diff.ts";

const REST = "Read the rest elsewhere.";
const MARKER = /\n\[clipped: (\d+) more characters\. Read the rest elsewhere\.\]$/;

function mulberry32(seed: number): () => number {
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

function shared(a: string, b: string) {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  return { prefix, suffix };
}

interface Case {
  old: string[];
  next: string[];
  from: string;
  to: string;
  /** Lines the generator edited, by their index in the old and new text, and where each edit sits in them. */
  edited: { old: number; next: number; at: [number[], number[]] }[];
}

function joined(random: () => number, old: string[], next: string[], edited: Case["edited"] = []) {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const join = (lines: readonly string[]) =>
    lines.reduce(
      (text, line, n) => (n === 0 ? line : `${text}${pick(["\n", "\r\n", "\r"])}${line}`),
      "",
    );
  const [from, to] = [join(old), join(next)];
  const split = (text: string) => (text === "" ? [] : text.split(/\r\n|\r|\n/));
  return { old: split(from), next: split(to), from, to, edited };
}

const WORDS = ["alpha", "beta", "gamma", "delta", "😀", "…", "x", "", " "];

function texts(random: () => number): Case {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const paragraphs = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
    Array.from({ length: 70 + Math.floor(random() * 150) }, () => pick(WORDS.slice(0, 6))).join(
      " ",
    ),
  );
  const edit = (text: string): string => {
    const at = Math.floor(random() * (text.length + 1));
    const cut = Math.floor(random() * 4);
    return `${text.slice(0, at)}${pick(["", "X", "new words"])}${text.slice(at + cut)}`;
  };
  const middle = "m".repeat(300 + Math.floor(random() * 100));
  const tail = () => Array.from({ length: 4 }, () => pick(["a", "b"])).join("");
  const hardToPair = random() < 0.2;
  const line = (): string =>
    hardToPair && random() < 0.6
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
  return joined(random, old, next);
}

/**
 * Two to four lines in one block that share all but two words each, with up to four words between those
 * two edited, or, as in rows of a table, those two redrawn from three.
 */
function rows(random: () => number): Case {
  const int = (n: number) => Math.floor(random() * n);
  const token = () =>
    Array.from({ length: 3 + int(6) }, () => String.fromCharCode(97 + int(26))).join("");
  const run = (length: number) => {
    const words: string[] = [];
    while (words.join(" ").length < length) words.push(token());
    return words;
  };
  const few = random() < 0.4;
  const own = () => (few ? ["one", "two", "three"][int(3)]! : token());
  const [head, middle, end] = [run(60 + int(200)), run(150 + int(300)), run(40 + int(100))];
  const row = () => [...head, own(), ...middle, own(), ...end];
  const offsets = (words: readonly string[], at: readonly number[]) =>
    at.map((n) => words.slice(0, n).join(" ").length + (n > 0 ? 1 : 0));
  const old: string[][] = Array.from({ length: 2 + int(3) }, row);
  const next: string[][] = [];
  const edited: Case["edited"] = [];
  for (const words of old) {
    if (int(10) < 2) {
      next.push(words);
      continue;
    }
    if (few) {
      next.push([...head, own(), ...middle, own(), ...end]);
      continue;
    }
    const spots = new Set(
      Array.from({ length: 1 + int(4) }, () => head.length + 1 + int(middle.length)),
    );
    const changed: string[] = [];
    const at: [number[], number[]] = [[], []];
    for (const [n, word] of words.entries()) {
      if (!spots.has(n)) {
        changed.push(word);
        continue;
      }
      const roll = int(3);
      if (roll !== 1) at[0].push(n);
      if (roll !== 2) at[1].push(changed.length);
      if (roll !== 2) changed.push(token());
      if (roll === 1) changed.push(word);
    }
    edited.push({
      old: old.indexOf(words),
      next: next.length,
      at: [offsets(words, at[0]), offsets(changed, at[1])],
    });
    next.push(changed);
  }
  const before = Array.from({ length: int(3) }, () => ["a", "b", "c"][int(3)]!);
  const lines = (words: readonly string[][]) => [...before, ...words.map((w) => w.join(" "))];
  return joined(
    random,
    lines(old),
    lines(next),
    edited.map((edit) => ({
      ...edit,
      old: edit.old + before.length,
      next: edit.next + before.length,
    })),
  );
}

interface Row {
  sign: string;
  shown: string;
  /** Its index in the old text, or in the new text for an added line. */
  line: number;
  text: string;
  budget: number;
}

/** Each line the diff shows by hunk, with the line of the old or new text it stands for. */
function read(
  body: string,
  old: readonly string[],
  next: readonly string[],
  whole: boolean,
  fail: (problem: string) => void,
) {
  const hunks: Row[][] = [];
  let oldAt = 0;
  let newAt = 0;
  let start = 0;
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((line, n) => line === b[n]);
  for (const row of body.split("\n")) {
    const budget = whole ? Infinity : Math.min(LINE_CAP, CHANGE_CAP - (start - 1) - 3);
    start += row.length + 1;
    const hunk = /^@@ line (\d+) @@$/.exec(row);
    if (hunk) {
      const at = Number(hunk[1]) - 1;
      const oldStart = at + oldAt - newAt;
      if (!same(old.slice(oldAt, oldStart), next.slice(newAt, at))) fail(`${row} skips a change`);
      oldAt = oldStart;
      newAt = at;
      hunks.push([]);
      continue;
    }
    const sign = row.slice(0, 1);
    if (!["-", "+", " "].includes(sign) || row.slice(1, 2) !== " ") fail(`bad row ${row}`);
    const line = sign === "+" ? newAt++ : oldAt++;
    const text = sign === "+" ? next[line]! : old[line]!;
    if (sign === " " && next[newAt++] !== text) fail(`unchanged line ${line} differs`);
    hunks.at(-1)!.push({ sign, shown: row.slice(2), line, text, budget });
  }
  if (whole && !same(old.slice(oldAt), next.slice(newAt))) fail("a change after the last run");
  return hunks;
}

const MIN_CUT = 2;

/**
 * Each number of … in `shown` that can stand for parts of `text` left out, reading `shown` as `text`
 * with … in place of each part. A … that `text` has can also stay as it is, so a line can read more
 * than one way. Empty when `shown` is not `text` cut so.
 */
function cuts(shown: string, text: string): Set<number> {
  const pieces = shown.split("…");
  const reach = (ends: Map<number, Set<number>>, end: number, count: number) =>
    ends.set(end, (ends.get(end) ?? new Set()).add(count));
  let ends = new Map<number, Set<number>>();
  if (text.startsWith(pieces[0]!)) reach(ends, pieces[0]!.length, 0);
  for (const [n, piece] of pieces.slice(1).entries()) {
    const last = n === pieces.length - 2;
    const next = new Map<number, Set<number>>();
    for (const [at, counts] of ends) {
      for (const count of counts) {
        if (text[at] === "…" && text.startsWith(piece, at + 1)) {
          reach(next, at + 1 + piece.length, count);
        }
        if (piece === "" && last) {
          if (text.length - at >= MIN_CUT) reach(next, text.length, count + 1);
          continue;
        }
        // An empty piece between a cut and a … of the text ends where that … starts.
        const sought = piece === "" ? "…" : piece;
        for (let found = text.indexOf(sought, at + MIN_CUT); found >= 0;) {
          reach(next, found + piece.length, count + 1);
          found = text.indexOf(sought, found + 1);
        }
      }
    }
    ends = next;
  }
  return ends.get(text.length) ?? new Set();
}

/** The pairs that docs/mcp/workflow-tools.md describes, in a block. */
function pairs(block: readonly Row[]): [Row, Row][] {
  const candidates: [number, Row, Row][] = [];
  for (const removed of block.filter((row) => row.sign === "-")) {
    for (const added of block.filter((row) => row.sign === "+")) {
      if (removed.text.length <= LINE_CAP && added.text.length <= LINE_CAP) continue;
      const { prefix, suffix } = shared(removed.text, added.text);
      candidates.push([prefix + suffix, removed, added]);
    }
  }
  candidates.sort((a, b) => b[0] - a[0] || a[1].line - b[1].line || a[2].line - b[2].line);
  const taken = new Set<Row>();
  const out: [Row, Row][] = [];
  for (const [, removed, added] of candidates) {
    if (taken.has(removed) || taken.has(added)) continue;
    taken.add(removed).add(added);
    out.push([removed, added]);
  }
  return out;
}

const tally = { cases: 0, cut: 0, shown: 0, hiddenByCut: 0 };

function check({ old, next, from, to, edited }: Case): string[] {
  const problems: string[] = [];
  const fail = (problem: string) => problems.push(problem);
  tally.cases++;
  const diff = lineDiff(from, to, REST);
  const edits = fewestEdits(old, next);
  if (edits === 0) {
    if (diff !== (from === to ? "No change." : "Only line endings changed.")) fail(diff);
    return problems;
  }
  const whole = lineDiff(from, to, undefined);
  const wholeRows = read(whole, old, next, true, fail).flat();
  if (wholeRows.some((row) => row.shown !== row.text)) fail("a line in full is cut");
  if (wholeRows.filter((row) => row.sign !== " ").length !== edits) fail("not the fewest edits");

  const marker = MARKER.exec(diff);
  const body = marker === null ? diff : diff.slice(0, marker.index);
  if (body.length > CHANGE_CAP) fail("past the cap");
  const hunks = read(body, old, next, false, fail);
  const complete = hunks.flat().length === wholeRows.length;
  let added = new Set([0]);
  for (const row of hunks.flat()) {
    if (row.text.length <= row.budget) {
      if (row.shown !== row.text) fail(`${row.sign} line ${row.line} is cut`);
      continue;
    }
    tally.cut++;
    if (row.shown.length > row.budget) fail(`${row.sign} line ${row.line} is past its room`);
    const counts = cuts(row.shown, row.text);
    if (counts.size === 0) fail(`${row.sign} line ${row.line} is not its text with …`);
    added = new Set([...added].flatMap((sum) => [...counts].map((count) => sum + count)));
  }
  const left = marker === null ? 0 : Number(marker[1]);
  if (!added.has(left - whole.length + body.length)) {
    fail(`marker counts ${left}, which no reading of the cut lines gives`);
  }
  for (const hunk of hunks) {
    const blocks = hunk.reduce<Row[][]>((out, row, n) => {
      if (row.sign === " ") return out;
      if (n === 0 || hunk[n - 1]!.sign === " ") out.push([]);
      out.at(-1)!.push(row);
      return out;
    }, []);
    for (const block of blocks) {
      for (const removed of block.filter((row) => row.sign === "-")) {
        for (const added of block.filter((row) => row.sign === "+")) {
          if (removed.text !== added.text && removed.shown === added.shown) {
            fail(`- line ${removed.line} and + line ${added.line} read the same`);
          }
        }
      }
      if (!complete) continue;
      for (const [removed, added] of pairs(block)) {
        const { prefix, suffix } = shared(removed.text, added.text);
        const made = edited.find((edit) => edit.old === removed.line && edit.next === added.line);
        const sides: [Row, number[]][] = [
          [removed, [prefix, removed.text.length - suffix, ...(made?.at[0] ?? [])]],
          [added, [prefix, added.text.length - suffix, ...(made?.at[1] ?? [])]],
        ];
        for (const [row, at] of sides) {
          if (row.text.length <= row.budget) continue;
          if (row.shown.length >= row.budget - 1) {
            tally.hiddenByCut++;
            continue;
          }
          for (const n of at) {
            tally.shown++;
            if (!row.shown.includes(row.text.slice(Math.max(0, n - 30), n + 38))) {
              fail(`${row.sign} line ${row.line} hides offset ${n}`);
            }
          }
        }
      }
    }
  }
  return problems;
}

describe("lineDiff against a reference LCS", () => {
  it("transforms the old text into the new with the fewest edits, shows every change of a long line against its partner, marks every cut with …, and counts what the full diff adds", () => {
    const random = mulberry32(53);
    const cases = [
      ...Array.from({ length: 2000 }, () => texts(random)),
      ...Array.from({ length: 1000 }, () => rows(random)),
    ];
    const failed = cases
      .map((c) => ({ problems: check(c), from: c.from, to: c.to }))
      .filter(({ problems }) => problems.length > 0);
    expect(failed.slice(0, 1)).toEqual([]);
    expect(tally.cut).toBeGreaterThan(1000);
    expect(tally.shown).toBeGreaterThan(8000);
    expect(tally.hiddenByCut).toBeLessThan(tally.shown / 10);
  });
});

describe("lineDiff on a long line", () => {
  it("shows the line's first and last character in place of a … that would hide only that one", () => {
    const old = "0123456789".repeat(60);
    const next = `${old.slice(0, 41)}x${old.slice(42, 558)}y${old.slice(559)}`;
    expect(lineDiff(old, next, REST)).toBe(
      [
        "@@ line 1 @@",
        `- ${old.slice(0, 82)}…${old.slice(518)}`,
        `+ ${next.slice(0, 82)}…${next.slice(518)}`,
        "[clipped: 872 more characters. Read the rest elsewhere.]",
      ].join("\n"),
    );
  });

  it("keeps a … that hides two characters", () => {
    const old = "0123456789".repeat(60);
    const next = `${old.slice(0, 42)}x${old.slice(43, 557)}y${old.slice(558)}`;
    expect(lineDiff(old, next, REST).split("\n").slice(1, 3)).toEqual([
      `- …${old.slice(2, 83)}…${old.slice(517, 598)}…`,
      `+ …${next.slice(2, 83)}…${next.slice(517, 598)}…`,
    ]);
  });

  it("shows the first character in place of a … that would hide only it once the window steps back off an emoji", () => {
    const old = `a😀${"0123456789".repeat(60)}`;
    const next = `${old.slice(0, 42)}x${old.slice(43)}`;
    expect(lineDiff(old, next, REST).split("\n").slice(1, 3)).toEqual([
      `- ${old.slice(0, 83)}…`,
      `+ ${next.slice(0, 83)}…`,
    ]);
  });
});
