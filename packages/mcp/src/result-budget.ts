// Clients cap the size of one tool result: Cursor at 40,000 bytes, Codex at about 48,000 and OpenCode
// at 51,200, and Claude Code saves one over 50,000 characters to a file. List tools, issue_context,
// issues_get with journals and raw_request stop filling a result at a budget in UTF-8 bytes of its
// compact JSON. Each result carries the JSON twice, as a text block and as structuredContent, and
// every client checked reads one of the two, so the budget counts one copy.

import type { Redact } from "./api-keys.ts";
import { withWarning } from "./user-text.ts";

export const DEFAULT_RESULT_BYTES = 32_000;

/** A smaller budget would cut every page to one item, as a budget meant in kilobytes would. */
export const MIN_RESULT_BYTES = 1_000;

/** Claude Code saves a longer text result to a file, unless the tool's _meta raises the limit. */
const CLAUDE_CODE_FILE_CHARS = 50_000;

/** The most Claude Code lets `anthropic/maxResultSizeChars` raise it to. */
const CLAUDE_CODE_MAX_CHARS = 500_000;

/** Characters for the warning on user-written text, about 140, which comes before the JSON. */
const WARNING_ROOM = 1_000;

/** A larger budget would let a result pass the most Claude Code keeps inline. */
export const MAX_RESULT_BYTES: number = CLAUDE_CODE_MAX_CHARS - WARNING_ROOM;

export interface ResultBudget {
  readonly bytes: number;
  redactedJson(value: unknown): string;
  size(value: unknown): number;
}

export function resultBudget(bytes: number, redact: Redact): ResultBudget {
  const encoder = new TextEncoder();
  const redactedJson = (value: unknown) => JSON.stringify(redact(value));
  return {
    bytes,
    redactedJson,
    size: (value) =>
      encoder.encode(JSON.stringify(withWarning(redact(value) as Record<string, unknown>))).length,
  };
}

/** Throws when `bytes` cannot be a budget, as a bad option should when the server is created. */
export function checkResultBytes(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < MIN_RESULT_BYTES || bytes > MAX_RESULT_BYTES) {
    throw new TypeError(
      `maxResultBytes must be an integer from ${MIN_RESULT_BYTES} to ${MAX_RESULT_BYTES}, as Claude Code keeps at most ${CLAUDE_CODE_MAX_CHARS} characters inline`,
    );
  }
}

/**
 * `_meta["anthropic/maxResultSizeChars"]` for the tools the budget bounds, or undefined when Claude
 * Code keeps their results inline without it. A result's text is the JSON, whose characters are at
 * most its bytes, after the warning on user-written text.
 */
export function inlineChars(bytes: number): number | undefined {
  const chars = bytes + WARNING_ROOM;
  return chars > CLAUDE_CODE_FILE_CHARS ? chars : undefined;
}

/**
 * What `build` makes of the most of `count` entries, 1 at least, that fit in the budget. Each entry
 * adds more bytes than any count or cursor beside them can take away, so the sizes grow with the count.
 */
export function fitCount<T>(budget: ResultBudget, count: number, build: (count: number) => T): T {
  const fits = (candidate: number) => {
    const result = build(candidate);
    return budget.size(result) <= budget.bytes ? result : undefined;
  };
  const whole = fits(count);
  if (count <= 1 || whole !== undefined) return whole ?? build(count);
  // `low` is 1 or fits, and `high` does not fit.
  let low = 1;
  let high = count;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle) === undefined) high = middle;
    else low = middle;
  }
  return build(low);
}

/**
 * A list page as it would be sent, cut before the first item that takes its JSON over the budget,
 * with next_offset at that item. It keeps one item at least, so paging always moves on.
 */
export function fitPage(
  page: Record<string, unknown>,
  budget: ResultBudget,
): Record<string, unknown> {
  const { items, offset } = page;
  if (!Array.isArray(items) || typeof offset !== "number") return page;
  return fitCount(budget, items.length, (count) =>
    count === items.length
      ? page
      : { ...page, items: items.slice(0, count), next_offset: offset + count },
  );
}

/**
 * An issue record whose oldest journals are dropped until it fits, one journal kept at least, as
 * issue_context keeps them. journals_before names the oldest kept, for issue_context to continue from.
 */
export function fitJournals(
  record: Record<string, unknown>,
  budget: ResultBudget,
): Record<string, unknown> {
  const { journals } = record;
  if (!Array.isArray(journals)) return record;
  return fitCount(budget, journals.length, (count) => {
    const kept = journals.slice(journals.length - count) as { id: number }[];
    const omitted = journals.length - kept.length;
    return {
      ...record,
      journals: kept,
      journals_omitted: omitted,
      journals_before: omitted > 0 ? kept[0]!.id : null,
    };
  });
}
