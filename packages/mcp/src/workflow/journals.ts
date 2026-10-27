// Journal details as a readable diff. Redmine sends each change as {property, name, old_value,
// new_value} with ids in strings, such as status_id from "1" to "2". Each becomes {field, from, to}
// with a label and names, fetching only the lookups the details reference; an id no lookup resolves
// stays raw. A description or custom field value on several lines or longer than one diff line becomes
// {field, diff} instead, where Redmine's own history shows a diff.

import type { Issue } from "@redmine-ts/sdk";
import type { Client } from "../tools.ts";
import { CHANGE_CAP, clip, LINE_CAP } from "./clip.ts";
import { bestEffort } from "./define.ts";
import { lineDiff } from "./diff.ts";
import { projectMembers } from "./lookups.ts";
import type { Lookups } from "./lookups.ts";

export type Journal = NonNullable<Issue["journals"]>[number];
type Detail = Journal["details"][number];

export type Change =
  | { field: string; from: string | null; to: string | null }
  | { field: string; diff: string };

/** What an attribute's id points at. */
export type Kind = "status" | "tracker" | "priority" | "user" | "category" | "version" | "project";

/** Known names by kind, keyed by id as Redmine writes it in a detail. */
export type Names = ReadonlyMap<Kind, ReadonlyMap<string, string>>;

/** Redmine's own labels for the issue attributes a journal records. */
const ATTRIBUTES: Readonly<Record<string, { label: string; kind?: Kind }>> = {
  project_id: { label: "Project", kind: "project" },
  tracker_id: { label: "Tracker", kind: "tracker" },
  status_id: { label: "Status", kind: "status" },
  priority_id: { label: "Priority", kind: "priority" },
  assigned_to_id: { label: "Assignee", kind: "user" },
  author_id: { label: "Author", kind: "user" },
  category_id: { label: "Category", kind: "category" },
  fixed_version_id: { label: "Target version", kind: "version" },
  parent_id: { label: "Parent task" },
  child_id: { label: "Subtask" },
  subject: { label: "Subject" },
  description: { label: "Description" },
  start_date: { label: "Start date" },
  due_date: { label: "Due date" },
  done_ratio: { label: "% Done" },
  estimated_hours: { label: "Estimated time" },
  is_private: { label: "Private" },
};

/** A relation type as it reads from the issue it is recorded on: `blocked` is "blocked by". */
export const RELATION_PHRASES: Readonly<Record<string, string>> = {
  relates: "related to",
  duplicates: "duplicates",
  duplicated: "duplicated by",
  blocks: "blocks",
  blocked: "blocked by",
  precedes: "precedes",
  follows: "follows",
  copied_to: "copied to",
  copied_from: "copied from",
};

/** The ids each kind must resolve to render these journals. */
function referencedIds(journals: readonly Journal[]): Map<Kind, Set<string>> {
  const ids = new Map<Kind, Set<string>>();
  for (const { details } of journals) {
    for (const { property, name, old_value, new_value } of details) {
      const kind = property === "attr" ? ATTRIBUTES[name]?.kind : undefined;
      if (kind === undefined) continue;
      const set = ids.get(kind) ?? new Set();
      for (const value of [old_value, new_value]) if (value) set.add(value);
      ids.set(kind, set);
    }
  }
  return ids;
}

/**
 * `customFields` names the issue's custom fields by id. `rest` tells an agent where to read a clipped
 * value in full.
 */
export function changesOf(
  journal: Journal,
  names: Names,
  customFields: ReadonlyMap<string, string>,
  rest: string,
): Change[] {
  return journal.details.map((detail) => change(detail, names, customFields, rest));
}

function change(
  detail: Detail,
  names: Names,
  customFields: ReadonlyMap<string, string>,
  rest: string,
): Change {
  const field = fieldLabel(detail, customFields);
  const { old_value: from, new_value: to } = detail;
  if (isText(detail) && (isLong(from) || isLong(to))) {
    return { field, diff: clip(lineDiff(from ?? "", to ?? ""), CHANGE_CAP, rest) };
  }
  const render = renderer(detail, names);
  const show = (value: string | null): string | null =>
    value === null || value === "" ? value : render(value);
  return { field, from: show(from), to: show(to) };
}

/** The fields that can hold long text. A subject or a file name is at most 255 characters and shows whole. */
function isText({ property, name }: Detail): boolean {
  return property === "cf" || (property === "attr" && name === "description");
}

function isLong(value: string | null): boolean {
  return value !== null && (value.length > LINE_CAP || /[\r\n]/.test(value));
}

function fieldLabel({ property, name }: Detail, customFields: ReadonlyMap<string, string>): string {
  switch (property) {
    case "attr":
      return ATTRIBUTES[name]?.label ?? name;
    case "cf":
      return customFields.get(name) ?? `Custom field ${name}`;
    case "attachment":
      return "File";
    case "relation":
      return "Relation";
    default:
      return `${property} ${name}`;
  }
}

function renderer({ property, name }: Detail, names: Names): (value: string) => string {
  // The value is the other issue, and `name` is the type as it reads from this one.
  if (property === "relation") return (id) => `${RELATION_PHRASES[name] ?? name} #${id}`;
  // A cf value is the stored value as is, an attachment's is its filename.
  if (property !== "attr") return (value) => value;
  if (name === "parent_id" || name === "child_id") return (id) => `#${id}`;
  const kind = ATTRIBUTES[name]?.kind;
  const known = kind === undefined ? undefined : names.get(kind);
  return (value) => known?.get(value) ?? value;
}

type Named = { id?: number; name?: string } | undefined;

/**
 * Names for the ids the journals reference. The issue already names its own status, tracker, people
 * and so on, so a lookup is fetched only for ids those leave unresolved, and a failed one is skipped.
 */
export async function resolveNames(
  rm: Client,
  lookups: Lookups,
  issue: Issue,
  journals: readonly Journal[],
): Promise<Names> {
  const seeds: Record<Kind, readonly Named[]> = {
    status: [issue.status, ...(issue.allowed_statuses ?? [])],
    tracker: [issue.tracker],
    priority: [issue.priority],
    user: [
      issue.author,
      issue.assigned_to,
      ...(issue.watchers ?? []),
      ...(issue.journals ?? []).map((journal) => journal.user),
    ],
    category: [issue.category],
    version: [issue.fixed_version],
    project: [issue.project],
  };
  const names = new Map<Kind, Map<string, string>>();
  await Promise.all(
    [...referencedIds(journals)].map(async ([kind, ids]) => {
      const known = new Map<string, string>();
      const add = (refs: readonly Named[]): void => {
        for (const ref of refs) {
          if (ref?.id !== undefined && ref.name !== undefined) known.set(String(ref.id), ref.name);
        }
      };
      add(seeds[kind]);
      const missing = [...ids].filter((id) => !known.has(id));
      if (missing.length > 0) {
        add(await bestEffort(() => lookup(rm, lookups, issue, kind, missing), []));
      }
      names.set(kind, known);
    }),
  );
  return names;
}

async function lookup(
  rm: Client,
  lookups: Lookups,
  issue: Issue,
  kind: Kind,
  missing: readonly string[],
): Promise<readonly Named[]> {
  const project_id = issue.project?.id;
  switch (kind) {
    case "status":
      return lookups.statuses();
    case "tracker":
      return lookups.trackers();
    case "priority":
      return lookups.priorities();
    case "project":
      return Promise.all(
        missing.map((id) =>
          bestEffort(() => rm.projects.get({ project_id: Number(id) }), undefined),
        ),
      );
  }
  if (project_id === undefined) return [];
  switch (kind) {
    case "user": {
      // In a project larger than the members read, the rest stay ids.
      const { members } = await projectMembers(rm, project_id);
      return members.map((member) => member.user ?? member.group);
    }
    case "category":
      return rm.issueCategories.list({ project_id }).all();
    case "version":
      return rm.versions.list({ project_id }).all();
  }
}
