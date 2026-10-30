// issue_context: what an agent needs to work on one issue, from one issues.get with every include,
// one list call for the subtasks' statuses, and only the lookups its journals reference. The issue
// resource renders the same data as Markdown, with user-written text quoted so it cannot pass for
// the document's own structure.

import type { Issue } from "@redmine-ts/sdk";
import { z } from "zod";
import { BY_METHOD } from "../catalog-tools.ts";
import { roundHours } from "../hours.ts";
import { fitCount } from "../result-budget.ts";
import type { ResultBudget } from "../result-budget.ts";
import type { Client, ToolSpec } from "../tools.ts";
import { UNTRUSTED } from "../user-text.ts";
import { clip, journalRest, TEXT_CAP } from "./clip.ts";
import { bestEffort, defineTool, ToolError } from "./define.ts";
import { LINE_CAP } from "./diff.ts";
import { changesOf, FROM_TO_CAP, RELATION_PHRASES, resolveNames } from "./journals.ts";
import type { Lookups } from "./lookups.ts";

export const DEFAULT_JOURNALS = 20;
const MAX_JOURNALS = 100;

const INCLUDES = [
  "children",
  "attachments",
  "relations",
  "journals",
  "watchers",
  "allowed_statuses",
] as const;

/** The same relation as it reads from its other issue. */
const REVERSE: Readonly<Record<string, string>> = {
  relates: "relates",
  duplicates: "duplicated",
  duplicated: "duplicates",
  blocks: "blocked",
  blocked: "blocks",
  precedes: "follows",
  follows: "precedes",
  copied_to: "copied_from",
  copied_from: "copied_to",
};

const Ref = z.looseObject({ id: z.int(), name: z.string() });
const day = z.string().nullable().optional();

const IssueSchema = z
  .looseObject({
    id: z.int(),
    project: Ref.optional(),
    tracker: Ref.optional(),
    status: Ref.optional(),
    priority: Ref.optional(),
    author: Ref.optional(),
    assigned_to: Ref.optional(),
    category: Ref.optional(),
    fixed_version: Ref.optional(),
    parent: z.looseObject({ id: z.int().optional() }).optional(),
    subject: z.string(),
    description: z.string().nullable().optional(),
    start_date: day,
    due_date: day,
    done_ratio: z.number().optional(),
    is_private: z.boolean().optional(),
    estimated_hours: z.number().nullable().optional(),
    spent_hours: z.number().optional(),
    custom_fields: z
      .array(
        z.looseObject({
          id: z.int(),
          name: z.string(),
          value: z.union([z.string(), z.null(), z.array(z.string())]).optional(),
        }),
      )
      .optional(),
    created_on: z.string().optional(),
    updated_on: z.string().optional(),
    closed_on: day,
  })
  .describe("The issue as Redmine returns it, description included.");

const Statuses = z
  .array(z.object({ id: z.int(), name: z.string(), is_closed: z.boolean() }))
  .describe("Statuses the workflow lets this API key's user set, the current one included.");

const Relations = z
  .array(
    z.object({
      id: z.int().optional(),
      relation: z.string(),
      issue_id: z.int(),
      delay: z.int().optional(),
    }),
  )
  .describe(
    'Read from this issue: {relation: "blocked by", issue_id: 12} means this issue is blocked by #12.',
  );

const Children = z
  .array(
    z.object({
      id: z.int(),
      subject: z.string().nullable(),
      tracker: z.string().nullable(),
      status: z.string().nullable(),
      is_closed: z.boolean().nullable(),
    }),
  )
  .describe("Direct subtasks.");

const Attachments = z.array(
  z.object({
    id: z.int(),
    filename: z.string(),
    filesize: z.int(),
    content_type: z.string().nullable(),
    description: z.string().nullable(),
    author: z.string().nullable(),
    created_on: z.string(),
  }),
);

const LATER_PAGE = "Left out on a journals_before or journals_after page.";

const IssueContextSchema = z.object({
  issue: z.union([
    IssueSchema,
    z
      .object({ id: z.int(), updated_on: z.string().optional() })
      .describe("On a journals_before or journals_after page: the issue's id and updated_on only."),
  ]),
  allowed_statuses: Statuses.optional().describe(LATER_PAGE),
  relations: Relations.optional().describe(LATER_PAGE),
  children: Children.optional().describe(LATER_PAGE),
  attachments: Attachments.optional().describe(LATER_PAGE),
  watchers: z
    .array(z.object({ id: z.int(), name: z.string() }))
    .optional()
    .describe(`Absent when the key may not see watchers. ${LATER_PAGE}`),
  journals: z
    .array(
      z.object({
        id: z.int(),
        note: z
          .int()
          .describe(
            "N in the issue page's #note-N: the place among the journals this key may see, oldest first, from 1. Lower than Redmine's after a journal hidden from the key's user, such as another user's private note.",
          ),
        user: z.string().nullable(),
        created_on: z.string(),
        notes: z.string(),
        private_notes: z.boolean(),
        changes: z.array(
          z.union([
            z.object({ field: z.string(), from: z.string().nullable(), to: z.string().nullable() }),
            z.object({
              field: z.string(),
              diff: z
                .string()
                .describe(
                  `In place of from and to for a description on several lines or over ${FROM_TO_CAP} characters, or a custom field on several lines. The changed lines, - old and + new, with one unchanged line around each run. A line over ${LINE_CAP} characters shows the text around each place it changed, with … in place of each part left out. A diff that leaves anything out ends with one clip marker that names the call for all of it. A journal in full is not cut.`,
                ),
            }),
          ]),
        ),
      }),
    )
    .describe(
      "The newest journals after journals_after and before journals_before, and those in full, oldest first, with ids in changes resolved to names.",
    ),
  journals_total: z.int(),
  journals_omitted: z
    .int()
    .describe(
      "Journals after journals_after and older than this page that the next pages return, a journal in full included.",
    ),
  journals_before: z
    .int()
    .nullable()
    .describe(
      "Pass as journals_before, with the same journals_after, for the next older page. null when no older journal is left out, or when journals is 0.",
    ),
});

type IssueContext = z.output<typeof IssueContextSchema>;

type FirstPage = IssueContext & {
  issue: z.output<typeof IssueSchema>;
  allowed_statuses: z.output<typeof Statuses>;
  relations: z.output<typeof Relations>;
  children: z.output<typeof Children>;
  attachments: z.output<typeof Attachments>;
};

type Journals = Pick<
  IssueContext,
  "journals" | "journals_total" | "journals_omitted" | "journals_before"
>;

export const issueContextTool: ToolSpec = defineTool({
  name: "issue_context",
  title: "Get issue context",
  description: [
    "Everything needed to work on one issue in one call: the issue with its full description, the statuses it can move to next, relations read from this issue, subtasks with their status, attachment metadata, watchers, and the newest journals as readable diffs with ids resolved to names.",
    "Call it first when asked to work on, triage or summarize an issue, instead of issues_get.",
    `Descriptions and notes longer than ${TEXT_CAP} characters are clipped with a marker that names the call returning them whole.`,
    "Returns {issue, allowed_statuses, relations, children, attachments, watchers, journals, journals_total, journals_omitted, journals_before}.",
    "Journals stop at the result budget; call again with journals_before for the older ones, or with journals_after for the ones newer than a journal you read. Those pages return the issue as {id, updated_on} with the journals only.",
    "Next: issues_transition to change the status by name, issues_update for other fields or a note, attachments_download to read a file.",
  ].join(" "),
  input: z.strictObject({
    issue_id: z.int().positive().describe("The issue id, 123 for #123."),
    journals: z
      .int()
      .min(0)
      .max(MAX_JOURNALS)
      .default(DEFAULT_JOURNALS)
      .describe(
        `How many of the newest journals to include, ${DEFAULT_JOURNALS} by default, at most ${MAX_JOURNALS}, fewer past the result budget. 0 leaves them out.`,
      ),
    journals_before: z
      .int()
      .positive()
      .optional()
      .describe(
        "A journal id, from journals_before of the last result: returns older journals, and the issue as {id, updated_on} only, because the first page carried the rest.",
      ),
    journals_after: z
      .int()
      .positive()
      .optional()
      .describe(
        "A journal id, such as the newest one read: returns only newer journals, and the issue as {id, updated_on} only. Use it to check for replies.",
      ),
    full: z
      .array(z.int().positive())
      .default([])
      .describe(
        "Ids of journals to return unclipped, even if older than the newest `journals`. An older one still counts in journals_omitted and comes again on its own page.",
      ),
  }),
  output: IssueContextSchema,
  ...BY_METHOD.GET,
  budgeted: true,
  run: async (rm, input, { lookups, budget }) => ({
    structured: await issueContext(rm, lookups, input, budget),
  }),
});

interface ContextInput {
  readonly issue_id: number;
  readonly journals: number;
  readonly full: readonly number[];
  readonly journals_before?: number | undefined;
  readonly journals_after?: number | undefined;
}

async function issueContext(
  rm: Client,
  lookups: Lookups,
  input: ContextInput,
  budget: ResultBudget | undefined,
): Promise<IssueContext> {
  const issue = await rm.issues.get({ issue_id: input.issue_id, include: [...INCLUDES] });
  const unknown = input.full.filter(
    (id) => !(issue.journals ?? []).some((journal) => journal.id === id),
  );
  if (unknown.length > 0) {
    throw new ToolError(
      `Issue ${issue.id} has no journal ${unknown.join(" or ")} that this API key can read. Journal ids come from journals[].id or a clip marker.`,
      { kind: "unknown_journal", issue_id: issue.id, journal_ids: unknown },
    );
  }
  if (input.journals_before === undefined && input.journals_after === undefined) {
    return firstPage(rm, lookups, issue, input, budget);
  }
  const page = await journalPage(rm, lookups, issue, input);
  return fit({ issue: { id: issue.id, updated_on: issue.updated_on } }, page, budget);
}

async function firstPage(
  rm: Client,
  lookups: Lookups,
  issue: Issue,
  input: ContextInput,
  budget: ResultBudget | undefined,
): Promise<FirstPage> {
  const [page, children] = await Promise.all([
    journalPage(rm, lookups, issue, input),
    childrenOf(rm, issue),
  ]);
  const fields = Object.fromEntries(
    Object.entries(issue).filter(([key]) => !(INCLUDES as readonly string[]).includes(key)),
  );
  const { description } = issue;
  const head = {
    issue: roundHours({
      ...fields,
      id: issue.id,
      subject: issue.subject,
      description:
        description === null
          ? null
          : clip(description, TEXT_CAP, `Call issues_get with issue_id ${issue.id} for all of it.`),
    }),
    allowed_statuses: (issue.allowed_statuses ?? []).map(({ id, name, is_closed }) => ({
      id,
      name,
      is_closed,
    })),
    relations: (issue.relations ?? []).flatMap((relation) => relationFrom(issue.id, relation)),
    children,
    attachments: (issue.attachments ?? []).map((file) => ({
      id: file.id,
      filename: file.filename,
      filesize: file.filesize,
      content_type: file.content_type,
      description: file.description,
      author: file.author?.name ?? null,
      created_on: file.created_on,
    })),
    ...(issue.watchers === undefined
      ? {}
      : { watchers: issue.watchers.map(({ id, name }) => ({ id, name })) }),
  };
  return fit(head, page, budget);
}

interface JournalPage {
  readonly available: number;
  page(count: number): Journals;
}

/**
 * The page is the newest `journals` after journals_after and before journals_before. Journals in full
 * come on top of it, never cut. journals_omitted counts the rest of that range, which the next pages
 * return, so a journal in full comes again on its own page.
 */
async function journalPage(
  rm: Client,
  lookups: Lookups,
  issue: Issue,
  { journals, full, journals_before, journals_after }: ContextInput,
): Promise<JournalPage> {
  const all = issue.journals ?? [];
  const whole = new Set(full);
  const range = before(after(all, journals_after), journals_before);
  const newest = journals === 0 ? [] : range.slice(-journals);
  const candidates = all.filter((journal) => newest.includes(journal) || whole.has(journal.id));
  const names = await resolveNames(rm, lookups, issue, candidates);
  const customFields = new Map((issue.custom_fields ?? []).map((cf) => [String(cf.id), cf.name]));
  const entries = new Map(
    candidates.map((journal) => {
      const rest = whole.has(journal.id) ? undefined : journalRest(issue.id, journal.id);
      const entry: IssueContext["journals"][number] = {
        id: journal.id,
        note: all.indexOf(journal) + 1,
        user: journal.user?.name ?? null,
        created_on: journal.created_on,
        notes: clip(journal.notes ?? "", TEXT_CAP, rest),
        private_notes: journal.private_notes ?? false,
        changes: changesOf(journal, names, customFields, rest),
      };
      return [journal, entry];
    }),
  );
  return {
    available: newest.length,
    page: (count) => {
      const page = count === 0 ? [] : newest.slice(-count);
      const omitted = range.length - page.length;
      return {
        journals: candidates
          .filter((journal) => page.includes(journal) || whole.has(journal.id))
          .map((journal) => entries.get(journal)!),
        journals_total: all.length,
        journals_omitted: omitted,
        journals_before: page.length > 0 && omitted > 0 ? page[0]!.id : null,
      };
    },
  };
}

/**
 * `head` with as many journals of the page as the budget fits, and one at least, so paging moves on
 * even when the issue alone is over the budget. Without a budget, as for the issue resource, the
 * count alone decides.
 */
function fit<H extends object>(
  head: H,
  journals: JournalPage,
  budget: ResultBudget | undefined,
): H & Journals {
  const build = (count: number) => ({ ...head, ...journals.page(count) });
  return budget === undefined
    ? build(journals.available)
    : fitCount(budget, journals.available, build);
}

/**
 * The journals before journals_before, oldest first: those before it in Redmine's order, or, for an id
 * the key cannot see now, such as a journal deleted since, those with a lower id.
 */
function before(all: readonly Journal[], id: number | undefined): readonly Journal[] {
  if (id === undefined) return all;
  const at = all.findIndex((journal) => journal.id === id);
  return at === -1 ? all.filter((journal) => journal.id < id) : all.slice(0, at);
}

function after(all: readonly Journal[], id: number | undefined): readonly Journal[] {
  if (id === undefined) return all;
  const at = all.findIndex((journal) => journal.id === id);
  return at === -1 ? all.filter((journal) => journal.id > id) : all.slice(at + 1);
}

type Journal = NonNullable<Issue["journals"]>[number];

function relationFrom(
  issueId: number,
  { id, issue_id: from, issue_to_id: to, relation_type: type, delay }: Relation,
): z.output<typeof Relations> {
  if (from === undefined || to === undefined || type === undefined) return [];
  const outgoing = from === issueId;
  const own = outgoing ? type : (REVERSE[type] ?? type);
  return [
    {
      ...(id === undefined ? {} : { id }),
      relation: RELATION_PHRASES[own] ?? own,
      issue_id: outgoing ? to : from,
      ...(delay === null || delay === undefined ? {} : { delay }),
    },
  ];
}

type Relation = NonNullable<Issue["relations"]>[number];

/** include=children carries no status, so one list of the direct subtasks adds it. */
async function childrenOf(rm: Client, issue: Issue): Promise<z.output<typeof Children>> {
  const direct = issue.children ?? [];
  if (direct.length === 0) return [];
  const statuses = await bestEffort(async () => {
    const listing = rm.issues.list({ where: { parent_id: issue.id, status_id: "any" } });
    const { items } = await listing.page({ limit: 100 });
    return new Map(items.map((child) => [child.id, child.status]));
  }, new Map());
  return direct.flatMap(({ id, subject, tracker }) => {
    if (id === undefined) return [];
    const status = statuses.get(id);
    return [
      {
        id,
        subject: subject ?? null,
        tracker: tracker?.name ?? null,
        status: status?.name ?? null,
        is_closed: status?.is_closed ?? null,
      },
    ];
  });
}

/** The issue resource's text: issue_context with the default journals, as Markdown. */
export async function issueMarkdown(
  rm: Client,
  lookups: Lookups,
  issue_id: number,
): Promise<string> {
  const issue = await rm.issues.get({ issue_id, include: [...INCLUDES] });
  const input = { issue_id, journals: DEFAULT_JOURNALS, full: [] };
  return markdown(await firstPage(rm, lookups, issue, input, undefined));
}

function markdown(context: FirstPage): string {
  const { issue, journals } = context;
  const facts: [string, string | number | null | undefined][] = [
    ["Project", issue.project?.name],
    ["Status", issue.status?.name],
    ["Priority", issue.priority?.name],
    ["Assignee", issue.assigned_to?.name],
    ["Author", issue.author?.name],
    ["Category", issue.category?.name],
    ["Target version", issue.fixed_version?.name],
    ["Parent task", issue.parent?.id === undefined ? undefined : `#${issue.parent.id}`],
    ["Start date", issue.start_date],
    ["Due date", issue.due_date],
    ["Done", issue.done_ratio === undefined ? undefined : `${issue.done_ratio}%`],
    ["Estimated hours", issue.estimated_hours],
    ["Spent hours", issue.spent_hours],
    ["Private", issue.is_private ? "yes" : undefined],
    ["Created", issue.created_on],
    ["Updated", issue.updated_on],
    ["Closed", issue.closed_on],
    ...(issue.custom_fields ?? []).map(({ name, value }): [string, string | null | undefined] => [
      name,
      Array.isArray(value) ? value.join(", ") : value,
    ]),
    [
      "Allowed statuses",
      context.allowed_statuses.map(({ id, name }) => `${name} (${id})`).join(", "),
    ],
  ];
  const lines = [
    `> ${UNTRUSTED}`,
    "",
    `# ${issue.tracker?.name ?? "Issue"} #${issue.id}: ${issue.subject}`,
    "",
    ...facts.flatMap(([label, value]) =>
      value === undefined || value === null || value === "" ? [] : [`- ${label}: ${String(value)}`],
    ),
    ...section("Description", [quote(issue.description ?? "") || "(none)"]),
    ...section(
      "Relations",
      context.relations.map(
        ({ relation, issue_id, delay }) =>
          `- ${relation} #${issue_id}${delay === undefined ? "" : ` (delay ${delay} days)`}`,
      ),
    ),
    ...section(
      "Subtasks",
      context.children.map(({ id, subject, tracker, status }) => {
        const about = [tracker, status].filter((part) => part !== null).join(", ");
        return `- #${id} ${subject ?? ""}${about === "" ? "" : ` (${about})`}`;
      }),
    ),
    ...section(
      "Attachments",
      context.attachments.map(
        (file) =>
          `- ${file.filename} (id ${file.id}, ${file.filesize} bytes, ${file.content_type ?? "unknown type"}${file.author === null ? "" : `, by ${file.author}`}, ${file.created_on})${file.description ? `: ${file.description}` : ""}`,
      ),
    ),
    ...section(
      "Watchers",
      context.watchers?.length ? [context.watchers.map(({ name }) => name).join(", ")] : [],
    ),
  ];
  if (context.journals_total > 0) {
    lines.push("", "## Journals", "");
    if (context.journals_omitted > 0) {
      lines.push(
        `The newest ${journals.length} of ${context.journals_total}, oldest first; ${context.journals_omitted} older left out. The issue_context tool returns them with journals_before: ${context.journals_before}.`,
      );
    }
    for (const journal of journals) {
      lines.push(
        "",
        `### #note-${journal.note}, ${journal.created_on}, ${journal.user ?? "unknown user"} (journal ${journal.id}${journal.private_notes ? ", private notes" : ""})`,
        "",
        ...journal.changes.flatMap((change) =>
          "diff" in change
            ? [`- ${change.field}:`, ...diffBlock(change.diff).map((line) => `  ${line}`)]
            : [`- ${change.field}: ${change.from || "none"} → ${change.to || "none"}`],
        ),
      );
      if (journal.notes !== "")
        lines.push(...(journal.changes.length > 0 ? [""] : []), quote(journal.notes));
    }
  }
  return `${lines.join("\n")}\n`;
}

function section(title: string, body: readonly string[]): string[] {
  return body.length === 0 ? [] : ["", `## ${title}`, "", ...body];
}

/** A fence longer than any run of backticks in the diff, so no line of the user's text can close it. */
function diffBlock(diff: string): string[] {
  const fence = "`".repeat(Math.max(2, ...(diff.match(/`+/g) ?? []).map((run) => run.length)) + 1);
  return [`${fence}diff`, ...diff.split("\n"), fence];
}

function quote(text: string): string {
  if (text === "") return "";
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}
