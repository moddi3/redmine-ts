// The journal that the notes of issues_update or issues_transition were added in, so an agent can cite
// it as #note-N or edit it with journals_update without reading the issue again.

import { z } from "zod";
import { allows } from "../tools.ts";
import type { Client, ToolContext } from "../tools.ts";
import { bestEffort } from "./define.ts";
import { noteNumber } from "./journals.ts";
import type { Journal } from "./journals.ts";
import type { Lookups } from "./lookups.ts";

export const AddedJournal: z.ZodObject<{ id: z.ZodInt; note: z.ZodInt }> = z
  .object({
    id: z.int().describe("The journal's id, which journals_update takes."),
    note: z.int().describe("N in the issue page's #note-N, counted as issue_context counts it."),
  })
  .describe(
    "With notes that are not blank: the journal they were added in. Absent when it cannot be told for sure, such as when the same user adds the same notes to the issue at the same time, or when reading it back fails. The notes were added all the same, so do not send them again.",
  );

export type AddedJournal = z.output<typeof AddedJournal>;

export const RETURNS_JOURNAL =
  "With notes, journal: {id, note} is the journal they were added in, its id for journals_update and its N in #note-N.";

export async function writeAndFindJournal(
  rm: Client,
  { access, lookups }: ToolContext,
  issue_id: number,
  notes: string | undefined,
  write: () => Promise<unknown>,
): Promise<AddedJournal | undefined> {
  if (notes === undefined || notes.trim() === "" || !allows(access, "write")) {
    await write();
    return undefined;
  }
  const before = await bestEffort(() => journalsOf(rm, issue_id), undefined);
  await write();
  if (before === undefined) return undefined;
  return journalAddedSince(rm, lookups, issue_id, notes, before).catch(() => undefined);
}

async function journalAddedSince(
  rm: Client,
  lookups: Lookups,
  issue_id: number,
  notes: string,
  before: readonly Journal[],
): Promise<AddedJournal | undefined> {
  const newest = Math.max(0, ...before.map((journal) => journal.id));
  const [journals, me] = await Promise.all([journalsOf(rm, issue_id), lookups.currentUser()]);
  const added = journals.filter(
    (journal) => journal.id > newest && journal.user?.id === me.id && journal.notes === notes,
  );
  return added.length === 1
    ? { id: added[0]!.id, note: noteNumber(journals, added[0]!) }
    : undefined;
}

async function journalsOf(rm: Client, issue_id: number): Promise<readonly Journal[]> {
  return (await rm.issues.get({ issue_id, include: ["journals"] })).journals ?? [];
}
