// A line diff for a journal's change to long text, such as an edited description.

import { CHANGE_CAP, clip } from "./clip.ts";

type Sign = " " | "-" | "+";

interface Line {
  sign: Sign;
  text: string;
  /** Its number in the new text; for a removed line, the number of the new line that follows it. */
  at: number;
}

const CONTEXT = 1;

/** A line of a change's diff shows at most this many characters. */
export const LINE_CAP = 350;

/** A changed long line shows this many characters before its first difference and after its last. */
const LEAD = 40;

/** Past this many edits, the search stops where it got furthest, and every line after that counts as changed. */
const MAX_EDITS = 1000;

/** `rest` says where to read all of a diff that is cut; without it, nothing is. */
export function lineDiff(from: string, to: string, rest: string | undefined): string {
  const cut: Clip = (text, cap, start) => clip(text, cap, rest, start);
  const lines = numbered(edits(split(from), split(to)));
  if (lines.every((line) => line.sign === " ")) {
    return from === to ? "No change." : "Only line endings changed.";
  }
  let diff = "";
  for (const [first, last] of runs(lines)) {
    diff += `${diff === "" ? "" : "\n"}@@ line ${lines[first]!.at} @@`;
    for (let n = first; n <= last; n++) {
      const insideCap = diff.length < CHANGE_CAP;
      const same = insideCap ? counterpart(lines, n) : undefined;
      diff += `\n${lines[n]!.sign} ${excerpt(lines[n]!.text, same, cut)}`;
    }
  }
  return cut(diff, CHANGE_CAP);
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
  const most = Math.min(n + m, MAX_EDITS);
  const reached = new Diagonals(most + 1);
  const trace: Diagonals[] = [];
  for (let d = 0; d <= most; d++) {
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
      if (x >= n && y >= m) return backtrack(a, b, trace, n, m);
    }
  }
  let x = 0;
  let y = 0;
  for (let k = -most; k <= most; k += 2) {
    const kx = reached.get(k);
    if (kx <= n && kx - k <= m && 2 * kx - k > x + y) {
      x = kx;
      y = kx - k;
    }
  }
  return [
    ...backtrack(a, b, trace, x, y),
    ...a.slice(x).map((text): [Sign, string] => ["-", text]),
    ...b.slice(y).map((text): [Sign, string] => ["+", text]),
  ];
}

/** The search's moves from old line `endX` and new line `endY` back to the start, `trace[d]` being the diagonals before step d. */
function backtrack(
  a: readonly string[],
  b: readonly string[],
  trace: readonly Diagonals[],
  endX: number,
  endY: number,
): [Sign, string][] {
  const out: [Sign, string][] = [];
  let x = endX;
  let y = endY;
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
 * For a changed long line, what it shares at the start and end with the line across its block of
 * changes that shares the most with it.
 */
function counterpart(lines: readonly Line[], n: number): Shared | undefined {
  const { sign, text } = lines[n]!;
  if (sign === " " || text.length <= LINE_CAP) return undefined;
  let first = n;
  while (first > 0 && lines[first - 1]!.sign !== " ") first--;
  let best: Shared | undefined;
  for (let k = first; k < lines.length && lines[k]!.sign !== " "; k++) {
    if (lines[k]!.sign === sign) continue;
    const same = shared(text, lines[k]!.text);
    if (best === undefined || same.prefix + same.suffix > best.prefix + best.suffix) best = same;
  }
  return best;
}

type Clip = (text: string, cap: number, start?: number) => string;

interface Shared {
  prefix: number;
  suffix: number;
}

function shared(a: string, b: string): Shared {
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

function excerpt(text: string, same: Shared | undefined, cut: Clip): string {
  if (text.length <= LINE_CAP) return text;
  if (same === undefined) return cut(text, LINE_CAP);
  const { prefix, suffix } = same;
  const start = Math.max(0, prefix - LEAD);
  const end = Math.min(text.length - suffix + LEAD, start + LINE_CAP);
  return cut(text, end - start, start);
}
