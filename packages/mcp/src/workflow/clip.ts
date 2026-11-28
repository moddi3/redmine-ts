/** Descriptions and journal notes longer than this are cut, with a marker that says where the rest is. */
export const TEXT_CAP = 4000;

/** A journal's change shown as a diff, such as an edited description, is cut at this many characters. */
export const CHANGE_CAP = 1000;

/** The end of a clip marker, naming the call that returns all of the text, or undefined for text returned whole. */
export type Rest = string | undefined;

/**
 * `text` cut to its first `cap` characters, never inside a surrogate pair, and marked. It comes whole
 * when it fits, and when the marker is no shorter than the cut, so that a clip never adds bytes.
 */
export function clip(text: string, cap: number, rest: Rest): string {
  if (rest === undefined || text.length <= cap) return text;
  const end = /[\uD800-\uDBFF]/.test(text.charAt(cap - 1)) ? cap - 1 : cap;
  const clipped = `${text.slice(0, end)}${marker(text.length - end, rest)}`;
  return clipped.length < text.length ? clipped : text;
}

export function marker(omitted: number, rest: string): string {
  return `\n[clipped: ${omitted} more characters. ${rest}]`;
}

export function journalRest(issueId: number, journalId: number): string {
  return `Call issue_context with issue_id ${issueId}, journals 0 and full [${journalId}] for all of it.`;
}
