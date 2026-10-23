// issues_transition: rm.issues.transition with the status given by id or by name, and a refusal that
// names the statuses the workflow allows, so the agent can pick one without another call.

import { RedmineError } from "@redmine-ts/sdk";
import type { Access, IssueStatusSummary, RedmineErrorData } from "@redmine-ts/sdk";
import { catalog } from "@redmine-ts/sdk/catalog";
import { z } from "zod";
import { BY_METHOD } from "../catalog-tools.ts";
import type { Client, ToolSpec } from "../tools.ts";
import { bestEffort, defineTool, ToolError } from "./define.ts";
import type { Lookups } from "./lookups.ts";

// The SDK's catalog describes the method this tool wraps.
const entry = catalog.find((candidate) => candidate.id === "transitionIssue")!;

type Named = { id: number; name: string | null };

export function transitionTool(access: Access): ToolSpec {
  return defineTool({
    name: "issues_transition",
    title: entry.title,
    description: [
      `${entry.title}, checked against Redmine's workflow before anything is written.`,
      "status takes a status id or a status name, matched case-insensitively against the statuses the issue can move to (issue_context lists them as allowed_statuses).",
      "A status the workflow does not allow, or a name that matches none, is refused with the allowed statuses by id and name, and nothing changes.",
      "Sends no update when the issue already has the status and there are no notes.",
      "Prefer it to issues_update with status_id.",
      "Returns {ok, status: {id, name}}.",
      entry.docsUrl ? `Docs: ${entry.docsUrl}` : "",
    ]
      .filter((part) => part !== "")
      .join(" "),
    input: z.strictObject({
      issue_id: z.int().positive(),
      status: z
        .union([z.int().positive(), z.string().min(1)])
        .describe('A status id, such as 2, or a status name, such as "In Progress".'),
      notes: z.string().optional().describe("Added as a journal entry with the change."),
    }),
    output: z.object({
      ok: z.literal(true),
      status: z.object({ id: z.int(), name: z.string().nullable() }),
    }),
    ...BY_METHOD.PUT,
    run: async (rm, { issue_id, status, notes }, { lookups }) => {
      const target =
        typeof status === "number"
          ? { id: status, name: null }
          : await statusNamed(rm, access, issue_id, status);
      try {
        await rm.issues.transition({
          issue_id,
          status_id: target.id,
          ...(notes === undefined ? {} : { notes }),
        });
      } catch (error) {
        if (RedmineError.is(error, "transition_not_allowed")) {
          throw await notAllowed(lookups, issue_id, error);
        }
        throw error;
      }
      const name = target.name ?? (await nameOf(lookups, target.id));
      return { structured: { ok: true as const, status: { id: target.id, name } } };
    },
  });
}

async function statusNamed(
  rm: Client,
  access: Access,
  issue_id: number,
  wanted: string,
): Promise<IssueStatusSummary> {
  // Matching reads the issue first, so refuse what the SDK would refuse before that read goes out.
  // read-only is the one mode that refuses PUT.
  if (access === "read-only") {
    throw new RedmineError(
      { kind: "access_denied", access, method: entry.method },
      { op: entry.id },
    );
  }
  const issue = await rm.issues.get({ issue_id, include: ["allowed_statuses"] });
  const allowed = issue.allowed_statuses ?? [];
  const key = wanted.trim().toLowerCase();
  const match = allowed.find((candidate) => candidate.name.toLowerCase() === key);
  if (match !== undefined) return match;
  const named = allowed.map(({ id, name }) => ({ id, name }));
  throw new ToolError(
    `No status issue ${issue_id} can move to is named "${wanted}". ${allowedText(named)} Nothing was changed.`,
    { kind: "unknown_status", status: wanted, allowed_statuses: named },
  );
}

async function notAllowed(
  lookups: Lookups,
  issue_id: number,
  error: RedmineError<Extract<RedmineErrorData, { kind: "transition_not_allowed" }>>,
): Promise<ToolError> {
  const { wanted } = error.data;
  const statuses = await bestEffort(() => lookups.statuses(), []);
  const named = (id: number): Named => ({
    id,
    name: statuses.find((status) => status.id === id)?.name ?? null,
  });
  const target = named(wanted);
  const allowed = error.data.allowed.map(named);
  return new ToolError(
    `Redmine's workflow does not let this user move issue ${issue_id} to ${target.name === null ? `status ${wanted}` : `"${target.name}" (${wanted})`}. ${allowedText(allowed)} Nothing was changed.`,
    { ...error.toJSON(), allowed_statuses: allowed },
  );
}

function allowedText(allowed: readonly Named[]): string {
  if (allowed.length === 0) return "The workflow allows this user no status change on it.";
  const each = allowed.map(({ id, name }) => (name === null ? `${id}` : `${id} "${name}"`));
  return `Allowed, by id and name: ${each.join(", ")}.`;
}

function nameOf(lookups: Lookups, id: number): Promise<string | null> {
  return bestEffort(
    async () => (await lookups.statuses()).find((status) => status.id === id)?.name ?? null,
    null,
  );
}
