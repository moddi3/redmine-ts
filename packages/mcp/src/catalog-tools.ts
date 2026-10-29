// One tool per SDK catalog entry, built from the entry's data at startup: names, annotations,
// descriptions, the paged input and output shapes, and filter descriptions in the SDK's grammar.

import { VERSIONS } from "@redmine-ts/sdk";
import type { Listing } from "@redmine-ts/sdk";
import { catalog } from "@redmine-ts/sdk/catalog";
import type { CatalogEntry, JsonSchema } from "@redmine-ts/sdk/catalog";
import { portable } from "./portable.ts";
import { fitPage } from "./result-budget.ts";
import type { Annotations, Client, Schema, Tier, ToolSpec } from "./tools.ts";

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

const FORMS: Readonly<Record<string, string>> = {
  not: "{not: value or array}",
  gte: "{gte: value}",
  lte: "{lte: value}",
  between: "{between: [from, to]}",
  contains: '{contains: "text"}',
  not_contains: '{not_contains: "text"}',
  starts_with: '{starts_with: "text"}',
  ends_with: '{ends_with: "text"}',
  any: "{any: true} for any value set",
  none: "{none: true} for no value",
  raw: '{raw: "..."} in Redmine\'s own syntax, such as a relative date',
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
      outputSchema: portable(tool.outputSchema),
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
    case "list":
      return {
        ...common,
        inputSchema: pagedInput(entry.inputSchema),
        outputSchema: pageOutput(output.schema),
        budgeted: true,
        // Measured once the items are shaped, as the page is sent.
        run: async (rm, input, { budget }) => ({
          structured: fitPage(await listPage(call, rm, input), budget),
        }),
      };
    case "item":
      return {
        ...common,
        inputSchema: entry.inputSchema,
        outputSchema: output.optional
          ? { $schema: DRAFT, type: "object", anyOf: [withoutDraft(output.schema), OK] }
          : output.schema,
        run: async (rm, input) => ({
          structured: ((await call(rm, input)) as Record<string, unknown> | undefined) ?? {
            ok: true,
          },
        }),
      };
    case "empty":
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

async function listPage(
  call: (rm: Client, input: Record<string, unknown>) => unknown,
  rm: Client,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const {
    limit = DEFAULT_LIMIT,
    offset = 0,
    detailed = false,
    ...rest
  } = input as { limit?: number; offset?: number; detailed?: boolean };
  const listing = call(rm, rest) as Listing<Record<string, unknown>>;
  const page = await listing.page({ offset, limit });
  // Lists Redmine does not page (statuses, trackers) come back whole, so they are paged here.
  const paged = page.total_count !== undefined;
  const items = paged ? page.items : page.items.slice(offset, offset + limit);
  const total = page.total_count ?? page.items.length;
  const end = offset + items.length;
  return {
    items: detailed ? items : items.map(concise),
    total_count: total,
    offset,
    limit,
    next_offset: items.length > 0 && end < total ? end : null,
  };
}

function concise(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([key]) => !HEAVY_KEYS.includes(key)));
}

function pagedInput(schema: JsonSchema): JsonSchema {
  const described = describeFilters(schema);
  const kept = Object.entries(described.properties ?? {}).filter(
    ([key]) => key !== "pageSize" && key !== "paging",
  );
  return { ...described, properties: { ...Object.fromEntries(kept), ...PAGING } };
}

function pageOutput(item: JsonSchema): JsonSchema {
  const count: JsonSchema = { type: "integer", minimum: 0 };
  return {
    $schema: DRAFT,
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          ...withoutDraft(item),
          required: (item.required ?? []).filter((key) => !HEAVY_KEYS.includes(key)),
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
 * The catalog copies each filter's description from the spec, which documents Redmine's wire syntax
 * (`!3`, `>=2024-01-01`). Inputs take the SDK's object grammar instead, so the description is rebuilt
 * from the forms the filter's schema accepts. A call that a filter refuses gets this description back.
 */
function describeFilters(schema: JsonSchema): JsonSchema {
  const where = schema.properties?.where;
  if (where === undefined) return schema;
  const rewrite = (
    filters: Readonly<Record<string, JsonSchema>> | undefined,
  ): Record<string, JsonSchema> | undefined =>
    filters &&
    Object.fromEntries(
      Object.entries(filters).map(([key, filter]) => [
        key,
        { ...filter, description: describeFilter(filter) },
      ]),
    );
  const patternProperties = rewrite(where.patternProperties);
  return {
    ...schema,
    properties: {
      ...schema.properties,
      where: {
        ...where,
        description:
          "Filters keyed by Redmine filter name. Each filter's description lists the forms it accepts. Unknown filters and operators are refused before anything is sent.",
        properties: rewrite(where.properties) ?? {},
        ...(patternProperties ? { patternProperties } : {}),
      },
    },
  };
}

function describeFilter(filter: JsonSchema): string {
  const { summary, words, values } = specOf(filter);
  const forms = operatorsOf(filter).map((name) => FORMS[name]);
  return [
    summary,
    `Accepts a value, an array meaning any of them, or one of ${forms.join(", ")}.`,
    ...(words.length > 0 ? [`Also ${words.map((word) => `"${word}"`).join(", ")}.`] : []),
    ...values,
  ].join(" ");
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
  const rows = filters.map(([name, filter]) => {
    const spec = specOf(filter);
    const kind = kindOf(name, spec);
    const operators = operatorsOf(filter).filter((operator) => operator !== "raw");
    return { kind, operators: operators.join(", "), line: filterLine(name, kind, spec) };
  });
  const sections = Map.groupBy(rows, (row) => row.operators);
  const used = new Set([...sections.keys()].flatMap((operators) => operators.split(", ")));
  const forms = Object.keys(FORMS).filter((name) => used.has(name));
  const legend = [
    "Filters keyed by Redmine filter name. A value or an array means equals any of them.",
    `An object with one operator picks another comparison: ${forms.map((name) => FORMS[name]).join(", ")}.`,
    `Every filter also takes ${FORMS.raw}.`,
    ...(rows.some((row) => row.kind === "date") ? ["Dates are YYYY-MM-DD."] : []),
    "Unknown filters and operators are refused before anything is sent.",
    "Each line below is name | value | what it filters, under the operators the filter takes.",
  ];
  const table = [...sections].flatMap(([operators, section]) => [
    `Takes ${operators}:`,
    ...section.map((row) => row.line),
  ]);
  return {
    ...schema,
    properties: {
      ...schema.properties,
      where: {
        description: [legend.join(" "), ...table].join("\n"),
        type: "object",
        additionalProperties: CONDITION,
      },
    },
  };
}

/** `name | value | what it filters`, without the last cells when they are empty. */
function filterLine(name: string, kind: string | undefined, spec: Spec): string {
  const { summary, words, values } = spec;
  const value = [
    ...(kind === undefined ? [] : [kind]),
    ...words.map((word) => `\`${word}\``),
    // "Values: `1` (active), `5` (closed)" becomes "`1` for active, `5` for closed".
    ...values.map((line) =>
      line.replace(/^[\w ]+: /, "").replaceAll(/(`[^`]+`) \(([^)]+)\)/g, "$1 for $2"),
    ),
  ];
  const about = summary
    .replace(/^Filter by /, "")
    .replace(/ Undocumented$/, "")
    .replace(/\.$/, "");
  // "Filter by tracker." says no more than tracker_id does.
  const spoken = name.replaceAll(/[_.]/g, " ");
  const repeats = [spoken, spoken.replace(/ id$/, "")].includes(about.toLowerCase());
  return [name, value.join(", "), repeats ? "" : about].join(" | ").replace(/( \| )+$/, "");
}

/**
 * What a filter's value is, read from the wire operators the spec documents for it: date operators
 * such as `t` (today), comparisons, or text matches. A filter whose spec lists its values has no kind,
 * and one with special values such as `me` takes ids besides them, updated_by included.
 */
function kindOf(name: string, { codes, values }: Spec): string | undefined {
  const id = /(^|_)id$/.test(name);
  if (values.some((line) => line.startsWith("Values:"))) return undefined;
  if (values.some((line) => line.startsWith("Special values:"))) return "id";
  if (codes.has("t")) return "date";
  if (codes.has(">=")) return id ? "id" : "number";
  if (codes.has("~") && !id) return "text";
  return id ? "id" : undefined;
}

/** The operator objects a filter's schema accepts, in the SDK's order. */
function operatorsOf(filter: JsonSchema): string[] {
  const accepted = new Set((filter.anyOf ?? []).flatMap((form) => form.required ?? []));
  return Object.keys(FORMS).filter((name) => accepted.has(name));
}

/** What a filter's description from the spec says, read once for its line in the table. */
interface Spec {
  readonly summary: string;
  /** The wire operators of its `Operators:` line, such as `!`, `>=` and `t`. */
  readonly codes: ReadonlySet<string>;
  /** Words the SDK compiles to operators, such as status_id's "open". */
  readonly words: readonly string[];
  /** Its `Values:` and `Special values:` lines. */
  readonly values: readonly string[];
}

/**
 * A filter's description from the spec: a summary line, then lines such as `Operators:` and `Values:`
 * that name the wire operators in backticks.
 */
function specOf(filter: JsonSchema): Spec {
  const [summary = "", ...lines] = (filter.description ?? "").split("\n");
  const codes = new Set(
    [...(lines.find((line) => line.startsWith("Operators:")) ?? "").matchAll(/`([^`]+)`/g)].map(
      (match) => match[1]!,
    ),
  );
  // The SDK compiles these words to Redmine's status operators `o`, `c` and `*`.
  const words =
    codes.has("o") && codes.has("c") ? ["open", "closed", ...(codes.has("*") ? ["any"] : [])] : [];
  const values = lines.filter((line) => /^(Special values|Values):/.test(line));
  return { summary, codes, words, values };
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
      case "list":
        return `Returns one page, {items, total_count, offset, limit, next_offset}. Call again with offset = next_offset until it is null. Items omit ${HEAVY_KEYS.join(", ")} unless detailed is true. Item fields: ${fields(output.schema, HEAVY_KEYS)}.`;
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
    output.kind === "list"
      ? "A page stops before limit at the server's result budget, with next_offset at the first item left out."
      : "",
    ids.length > 0 ? `Ids, not names: ${ids.join(", ")}.` : "",
    entry.id === "createMembership"
      ? "people_find searches only a project's members and an issue's people, so it does not find a user who is not a member yet."
      : "",
    entry.id === "getIssue"
      ? "include journals returns every journal in one result, which may pass the client's limit: for a long history, issue_context pages through them."
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
