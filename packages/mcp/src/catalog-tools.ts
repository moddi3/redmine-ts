// One tool per SDK catalog entry, built from the entry's data at startup: names, annotations,
// descriptions, the paged input and output shapes, and filter descriptions in the SDK's grammar.

import { VERSIONS } from "@redmine-ts/sdk";
import type { Listing } from "@redmine-ts/sdk";
import { catalog } from "@redmine-ts/sdk/catalog";
import type { CatalogEntry, JsonSchema } from "@redmine-ts/sdk/catalog";
import { roundHours } from "./hours.ts";
import { portable } from "./portable.ts";
import { fitJournals, fitPage } from "./result-budget.ts";
import type { Annotations, Client, Schema, Tier, ToolSpec } from "./tools.ts";
import { allowWarning } from "./user-text.ts";
import { AddedJournal, RETURNS_JOURNAL, writeAndFindJournal } from "./workflow/added-journal.ts";
import { invalidInput, jsonSchema } from "./workflow/define.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/** The SDK's hand-written extras. Their tools are hand-written too, because a file is not JSON. */
const HAND_WRITTEN = new Set([
  "transitionIssue",
  "uploadAttachment",
  "downloadAttachment",
  "downloadAttachmentThumbnail",
]);

/** Long, user-written fields that concise list items leave out. */
export const HEAVY_KEYS: readonly string[] = [
  "description",
  "notes",
  "text",
  "comments",
  "journals",
  "changesets",
];

/**
 * What an issues_list item carries unless the call names more in fields or passes detailed: enough to
 * pick an issue from a search. A page of 100 full items went past some clients' output limit.
 */
export const SHORT_ISSUE: readonly string[] = [
  "id",
  "project",
  "tracker",
  "status",
  "assigned_to",
  "subject",
  "updated_on",
];

/** List entries whose items are short by default, with the fields a short item carries. */
const SHORT_ITEMS: Readonly<Record<string, readonly string[]>> = { getIssues: SHORT_ISSUE };

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export const BY_METHOD: Readonly<
  Record<CatalogEntry["method"], { tier: Tier; annotations: Annotations }>
> = {
  GET: {
    tier: "read",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  POST: {
    tier: "write",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  // MCP counts an update of existing data as destructive.
  PUT: {
    tier: "write",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  PATCH: {
    tier: "write",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  DELETE: {
    tier: "delete",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
};

/**
 * Catalog entries whose Redmine action is behind `before_action :require_admin` in UsersController,
 * GroupsController, CustomFieldsController and ProjectsController on 6.1-stable and 7.0-stable, so
 * Redmine answers 403 to every other key. Each maps to what works without an admin key, or "".
 */
export const ADMIN_ONLY: Readonly<Record<string, string>> = {
  getUsers:
    "To find a user's id and login by name without one, call people_find, or memberships_list and then users_get.",
  createUser: "",
  updateUser: "my_account_update changes the key's own account.",
  deleteUser: "",
  getGroups: "memberships_list lists the groups in a project, and groups_get reads one by id.",
  createGroup: "",
  updateGroup: "",
  deleteGroup: "",
  addUserToGroup: "",
  removeUsersFromGroup: "",
  removeUserFromGroup: "",
  getCustomFields: "reference_data with project_id names the project's issue custom fields.",
  archiveProject: "",
  unarchiveProject: "",
};

/** Where an agent finds the id an input field wants. Names are tool names. */
export const ID_SOURCES: Readonly<Record<string, string>> = {
  project_id: "projects_list",
  tracker_id: "trackers_list",
  status_id: "issue_statuses_list",
  priority_id: "enumerations_list_issue_priorities",
  activity_id: "enumerations_list_time_entry_activities",
  category_id: "issue_categories_list",
  fixed_version_id: "versions_list",
  assigned_to_id: "memberships_list",
  user_id: "people_find",
  role_ids: "roles_list",
};

/**
 * Catalog entries whose user_id people_find cannot give, because it searches only a project's
 * members and an issue's people: the tools that need an admin key, and adding a member. Each maps to
 * where the id comes from instead.
 */
const USER_ID_SOURCES: Readonly<Record<string, string>> = {
  updateUser: "users_list",
  deleteUser: "users_list",
  addUserToGroup: "users_list",
  removeUserFromGroup: "users_list",
  createMembership: "users_list with an admin key",
};

/** What issues_get adds beside journals, as issue_context returns them. */
const JOURNAL_CURSOR: Readonly<Record<string, JsonSchema>> = {
  journals_omitted: {
    type: "integer",
    description: "With journals: the older journals left out to fit the result budget.",
  },
  journals_before: {
    type: ["integer", "null"],
    description:
      "With journals: pass to issue_context as journals_before for the journals left out. null when none is.",
  },
};

const OK: JsonSchema = {
  type: "object",
  properties: { ok: { const: true } },
  required: ["ok"],
  additionalProperties: false,
};

const PAGING: Readonly<Record<string, Schema>> = {
  limit: {
    type: "integer",
    minimum: 1,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
    description: `Items per page, ${DEFAULT_LIMIT} by default, at most ${MAX_LIMIT}.`,
  },
  offset: {
    type: "integer",
    minimum: 0,
    default: 0,
    description: "Items to skip. Pass the previous result's next_offset.",
  },
  detailed: {
    type: "boolean",
    default: false,
    description: `Keep ${HEAVY_KEYS.join(", ")} in each item. Off by default to keep pages short.`,
  },
};

/** PAGING for a list whose items are short by default. */
const SHORT_PAGING: Readonly<Record<string, Schema>> = {
  ...PAGING,
  detailed: {
    type: "boolean",
    default: false,
    description:
      "Return every item field, description included. Off by default to keep pages short.",
  },
  fields: {
    type: "array",
    items: { type: "string" },
    description:
      'Item fields to add to the short item, such as ["due_date", "spent_hours"]. The tool description names them.',
  },
};

type Method = (input: Record<string, unknown>) => unknown;

/**
 * The one condition tools/list shows for every filter. The strict input schema still checks each call
 * against the forms of each filter.
 */
const CONDITION: JsonSchema = {
  anyOf: [
    { type: ["string", "number"] },
    { type: "array", items: { type: ["string", "number"] }, minItems: 1 },
    { type: "object" },
  ],
};

export const catalogTools: readonly ToolSpec[] = catalog
  .filter((entry) => !HAND_WRITTEN.has(entry.id))
  .map((entry) => {
    const tool = toolFor(entry);
    const where = entry.inputSchema.properties?.where;
    return {
      ...tool,
      inputSchema: portable(tool.inputSchema),
      outputSchema: allowWarning(portable(tool.outputSchema)),
      ...(where === undefined
        ? {}
        : { listedInputSchema: portable(withFilterTable(tool.inputSchema, where)) }),
    };
  });

function toolFor(entry: CatalogEntry): ToolSpec {
  const { tier, annotations } = BY_METHOD[entry.method];
  const call = (rm: Client, input: Record<string, unknown>): unknown => {
    // The client is assembled from the same catalog, so every entry names a method that exists.
    const namespaces = rm as unknown as Record<string, Record<string, Method>>;
    return namespaces[entry.namespace]![entry.verb]!(input);
  };
  const adminOnly = ADMIN_ONLY[entry.id];
  const common = {
    name: toolName(entry),
    title: entry.title,
    description: describeTool(entry, adminOnly),
    annotations,
    tier,
    since: entry.since,
    until: entry.until,
    ...(adminOnly === undefined ? {} : { adminOnly }),
  };
  const { output } = entry;
  switch (output.kind) {
    case "list": {
      const short = SHORT_ITEMS[entry.id];
      const known = Object.keys(output.schema.properties ?? {});
      const includes = (entry.inputSchema.properties?.include?.items?.enum ?? []).map(String);
      return {
        ...common,
        inputSchema: pagedInput(entry.inputSchema, short),
        outputSchema: pageOutput(output.schema, short),
        budgeted: true,
        // Measured once the items are shaped, as the page is sent.
        run: async (rm, input, { budget }) => ({
          structured: fitPage(
            await listPage(call, rm, input, short && { carries: short, known, includes }),
            budget,
          ),
        }),
      };
    }
    case "item": {
      const record = async (rm: Client, input: Record<string, unknown>) =>
        roundHours(
          ((await call(rm, input)) as Record<string, unknown> | undefined) ?? { ok: true },
        );
      if (entry.id === "getIssue") {
        const { properties } = output.schema;
        return {
          ...common,
          inputSchema: entry.inputSchema,
          outputSchema: { ...output.schema, properties: { ...properties, ...JOURNAL_CURSOR } },
          budgeted: true,
          run: async (rm, input, { budget }) => ({
            structured: fitJournals(await record(rm, input), budget),
          }),
        };
      }
      return {
        ...common,
        inputSchema: entry.inputSchema,
        outputSchema: output.optional
          ? { $schema: DRAFT, type: "object", anyOf: [withoutDraft(output.schema), OK] }
          : output.schema,
        run: async (rm, input) => ({ structured: await record(rm, input) }),
      };
    }
    case "empty":
      if (entry.id === "updateIssue") {
        return {
          ...common,
          inputSchema: entry.inputSchema,
          outputSchema: {
            $schema: DRAFT,
            ...OK,
            properties: {
              ...OK.properties,
              journal: withoutDraft(jsonSchema(AddedJournal, "output")),
            },
          },
          run: async (rm, input, context) => {
            const { issue_id, notes } = input as { issue_id: number; notes?: string };
            const journal = await writeAndFindJournal(rm, context, issue_id, notes, async () =>
              call(rm, input),
            );
            return { structured: { ok: true, ...(journal === undefined ? {} : { journal }) } };
          },
        };
      }
      return {
        ...common,
        inputSchema: entry.inputSchema,
        outputSchema: { $schema: DRAFT, ...OK },
        run: async (rm, input) => {
          await call(rm, input);
          return { structured: { ok: true } };
        },
      };
    case "binary":
      throw new Error(`${entry.id} returns a file and needs a hand-written tool`);
  }
}

type Item = Record<string, unknown>;

async function listPage(
  call: (rm: Client, input: Record<string, unknown>) => unknown,
  rm: Client,
  input: Record<string, unknown>,
  /**
   * Set for a list whose items are short by default: what they carry, every item field, and the
   * fields that come only with include.
   */
  short:
    | { carries: readonly string[]; known: readonly string[]; includes: readonly string[] }
    | undefined,
): Promise<Record<string, unknown>> {
  const {
    limit = DEFAULT_LIMIT,
    offset = 0,
    detailed = false,
    fields = [],
    ...rest
  } = input as { limit?: number; offset?: number; detailed?: boolean; fields?: string[] };
  const known = short?.known ?? [];
  const unknown = [...new Set(fields.filter((name) => !known.includes(name)))];
  if (unknown.length > 0) {
    throw invalidInput(
      `unknown item ${unknown.length === 1 ? "field" : "fields"} ${unknown.map((name) => `"${name}"`).join(", ")} in fields, item fields: ${known.join(", ")}`,
    );
  }
  // include names associations, such as relations, for the items to carry. Redmine sends them only
  // when asked, so naming one in fields asks for it too.
  const asked = (rest as { include?: string[] }).include ?? [];
  const include = [
    ...new Set([...asked, ...fields.filter((name) => short?.includes.includes(name))]),
  ];
  const shown = (item: Item): Item =>
    detailed
      ? item
      : short === undefined
        ? concise(item)
        : only(item, [...short.carries, ...fields, ...include]);
  const listing = call(rm, include.length === 0 ? rest : { ...rest, include }) as Listing<Item>;
  const page = await listing.page({ offset, limit });
  // Lists Redmine does not page (statuses, trackers) come back whole, so they are paged here.
  const paged = page.total_count !== undefined;
  const items = paged ? page.items : page.items.slice(offset, offset + limit);
  const total = page.total_count ?? page.items.length;
  const end = offset + items.length;
  return {
    items: roundHours(items.map(shown)),
    total_count: total,
    offset,
    limit,
    next_offset: items.length > 0 && end < total ? end : null,
  };
}

function concise(item: Item): Item {
  return Object.fromEntries(Object.entries(item).filter(([key]) => !HEAVY_KEYS.includes(key)));
}

function only(item: Item, keys: readonly string[]): Item {
  return Object.fromEntries(Object.entries(item).filter(([key]) => keys.includes(key)));
}

function pagedInput(schema: JsonSchema, short: readonly string[] | undefined): JsonSchema {
  const kept = Object.entries(schema.properties ?? {}).filter(
    ([key]) => key !== "pageSize" && key !== "paging",
  );
  return {
    ...schema,
    properties: { ...Object.fromEntries(kept), ...(short === undefined ? PAGING : SHORT_PAGING) },
  };
}

/** An item must carry what every concise or short item carries, and may carry the rest. */
function pageOutput(item: JsonSchema, short: readonly string[] | undefined): JsonSchema {
  const count: JsonSchema = { type: "integer", minimum: 0 };
  return {
    $schema: DRAFT,
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          ...withoutDraft(item),
          required: (item.required ?? []).filter((key) =>
            short === undefined ? !HEAVY_KEYS.includes(key) : short.includes(key),
          ),
        },
      },
      total_count: count,
      offset: count,
      limit: count,
      next_offset: { type: ["integer", "null"], minimum: 0 },
    },
    required: ["items", "total_count", "offset", "limit", "next_offset"],
    additionalProperties: false,
  };
}

function withoutDraft(schema: JsonSchema): JsonSchema {
  return Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$schema"));
}

/**
 * The `where` that tools/list shows: one loose condition for every filter, and a table of the filters
 * in its description, one line per filter under the operators it takes. A schema per filter repeats
 * each form, which made `issues_list` 48K characters, and Codex strips every description from an input
 * schema over 5,000 bytes.
 */
function withFilterTable(schema: JsonSchema, where: JsonSchema): JsonSchema {
  const filters = [
    ...Object.entries(where.properties ?? {}),
    // The SDK's one pattern, `^cf_\d+$`, named as explainFilters names it.
    ...Object.entries(where.patternProperties ?? {}).map(
      ([pattern, filter]) => [pattern.slice(1, -1).replace("\\d+", "<id>"), filter] as const,
    ),
  ];
  const rows = filters.map(([name, filter]) => ({
    operators: operatorsOf(filter).join(", "),
    line: filterLine(name, filter.description ?? ""),
  }));
  const sections = Map.groupBy(rows, (row) => row.operators);
  const table = [...sections].flatMap(([operators, section]) => [
    `Takes ${operators}:`,
    ...section.map((row) => row.line),
  ]);
  const legend = `${where.description} Each line below is name | value | what it filters, under the operators the filter takes.`;
  return {
    ...schema,
    properties: {
      ...schema.properties,
      where: {
        description: [legend, ...table].join("\n"),
        type: "object",
        additionalProperties: CONDITION,
      },
    },
  };
}

/** `name | value | what it filters`, without the last cells when they are empty. */
function filterLine(name: string, description: string): string {
  const [summary = "", ...lines] = description.split("\n");
  const value = lines.find((line) => line.startsWith("Value: "))?.slice("Value: ".length, -1) ?? "";
  const [first = "", ...rest] = summary
    .replace(/^Filter by /, "")
    .replace(/ Undocumented$/, "")
    .replace(/\.$/, "")
    .split(". ");
  const spoken = name.replaceAll(/[_.]/g, " ");
  const repeats = [spoken, spoken.replace(/ id$/, "")].includes(first.toLowerCase());
  const about = (repeats ? rest : [first, ...rest]).join(". ");
  return [name, value, about].join(" | ").replace(/( \| )+$/, "");
}

/** The operator objects a filter's schema accepts, in the SDK's order. */
function operatorsOf(filter: JsonSchema): string[] {
  return (filter.anyOf ?? [])
    .flatMap((form) => form.required ?? [])
    .filter((name) => name !== "raw");
}

function describeTool(entry: CatalogEntry, adminOnly: string | undefined): string {
  const { output } = entry;
  const fields = (schema: JsonSchema, omit: readonly string[] = []): string => {
    const keys = Object.keys(schema.properties ?? {}).filter((key) => !omit.includes(key));
    return keys.length > 12
      ? `${keys.slice(0, 12).join(", ")} and ${keys.length - 12} more`
      : keys.join(", ");
  };
  const returns = ((): string => {
    switch (output.kind) {
      case "list": {
        const page =
          "Returns one page, {items, total_count, offset, limit, next_offset}. Call again with offset = next_offset until it is null.";
        const short = SHORT_ITEMS[entry.id];
        if (short === undefined) {
          return `${page} Items omit ${HEAVY_KEYS.join(", ")} unless detailed is true. Item fields: ${fields(output.schema, HEAVY_KEYS)}.`;
        }
        const more = Object.keys(output.schema.properties ?? {}).filter(
          (key) => !short.includes(key),
        );
        return `${page} Items carry only ${short.join(", ")}, and what include names. fields adds any of ${more.join(", ")}. detailed: true returns every field.`;
      }
      case "item":
        return `Returns the ${entry.method === "POST" ? "created " : ""}record: ${fields(output.schema)}.${output.optional ? " Returns {ok: true} when Redmine sends no body." : ""}`;
      case "empty":
      case "binary":
        return "Returns {ok: true}.";
    }
  })();
  const effect =
    entry.method === "DELETE"
      ? "Deletes permanently. Redmine has no undo."
      : entry.method === "PUT" || entry.method === "PATCH"
        ? "Changes only the fields you pass."
        : "";
  const inputs = {
    ...entry.inputSchema.properties,
    ...entry.inputSchema.properties?.where?.properties,
  };
  const ids = Object.keys(ID_SOURCES)
    .filter((key) => key in inputs)
    .map(
      (key) => `${key} from ${(key === "user_id" && USER_ID_SOURCES[entry.id]) || ID_SOURCES[key]}`,
    );
  const version = [
    entry.since !== VERSIONS[0] ? `Needs Redmine ${entry.since} or newer.` : "",
    entry.until !== null ? `Removed after Redmine ${entry.until}.` : "",
  ];
  return [
    `${entry.title}.`,
    adminOnly === undefined ? "" : `Needs an admin key. ${adminOnly}`.trimEnd(),
    clip(entry.description, 300),
    effect,
    returns,
    entry.id === "updateIssue" ? RETURNS_JOURNAL : "",
    output.kind === "list" ? "A large page may end before limit; follow next_offset." : "",
    ids.length > 0 ? `Ids, not names: ${ids.join(", ")}.` : "",
    entry.id === "createMembership"
      ? "people_find searches only a project's members and an issue's people, so it does not find a user who is not a member yet."
      : "",
    entry.id === "getIssue"
      ? "With include journals, the oldest journals that do not fit in the result budget are left out: journals_omitted counts them, and issue_context with journals_before returns them."
      : "",
    ...version,
    entry.docsUrl ? `Docs: ${entry.docsUrl}` : "",
  ]
    .filter((part) => part !== "")
    .join(" ");
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  return sentence > 0 ? cut.slice(0, sentence + 1) : `${cut.trimEnd()}...`;
}

export function toolName(entry: Pick<CatalogEntry, "namespace" | "verb">): string {
  return `${snake(entry.namespace)}_${snake(entry.verb)}`;
}

function snake(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
