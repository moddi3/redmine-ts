/** Descriptions and journal notes longer than this are cut, with a marker that says where the rest is. */
export const TEXT_CAP = 4000;

/** Each side of a long field's change in a journal, such as an edited description. */
export const CHANGE_CAP = 500;

export function clip(text: string, cap: number, rest: string): string {
  if (text.length <= cap) return text;
  // Never split a surrogate pair.
  const end = /[\uD800-\uDBFF]/.test(text.charAt(cap - 1)) ? cap - 1 : cap;
  return `${text.slice(0, end)}\n[clipped: ${text.length - end} more characters. ${rest}]`;
}
