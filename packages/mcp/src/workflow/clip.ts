/** Descriptions and journal notes longer than this are cut, with a marker that says where the rest is. */
export const TEXT_CAP = 4000;

/** A journal's change shown as a diff, such as an edited description, is cut at this many characters. */
export const CHANGE_CAP = 1000;

/**
 * Text longer than `cap` cut to the `cap` characters from `start`, never inside a surrogate pair, with a
 * marker that says how much is left out and `rest`, where to read all of it. Without `rest` it stays whole.
 */
export function clip(text: string, cap: number, rest: string | undefined, start = 0): string {
  if (rest === undefined || text.length <= cap) return text;
  const from = start > 0 && /[\uDC00-\uDFFF]/.test(text.charAt(start)) ? start - 1 : start;
  let end = Math.min(from + cap, text.length);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end--;
  return `${from > 0 ? "…" : ""}${text.slice(from, end)}\n[clipped: ${text.length - (end - from)} more characters. ${rest}]`;
}

/** Where to read all of a journal's text that issue_context cut. */
export function journalRest(issueId: number, journalId: number): string {
  return `Call issue_context with issue_id ${issueId}, journals 0 and full [${journalId}] for all of it.`;
}
