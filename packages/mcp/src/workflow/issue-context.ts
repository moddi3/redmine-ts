// issue_context: what an agent needs to work on one issue, from one issues.get with every include,
// one list call for the subtasks' statuses, and only the lookups its journals reference. The issue
// resource renders the same data as Markdown, with user-written text quoted so it cannot pass for
// the document's own structure.

import type { Issue } from "@redmine-ts/sdk";
import { z } from "zod";
import { BY_METHOD } from "../catalog-tools.ts";
import type { Client, ToolSpec } from "../tools.ts";
import { UNTRUSTED } from "../user-text.ts";
import { clip, clipJournal, LINE_CAP, TEXT_CAP } from "./clip.ts";
import type { Clip } from "./clip.ts";
import { bestEffort, defineTool, ToolError } from "./define.ts";
import { changesOf, RELATION_PHRASES, resolveNames } from "./journals.ts";
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

const IssueContextSchema = z.object({
  issue: z
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
    .describe("The issue as Redmine returns it, description included."),
  allowed_statuses: z
    .array(z.object({ id: z.int(), name: z.string(), is_closed: z.boolean() }))
    .describe("Statuses the workflow lets this API key's user set, the current one included."),
  relations: z
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
    ),
  children: z
    .array(
      z.object({
        id: z.int(),
        subject: z.string().nullable(),
        tracker: z.string().nullable(),
        status: z.string().nullable(),
        is_closed: z.boolean().nullable(),
      }),
    )
    .describe("Direct subtasks."),
  attachments: z.array(
    z.object({
      id: z.int(),
      filename: z.string(),
      filesize: z.int(),
      content_type: z.string().nullable(),
      description: z.string().nullable(),
      author: z.string().nullable(),
      created_on: z.string(),
    }),
  ),
  watchers: z
    .array(z.object({ id: z.int(), name: z.string() }))
    .optional()
    .describe("Absent when the key may not see watchers."),
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
                  `In place of from and to for a description on several lines or over ${LINE_CAP} characters, or a custom field on several lines. The changed lines, - old and + new, with one unchanged line around each run. A line or diff cut short ends with a clip marker.`,
                ),
            }),
          ]),
        ),
      }),
    )
    .describe(
      "The newest journals and those in full, oldest first, with ids in changes resolved to names.",
    ),
  journals_total: z.int(),
  journals_omitted: z.int().describe("Journals left out."),
});

type IssueContext = z.output<typeof IssueContextSchema>;

export const issueContextTool: ToolSpec = defineTool({
  name: "issue_context",
  title: "Get issue context",
  description: [
    "Everything needed to work on one issue in one call: the issue with its full description, the statuses it can move to next, relations read from this issue, subtasks with their status, attachment metadata, watchers, and the newest journals as readable diffs with ids resolved to names.",
    "Call it first when asked to work on, triage or summarize an issue, instead of issues_get.",
    `Descriptions and notes longer than ${TEXT_CAP} characters are clipped with a marker that names the call returning them whole.`,
    "Returns {issue, allowed_statuses, relations, children, attachments, watchers, journals, journals_total, journals_omitted}.",
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
        `How many of the newest journals to include, ${DEFAULT_JOURNALS} by default, at most ${MAX_JOURNALS}. 0 leaves them out.`,
      ),
    full: z
      .array(z.int().positive())
      .default([])
      .describe("Ids of journals to return unclipped, even if older than the newest `journals`."),
  }),
  output: IssueContextSchema,
  ...BY_METHOD.GET,
  run: async (rm, { issue_id, journals, full }, { lookups }) => ({
    structured: await issueContext(rm, lookups, issue_id, journals, full),
  }),
});

async function issueContext(
  rm: Client,
  lookups: Lookups,
  issue_id: number,
  journals: number,
  full: readonly number[],
): Promise<IssueContext> {
  const issue = await rm.issues.get({ issue_id, include: [...INCLUDES] });
  const all = issue.journals ?? [];
  const whole = new Set(full);
  const unknown = [...whole].filter((id) => !all.some((journal) => journal.id === id));
  if (unknown.length > 0) {
    throw new ToolError(
      `Issue ${issue.id} has no journal ${unknown.join(" or ")} that this API key can read. Journal ids come from journals[].id or a clip marker.`,
      { kind: "unknown_journal", issue_id: issue.id, journal_ids: unknown },
    );
  }
  const shown = all.filter(
    (journal, index) => index >= all.length - journals || whole.has(journal.id),
  );
  const [names, children] = await Promise.all([
    resolveNames(rm, lookups, issue, shown),
    childrenOf(rm, issue),
  ]);
  const customFields = new Map((issue.custom_fields ?? []).map((cf) => [String(cf.id), cf.name]));
  const fields = Object.fromEntries(
    Object.entries(issue).filter(([key]) => !(INCLUDES as readonly string[]).includes(key)),
  );
  const { description } = issue;
  return {
    issue: {
      ...fields,
      id: issue.id,
      subject: issue.subject,
      description:
        description === null
          ? null
          : clip(description, TEXT_CAP, `Call issues_get with issue_id ${issue.id} for all of it.`),
    },
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
    journals: shown.map((journal) => {
      const cut: Clip = whole.has(journal.id) ? (text) => text : clipJournal(issue.id, journal.id);
      return {
        id: journal.id,
        note: all.indexOf(journal) + 1,
        user: journal.user?.name ?? null,
        created_on: journal.created_on,
        notes: cut(journal.notes ?? "", TEXT_CAP),
        private_notes: journal.private_notes ?? false,
        changes: changesOf(journal, names, customFields, cut),
      };
    }),
    journals_total: all.length,
    journals_omitted: all.length - shown.length,
  };
}

function relationFrom(
  issueId: number,
  { id, issue_id: from, issue_to_id: to, relation_type: type, delay }: Relation,
): IssueContext["relations"] {
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
async function childrenOf(rm: Client, issue: Issue): Promise<IssueContext["children"]> {
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
  return markdown(await issueContext(rm, lookups, issue_id, DEFAULT_JOURNALS, []));
}

function markdown(context: IssueContext): string {
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
        `The newest ${journals.length} of ${context.journals_total}, oldest first; ${context.journals_omitted} older left out. The issue_context tool takes up to 100, and issues_get with include ["journals"] returns all.`,
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
