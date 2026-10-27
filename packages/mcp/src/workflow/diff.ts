// A line diff for a journal's change to long text, such as an edited description. Lines split on any
// line break, so text typed in a browser (CRLF) and text sent over the API (LF) compare equal. Each run
// of changed lines shows with one unchanged line around it, under "@@ line N @@" with N the number of
// the run's first line in the new text.

import { LINE_CAP } from "./clip.ts";

type Sign = " " | "-" | "+";

interface Line {
  sign: Sign;
  text: string;
  /** Its number in the new text; for a removed line, the number of the new line that follows it. */
  at: number;
}

const CONTEXT = 1;

/** A changed long line shows from this many characters before its first difference. */
const LEAD = 40;

const REACH = 3;

/** Past this many edits, the search stops and every line between the common head and tail counts as changed. */
const MAX_EDITS = 1000;

export function lineDiff(from: string, to: string): string {
  const lines = numbered(edits(split(from), split(to)));
  if (lines.every((line) => line.sign === " ")) return "Only line endings changed.";
  const starts = windowStarts(lines);
  return runs(lines)
    .flatMap(([first, last]) => [
      `@@ line ${lines[first]!.at} @@`,
      ...lines
        .slice(first, last + 1)
        .map((line, n) => `${line.sign} ${excerpt(line.text, starts[first + n]!)}`),
    ])
    .join("\n");
}

function split(text: string): string[] {
  return text === "" ? [] : text.split(/\r\n|\r|\n/);
}

function edits(a: readonly string[], b: readonly string[]): [Sign, string][] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;
  const same = (lines: readonly string[]): [Sign, string][] => lines.map((text) => [" ", text]);
  return [
    ...same(a.slice(0, head)),
    ...middle(a.slice(head, a.length - tail), b.slice(head, b.length - tail)),
    ...same(a.slice(a.length - tail)),
  ];
}

/** Myers' shortest edit script, for lines between the common head and tail. */
function middle(a: readonly string[], b: readonly string[]): [Sign, string][] {
  const n = a.length;
  const m = b.length;
  // v[offset + k] is the furthest old line reached on diagonal k, old line minus new line.
  const offset = n + m + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(n + m, MAX_EDITS); d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!);
      let x = down ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(a, b, trace);
    }
  }
  return [
    ...a.map((text): [Sign, string] => ["-", text]),
    ...b.map((text): [Sign, string] => ["+", text]),
  ];
}

/** Walks the search back from the end; `trace[d]` holds diagonals -d-1 to d+1 as they were before step d. */
function backtrack(
  a: readonly string[],
  b: readonly string[],
  trace: readonly Int32Array[],
): [Sign, string][] {
  const out: [Sign, string][] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d]!;
    const furthest = (k: number): number => v[k + d + 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && furthest(k - 1) < furthest(k + 1));
    const before = down ? k + 1 : k - 1;
    const beforeX = furthest(before);
    const beforeY = beforeX - before;
    while (x > beforeX && y > beforeY) {
      out.push([" ", a[--x]!]);
      y--;
    }
    if (d > 0) out.push(down ? ["+", b[--y]!] : ["-", a[--x]!]);
  }
  return out.reverse();
}

function numbered(edits: readonly [Sign, string][]): Line[] {
  let at = 1;
  return edits.map(([sign, text]) => {
    const line = { sign, text, at };
    if (sign !== "-") at++;
    return line;
  });
}

function runs(lines: readonly Line[]): [number, number][] {
  const out: [number, number][] = [];
  lines.forEach(({ sign }, n) => {
    if (sign === " ") return;
    const first = Math.max(0, n - CONTEXT);
    const last = Math.min(lines.length - 1, n + CONTEXT);
    const previous = out.at(-1);
    if (previous !== undefined && first <= previous[1] + 1) previous[1] = last;
    else out.push([first, last]);
  });
  return out;
}

/**
 * Where each line's excerpt starts. A changed line longer than LINE_CAP starts just before where it first
 * differs from the line across its block, within REACH places of its own, that shares the longest start.
 * The reach finds the pair when lines were added or removed above it, and bounds the comparisons.
 */
function windowStarts(lines: readonly Line[]): number[] {
  const starts = lines.map(() => 0);
  let removed: number[] = [];
  let added: number[] = [];
  const settle = (): void => {
    for (const [own, across] of [
      [removed, added],
      [added, removed],
    ] as const) {
      own.forEach((n, k) => {
        const { text } = lines[n]!;
        if (text.length <= LINE_CAP) return;
        let shared = 0;
        for (const other of across.slice(Math.max(0, k - REACH), k + REACH + 1)) {
          shared = Math.max(shared, sharedPrefix(text, lines[other]!.text));
        }
        starts[n] = Math.min(Math.max(0, shared - LEAD), text.length - LINE_CAP);
      });
    }
    removed = [];
    added = [];
  };
  lines.forEach(({ sign }, n) => {
    if (sign === " ") settle();
    else (sign === "-" ? removed : added).push(n);
  });
  settle();
  return starts;
}

function sharedPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** LINE_CAP characters of `text` from `start`, with … where it is cut, never inside a surrogate pair. */
function excerpt(text: string, start: number): string {
  const from = start > 0 && /[\uDC00-\uDFFF]/.test(text.charAt(start)) ? start - 1 : start;
  let to = Math.min(text.length, from + LINE_CAP);
  if (to < text.length && /[\uD800-\uDBFF]/.test(text.charAt(to - 1))) to--;
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}
