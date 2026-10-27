// A line diff for a journal's change to long text, such as an edited description.

import { CHANGE_CAP, marker } from "./clip.ts";
import type { Rest } from "./clip.ts";

type Sign = " " | "-" | "+";

type Run = [sign: Sign, count: number];

type Same = (x: number, y: number) => boolean;

interface Line {
  sign: Sign;
  text: string;
  /** Its number in the new text; for a removed line, the number of the new line that follows it. */
  at: number;
}

type Span = [from: number, to: number];

/** Where a changed line differs from its partner, and from lines whose excerpts would read the same as its own. */
interface Changes {
  partner: Span[];
  others: Span[];
}

const CONTEXT = 1;

/** A line of a change's diff shows at most this many characters, … included. */
export const LINE_CAP = 350;

/** A long line shows this many characters on each side of each place it differs from its partner, so it never shows fewer. */
const LEAD = 40;

/** Past this many edits, the search stops where it got furthest, and every line or character after that counts as changed. */
const MAX_EDITS = 1000;

export function lineDiff(from: string, to: string, rest: Rest): string {
  const lines = numbered(split(from), split(to));
  if (lines.every((line) => line.sign === " ")) {
    return from === to ? "No change." : "Only line endings changed.";
  }
  const all = whole(lines);
  if (rest === undefined) return all;
  let diff = "";
  let shown = 0;
  rows: for (const [first, last] of hunks(lines)) {
    const header = `${diff === "" ? "" : "\n"}@@ line ${lines[first]!.at} @@`;
    if (diff.length + header.length + 4 > CHANGE_CAP) break;
    diff += header;
    shown += header.length;
    let changes = new Map<number, Changes>();
    let removed = new Map<string, string>();
    for (let n = first; n <= last; n++) {
      const { sign, text } = lines[n]!;
      if (sign !== " " && (n === first || lines[n - 1]!.sign === " ")) {
        changes = blockChanges(lines, n, CHANGE_CAP - diff.length);
        removed = new Map();
      }
      const room = CHANGE_CAP - diff.length - 3;
      if (room < 1) break rows;
      const windows = visible(text, Math.min(LINE_CAP, room), changes.get(n));
      const row = excerpt(text, windows);
      // Where no window tells two lines apart, the diff stops, and the marker names the call for all of it.
      if (sign === "+" && (removed.get(row) ?? text) !== text) break rows;
      if (sign === "-") removed.set(row, text);
      diff += `\n${sign} ${row}`;
      shown += 3 + windows.reduce((sum, [start, end]) => sum + end - start, 0);
    }
  }
  return shown === all.length ? diff : `${diff}${marker(all.length - shown, rest)}`;
}

function split(text: string): string[] {
  return text === "" ? [] : text.split(/\r\n|\r|\n/);
}

function numbered(a: readonly string[], b: readonly string[]): Line[] {
  const lines: Line[] = [];
  let x = 0;
  let y = 0;
  for (const [sign, count] of script(a.length, b.length, (i, j) => a[i] === b[j])) {
    for (let n = 0; n < count; n++) {
      lines.push({ sign, text: sign === "+" ? b[y]! : a[x]!, at: y + 1 });
      if (sign !== "+") x++;
      if (sign !== "-") y++;
    }
  }
  return lines;
}

/** The shortest edit script from `n` old lines or characters to `m` new ones, each block of changes as its removals, then its additions. */
function script(n: number, m: number, same: Same): Run[] {
  const [head, tail] = ends(n, m, same);
  const runs: Run[] = [];
  add(runs, " ", head);
  for (const [sign, count] of middle(same, head, n - tail, m - tail)) {
    add(runs, sign, count);
  }
  add(runs, " ", tail);
  return runs;
}

function ends(n: number, m: number, same: Same): [head: number, tail: number] {
  let head = 0;
  while (head < n && head < m && same(head, head)) head++;
  let tail = 0;
  while (tail < n - head && tail < m - head && same(n - 1 - tail, m - 1 - tail)) tail++;
  return [head, tail];
}

function chars(a: string, b: string): Same {
  return (x, y) => a.charCodeAt(x) === b.charCodeAt(y);
}

function add(runs: Run[], sign: Sign, count: number): void {
  if (count === 0) return;
  const last = runs.at(-1);
  if (sign === "-" && last?.[0] === "+") {
    const before = runs.at(-2);
    if (before?.[0] === "-") before[1] += count;
    else runs.splice(-1, 0, ["-", count]);
  } else if (last?.[0] === sign) last[1] += count;
  else runs.push([sign, count]);
}

/** Myers' shortest edit script from the old text's `start` up to `endA` to the new text's `start` up to `endB`. */
function middle(same: Same, start: number, endA: number, endB: number): Run[] {
  const n = endA - start;
  const m = endB - start;
  const most = Math.min(n + m, MAX_EDITS);
  const reached = new Diagonals(most + 1);
  const trace: Diagonals[] = [];
  for (let d = 0; d <= most; d++) {
    trace.push(reached.around(d));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && reached.get(k - 1) < reached.get(k + 1));
      let x = down ? reached.get(k + 1) : reached.get(k - 1) + 1;
      let y = x - k;
      while (x < n && y < m && same(start + x, start + y)) {
        x++;
        y++;
      }
      reached.set(k, x);
      if (x >= n && y >= m) return backtrack(trace, n, m);
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
  return [...backtrack(trace, x, y), ["-", n - x], ["+", m - y]];
}

/** The search's moves from `endX` and `endY` back to the start, `trace[d]` being the diagonals before step d. */
function backtrack(trace: readonly Diagonals[], endX: number, endY: number): Run[] {
  const out: Run[] = [];
  let x = endX;
  let y = endY;
  for (let d = trace.length - 1; d >= 0; d--) {
    const reached = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && reached.get(k - 1) < reached.get(k + 1));
    const before = down ? k + 1 : k - 1;
    const beforeX = reached.get(before);
    const kept = Math.max(0, Math.min(x - beforeX, y - (beforeX - before)));
    out.push([" ", kept]);
    x -= kept;
    y -= kept;
    if (d === 0) continue;
    out.push(down ? ["+", 1] : ["-", 1]);
    if (down) y--;
    else x--;
  }
  return out.reverse();
}

/** The furthest point the search reached on each diagonal k, the old index minus the new, for k within ±radius. */
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

function hunks(lines: readonly Line[]): [number, number][] {
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

function whole(lines: readonly Line[]): string {
  return hunks(lines)
    .map(([first, last]) =>
      [
        `@@ line ${lines[first]!.at} @@`,
        ...lines.slice(first, last + 1).map(({ sign, text }) => `${sign} ${text}`),
      ].join("\n"),
    )
    .join("\n");
}

/** The Changes, by line, of the block of changes from `start`, with its long lines paired as the README says. */
function blockChanges(lines: readonly Line[], start: number, room: number): Map<number, Changes> {
  let end = start;
  while (end < lines.length && lines[end]!.sign !== " ") end++;
  const showable = room / LEAD;
  const long: number[] = [];
  for (let n = start; n < end && long.length < showable; n++) {
    if (lines[n]!.text.length > LINE_CAP) long.push(n);
  }
  const pairs: [shared: number, removed: number, added: number][] = [];
  for (const n of long) {
    for (let k = start; k < end; k++) {
      if (lines[k]!.sign === lines[n]!.sign) continue;
      const [removed, added] = lines[n]!.sign === "-" ? [n, k] : [k, n];
      const [a, b] = [lines[removed]!.text, lines[added]!.text];
      const [head, tail] = ends(a.length, b.length, chars(a, b));
      pairs.push([head + tail, removed, added]);
    }
  }
  pairs.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  const changes = new Map<number, Changes>();
  const differ = (removed: number, added: number, kind: keyof Changes) => {
    const spans = differences(lines[removed]!.text, lines[added]!.text);
    [removed, added].forEach((n, side) => {
      const known = changes.get(n) ?? { partner: [], others: [] };
      known[kind].push(...spans[side]!);
      changes.set(n, known);
    });
  };
  for (const [, removed, added] of pairs) {
    if (!changes.has(removed) && !changes.has(added)) differ(removed, added, "partner");
  }
  const shown = (n: number) =>
    excerpt(lines[n]!.text, visible(lines[n]!.text, LINE_CAP, changes.get(n)));
  for (const removed of long.filter((n) => lines[n]!.sign === "-")) {
    for (const added of long.filter((n) => lines[n]!.sign === "+")) {
      if (lines[removed]!.text !== lines[added]!.text && shown(removed) === shown(added)) {
        differ(removed, added, "others");
      }
    }
  }
  return changes;
}

/** Where `a` and `b` differ: for each run of changes, its span in `a` and its span in `b`. */
function differences(a: string, b: string): [Span[], Span[]] {
  const old: Span[] = [];
  const next: Span[] = [];
  let x = 0;
  let y = 0;
  let previous: Sign = " ";
  for (const [sign, count] of script(a.length, b.length, chars(a, b))) {
    if (sign === " ") {
      x += count;
      y += count;
    } else {
      if (previous === " ") {
        old.push([x, x]);
        next.push([y, y]);
      }
      if (sign === "-") x += count;
      else y += count;
      old.at(-1)![1] = x;
      next.at(-1)![1] = y;
    }
    previous = sign;
  }
  return [old, next];
}

/**
 * The parts of `text` its excerpt shows in `budget` characters, … included: windows around where it
 * differs from its partner, then each window around where it differs from others that still fits, or
 * else its start.
 */
function visible(text: string, budget: number, changes?: Changes): Span[] {
  if (text.length <= budget) return [[0, text.length]];
  if (changes === undefined || changes.partner.length + changes.others.length === 0) {
    return fit(text, [[0, text.length]], budget);
  }
  let windows = fit(text, merge(around(text, changes.partner)), budget);
  for (const window of around(text, changes.others)) {
    const wider = merge([...windows, window]);
    if (excerpt(text, wider).length <= budget) windows = wider;
  }
  return windows;
}

function around(text: string, spans: readonly Span[]): Span[] {
  return spans.map(([from, to]) => [
    snap(text, Math.max(0, from - LEAD)),
    snap(text, Math.min(text.length, to + LEAD)),
  ]);
}

function merge(windows: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const [from, to] of [...windows].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last !== undefined && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/** The windows that fit in `budget` characters, … included, and the first that does not, cut short. */
function fit(text: string, windows: readonly Span[], budget: number): Span[] {
  const out: Span[] = [];
  let used = 0;
  let at = 0;
  for (const [from, to] of windows) {
    const gap = from > at ? 1 : 0;
    if (used + gap + to - from + (to < text.length ? 1 : 0) > budget) {
      const end = snap(text, from + budget - used - gap - 1);
      if (end > from) out.push([from, end]);
      break;
    }
    out.push([from, to]);
    used += gap + to - from;
    at = to;
  }
  return out;
}

/** `at`, or one less where `at` would split a surrogate pair. */
function snap(text: string, at: number): number {
  return at > 0 && at < text.length && /[\uD800-\uDBFF]/.test(text.charAt(at - 1)) ? at - 1 : at;
}

function excerpt(text: string, windows: readonly Span[]): string {
  let out = "";
  let at = 0;
  for (const [from, to] of windows) {
    out += `${from > at ? "…" : ""}${text.slice(from, to)}`;
    at = to;
  }
  return at < text.length ? `${out}…` : out;
}
