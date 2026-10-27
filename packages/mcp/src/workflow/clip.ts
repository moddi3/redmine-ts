/** Descriptions and journal notes longer than this are cut, with a marker that says where the rest is. */
export const TEXT_CAP = 4000;

/** A journal's change shown as a diff, such as an edited description, is cut at this many characters. */
export const CHANGE_CAP = 1000;

/** A line of a change's diff shows at most this many characters. Text on one line up to this long shows whole. */
export const LINE_CAP = 200;

export function clip(text: string, cap: number, rest: string): string {
  if (text.length <= cap) return text;
  // Never split a surrogate pair.
  const end = /[\uD800-\uDBFF]/.test(text.charAt(cap - 1)) ? cap - 1 : cap;
  return `${text.slice(0, end)}\n[clipped: ${text.length - end} more characters. ${rest}]`;
}
