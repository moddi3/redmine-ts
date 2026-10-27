/** Descriptions and journal notes longer than this are cut, with a marker that says where the rest is. */
export const TEXT_CAP = 4000;

/** A journal's change shown as a diff, such as an edited description, is cut at this many characters. */
export const CHANGE_CAP = 1000;

/**
 * Text longer than `cap` cut to its first `cap` characters, never inside a surrogate pair, with a marker
 * that says how much is left out and `rest`, where to read all of it. Without `rest` it stays whole.
 */
export function clip(text: string, cap: number, rest: string | undefined): string {
  if (rest === undefined || text.length <= cap) return text;
  const end = /[\uD800-\uDBFF]/.test(text.charAt(cap - 1)) ? cap - 1 : cap;
  return `${text.slice(0, end)}${marker(text.length - end, rest)}`;
}

/** What ends a text that leaves `omitted` characters out, with `rest`, where to read all of it. */
export function marker(omitted: number, rest: string): string {
  return `\n[clipped: ${omitted} more characters. ${rest}]`;
}

/** Where to read all of a journal's text that issue_context cut. */
export function journalRest(issueId: number, journalId: number): string {
  return `Call issue_context with issue_id ${issueId}, journals 0 and full [${journalId}] for all of it.`;
}
