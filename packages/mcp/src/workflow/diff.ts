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

/** Far enough across a block to pair a line with lines added or removed above it, near enough to bound the comparisons. */
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
  const reached = new Diagonals(n + m + 1);
  const trace: Diagonals[] = [];
  for (let d = 0; d <= Math.min(n + m, MAX_EDITS); d++) {
    trace.push(reached.around(d));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && reached.get(k - 1) < reached.get(k + 1));
      let x = down ? reached.get(k + 1) : reached.get(k - 1) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      reached.set(k, x);
      if (x >= n && y >= m) return backtrack(a, b, trace);
    }
  }
  return [
    ...a.map((text): [Sign, string] => ["-", text]),
    ...b.map((text): [Sign, string] => ["+", text]),
  ];
}

/** The search's moves from the end back to the start, `trace[d]` being the diagonals before step d. */
function backtrack(
  a: readonly string[],
  b: readonly string[],
  trace: readonly Diagonals[],
): [Sign, string][] {
  const out: [Sign, string][] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const reached = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && reached.get(k - 1) < reached.get(k + 1));
    const before = down ? k + 1 : k - 1;
    const beforeX = reached.get(before);
    const beforeY = beforeX - before;
    while (x > beforeX && y > beforeY) {
      out.push([" ", a[--x]!]);
      y--;
    }
    if (d > 0) out.push(down ? ["+", b[--y]!] : ["-", a[--x]!]);
  }
  return out.reverse();
}

/** The furthest old line the search reached on each diagonal k, old line minus new line, for k within ±radius. */
class Diagonals {
  private readonly radius: number;
  private readonly x: Int32Array;

  constructor(radius: number, x = new Int32Array(2 * radius + 1)) {
    this.radius = radius;
    this.x = x;
  }

  get(k: number): number {
    return this.x[k + this.radius]!;
  }

  set(k: number, x: number): void {
    this.x[k + this.radius] = x;
  }

  /** A copy of diagonals -d-1 to d+1, all that step d reads. */
  around(d: number): Diagonals {
    return new Diagonals(d + 1, this.x.slice(this.radius - d - 1, this.radius + d + 2));
  }
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
