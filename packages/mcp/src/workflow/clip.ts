/** Descriptions and journal notes longer than this are cut, with a marker that says where the rest is. */
export const TEXT_CAP = 4000;

/** A journal's change shown as a diff, such as an edited description, is cut at this many characters. */
export const CHANGE_CAP = 1000;

/**
 * A line of a change's diff shows at most this many characters, and a description on one line up to this
 * long keeps from and to. Both sides of one changed line, each with its clip marker, fit in CHANGE_CAP.
 */
export const LINE_CAP = 350;

/** Cuts text to `cap` characters from `start`, or leaves it whole in a journal returned in full. */
export type Clip = (text: string, cap: number, start?: number) => string;

/**
 * Text longer than `cap` cut to the `cap` characters from `start`, never inside a surrogate pair. A cut
 * before them shows as …, and the marker after them counts every character left out.
 */
export function clip(text: string, cap: number, rest: string, start = 0): string {
  if (text.length <= cap) return text;
  const from = start > 0 && /[\uDC00-\uDFFF]/.test(text.charAt(start)) ? start - 1 : start;
  let end = Math.min(from + cap, text.length);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end--;
  return `${from > 0 ? "…" : ""}${text.slice(from, end)}\n[clipped: ${text.length - (end - from)} more characters. ${rest}]`;
}

export function clipJournal(issueId: number, journalId: number): Clip {
  return (text, cap, start) =>
    clip(
      text,
      cap,
      `Call issue_context with issue_id ${issueId}, journals 0 and full [${journalId}] for all of it.`,
      start,
    );
}
