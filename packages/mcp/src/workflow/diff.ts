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

/** A changed long line shows from this many characters before its first difference from its pair. */
const LEAD = 40;

/** Beyond this many old × new lines between the common head and tail, every one counts as changed. */
const MAX_CELLS = 1_000_000;

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

/** A longest common subsequence walk that puts removed lines before the added lines they make way for. */
function middle(a: readonly string[], b: readonly string[]): [Sign, string][] {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_CELLS) {
    return [
      ...a.map((text): [Sign, string] => ["-", text]),
      ...b.map((text): [Sign, string] => ["+", text]),
    ];
  }
  const width = m + 1;
  const common = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i * width + j] =
        a[i] === b[j]
          ? common[(i + 1) * width + j + 1]! + 1
          : Math.max(common[(i + 1) * width + j]!, common[i * width + j + 1]!);
    }
  }
  const out: [Sign, string][] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push([" ", a[i++]!]);
      j++;
    } else if (j === m || (i < n && common[(i + 1) * width + j]! >= common[i * width + j + 1]!)) {
      out.push(["-", a[i++]!]);
    } else {
      out.push(["+", b[j++]!]);
    }
  }
  return out;
}

function numbered(edits: readonly [Sign, string][]): Line[] {
  let at = 1;
  return edits.map(([sign, text]) => {
    const line = { sign, text, at };
    if (sign !== "-") at++;
    return line;
  });
}

/** First and last index of each run of changes with its context, runs that touch merged. */
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
 * Where each line's excerpt starts. In a block of changes the k-th removed line pairs with the k-th
 * added one, and both start just before where they first differ, so a long line shows its change.
 */
function windowStarts(lines: readonly Line[]): number[] {
  const starts = lines.map(() => 0);
  let removed: number[] = [];
  let added: number[] = [];
  const pair = (): void => {
    for (const [k, old] of removed.slice(0, added.length).entries()) {
      const start = Math.max(0, sharedPrefix(lines[old]!.text, lines[added[k]!]!.text) - LEAD);
      starts[old] = start;
      starts[added[k]!] = start;
    }
    removed = [];
    added = [];
  };
  lines.forEach(({ sign }, n) => {
    if (sign === " ") pair();
    else (sign === "-" ? removed : added).push(n);
  });
  pair();
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
