// reference_data: the names an agent maps to ids before it writes, in one call instead of six list
// tools. The global lists come from the server's lookups; a project's lists are read fresh.

import { RedmineError } from "@redmine-ts/sdk";
import type { CustomField } from "@redmine-ts/sdk";
import { z } from "zod";
import { BY_METHOD } from "../catalog-tools.ts";
import type { Client, ToolSpec } from "../tools.ts";
import { defineTool } from "./define.ts";
import { LOOKUP_TTL_MS, MAX_MEMBERS, projectMembers } from "./lookups.ts";
import type { Lookups } from "./lookups.ts";

const IdName = z.object({ id: z.int(), name: z.string() });

const ReferenceDataSchema = z.object({
  statuses: z.array(z.object({ id: z.int(), name: z.string(), is_closed: z.boolean() })),
  trackers: z.array(z.object({ id: z.int(), name: z.string(), default_status: IdName.nullable() })),
  priorities: z.array(z.object({ id: z.int(), name: z.string(), is_default: z.boolean() })),
  time_entry_activities: z.array(
    z.object({ id: z.int(), name: z.string(), is_default: z.boolean(), active: z.boolean() }),
  ),
  current_user: z
    .object({ id: z.int(), login: z.string(), name: z.string(), admin: z.boolean() })
    .describe("The user this API key acts as."),
  custom_fields: z
    .array(
      z.object({
        id: z.int(),
        name: z.string(),
        customized_type: z.string().nullable(),
        field_format: z.string(),
        is_required: z.boolean(),
        multiple: z.boolean(),
        possible_values: z.array(z.string()).optional(),
      }),
    )
    .nullable()
    .describe("Every custom field definition, or null when the key is not an admin's."),
  custom_fields_note: z.string().optional().describe("Why custom_fields is null."),
  project: z
    .object({
      id: z.int(),
      identifier: z.string(),
      name: z.string(),
      trackers: z.array(IdName),
      issue_categories: z.array(IdName),
      versions: z.array(z.object({ id: z.int(), name: z.string(), status: z.string() })).nullable(),
      members: z
        .array(
          z.object({
            type: z.enum(["user", "group"]),
            id: z.int(),
            name: z.string(),
            roles: z.array(z.string()),
          }),
        )
        .nullable(),
      issue_custom_fields: z.array(IdName),
      enabled_modules: z.array(z.string()),
      unavailable: z
        .array(z.string())
        .optional()
        .describe(
          `What the key could not read, and why. A list it cannot read is null; members stop at ${MAX_MEMBERS}.`,
        ),
    })
    .optional()
    .describe("Present with project_id."),
});

export const referenceDataTool: ToolSpec = defineTool({
  name: "reference_data",
  title: "Get reference data",
  description: [
    "Maps names to ids in one call: issue statuses with is_closed, trackers with their default status, issue priorities, time entry activities, the user the API key acts as, and every custom field definition when the key is an admin's.",
    "With project_id, also that project's trackers, issue categories, versions, members with their roles, issue custom fields and enabled modules.",
    "Call it once before creating or updating issues, instead of the separate list tools.",
    `The global lists are cached for ${LOOKUP_TTL_MS / 60_000} minutes.`,
    "Returns {statuses, trackers, priorities, time_entry_activities, current_user, custom_fields, custom_fields_note, project}.",
  ].join(" "),
  input: z.strictObject({
    project_id: z
      .union([z.int().positive(), z.string().min(1)])
      .optional()
      .describe('The project\'s id or identifier, such as 3 or "web".'),
  }),
  output: ReferenceDataSchema,
  ...BY_METHOD.GET,
  run: async (rm, { project_id }, { lookups }) => {
    const [statuses, trackers, priorities, activities, user] = await Promise.all([
      lookups.statuses(),
      lookups.trackers(),
      lookups.priorities(),
      lookups.activities(),
      lookups.currentUser(),
    ]);
    const admin = user.admin ?? false;
    const fields = await customFields(lookups, admin);
    return {
      structured: {
        statuses: statuses.map(({ id, name, is_closed }) => ({ id, name, is_closed })),
        trackers: trackers.map(({ id, name, default_status }) => ({
          id,
          name,
          default_status: default_status
            ? { id: default_status.id, name: default_status.name }
            : null,
        })),
        priorities: priorities.map(({ id, name, is_default }) => ({ id, name, is_default })),
        time_entry_activities: activities.map(({ id, name, is_default, active }) => ({
          id,
          name,
          is_default,
          active,
        })),
        current_user: {
          id: user.id,
          login: user.login,
          name: `${user.firstname} ${user.lastname}`.trim(),
          admin,
        },
        ...fields,
        ...(project_id === undefined ? {} : { project: await projectData(rm, project_id) }),
      },
    };
  },
});

type Output = z.output<typeof ReferenceDataSchema>;
type Member = NonNullable<NonNullable<Output["project"]>["members"]>[number];

async function customFields(
  lookups: Lookups,
  admin: boolean,
): Promise<Pick<Output, "custom_fields" | "custom_fields_note">> {
  if (!admin) {
    return {
      custom_fields: null,
      custom_fields_note:
        "Custom field definitions need an admin API key. With project_id, project.issue_custom_fields names the project's issue custom fields.",
    };
  }
  try {
    return { custom_fields: (await lookups.customFields()).map(customField) };
  } catch (error) {
    if (!(error instanceof RedmineError)) throw error;
    return { custom_fields: null, custom_fields_note: `Redmine refused them: ${error.message}` };
  }
}

function customField(field: CustomField): NonNullable<Output["custom_fields"]>[number] {
  const values = field.possible_values?.flatMap(({ value }) =>
    value === undefined ? [] : [value],
  );
  return {
    id: field.id,
    name: field.name,
    customized_type: field.customized_type ?? null,
    field_format: field.field_format,
    is_required: field.is_required,
    multiple: field.multiple,
    ...(values === undefined ? {} : { possible_values: values }),
  };
}

async function projectData(
  rm: Client,
  project_id: number | string,
): Promise<NonNullable<Output["project"]>> {
  const project = await rm.projects.get({
    project_id,
    include: ["trackers", "issue_categories", "enabled_modules", "issue_custom_fields"],
  });
  const unavailable: string[] = [];
  // Reading members or versions can need permissions viewing the project does not.
  const optional = async <T>(what: string, load: () => Promise<T>): Promise<T | null> => {
    try {
      return await load();
    } catch (error) {
      if (!(error instanceof RedmineError)) throw error;
      unavailable.push(`${what}: ${error.message}`);
      return null;
    }
  };
  const [versions, members] = await Promise.all([
    optional("versions", async () =>
      (await rm.versions.list({ project_id: project.id }).all()).map(({ id, name, status }) => ({
        id,
        name,
        status,
      })),
    ),
    optional("members", async () => {
      const { members, more } = await projectMembers(rm, project.id);
      if (more) {
        unavailable.push(
          `members: only the first ${MAX_MEMBERS}; memberships_list pages through all of them`,
        );
      }
      return members.flatMap(({ user, group, roles }): Member[] => {
        const names = roles.map((role) => role.name);
        if (user) return [{ type: "user", id: user.id, name: user.name, roles: names }];
        if (group) return [{ type: "group", id: group.id, name: group.name, roles: names }];
        return [];
      });
    }),
  ]);
  const pairs = (list: readonly { id: number; name: string }[] | undefined) =>
    (list ?? []).map(({ id, name }) => ({ id, name }));
  return {
    id: project.id,
    identifier: project.identifier,
    name: project.name,
    trackers: pairs(project.trackers),
    issue_categories: pairs(project.issue_categories),
    versions,
    members,
    issue_custom_fields: pairs(project.issue_custom_fields),
    enabled_modules: (project.enabled_modules ?? []).map(({ name }) => name),
    ...(unavailable.length === 0 ? {} : { unavailable }),
  };
}
