// One tool per SDK catalog entry, built from the entry's data at startup: names, annotations,
// descriptions, the paged input and output shapes, and filter descriptions in the SDK's grammar.

import { VERSIONS } from "@redmine-ts/sdk";
import type { Listing } from "@redmine-ts/sdk";
import { catalog } from "@redmine-ts/sdk/catalog";
import type { CatalogEntry, JsonSchema } from "@redmine-ts/sdk/catalog";
import { withoutApiKeys } from "./api-keys.ts";
import { portable } from "./portable.ts";
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
  role_ids: "roles_list",
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
  raw: '{raw: "..."} sent to Redmine verbatim, such as a relative date',
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

export const catalogTools: readonly ToolSpec[] = catalog
  .filter((entry) => !HAND_WRITTEN.has(entry.id))
  .map((entry) => ({ ...entry, output: withoutApiKeys(entry.output) }))
  .map(toolFor)
  .map((tool) => ({
    ...tool,
    inputSchema: portable(tool.inputSchema),
    outputSchema: portable(tool.outputSchema),
  }));

function toolFor(entry: CatalogEntry): ToolSpec {
  const { tier, annotations } = BY_METHOD[entry.method];
  const call = (rm: Client, input: Record<string, unknown>): unknown => {
    // The client is assembled from the same catalog, so every entry names a method that exists.
    const namespaces = rm as unknown as Record<string, Record<string, Method>>;
    return namespaces[entry.namespace]![entry.verb]!(input);
  };
  const common = {
    name: toolName(entry),
    title: entry.title,
    description: describeTool(entry),
    annotations,
    tier,
    since: entry.since,
    until: entry.until,
  };
  const { output } = entry;
  switch (output.kind) {
    case "list":
      return {
        ...common,
        inputSchema: pagedInput(entry.inputSchema),
        outputSchema: pageOutput(output.schema),
        run: async (rm, input) => ({ structured: await listPage(call, rm, input) }),
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
 * from the forms the filter's schema accepts.
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
  const [summary = "", ...lines] = (filter.description ?? "").split("\n");
  const operators = new Set(
    [...(lines.find((line) => line.startsWith("Operators:")) ?? "").matchAll(/`([^`]+)`/g)].map(
      (match) => match[1],
    ),
  );
  const accepted = new Set((filter.anyOf ?? []).flatMap((form) => form.required ?? []));
  const forms = Object.entries(FORMS)
    .filter(([name]) => accepted.has(name))
    .map(([, form]) => form);
  const values = lines.filter((line) => /^(Special values|Values):/.test(line));
  // The SDK compiles these words to Redmine's status operators `o`, `c` and `*`.
  const words =
    operators.has("o") && operators.has("c")
      ? ['Also "open", "closed"' + (operators.has("*") ? ', "any".' : ".")]
      : [];
  return [
    summary,
    `Accepts a value, an array meaning any of them, or one of ${forms.join(", ")}.`,
    ...words,
    ...values,
  ].join(" ");
}

function describeTool(entry: CatalogEntry): string {
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
    .map((key) => `${key} from ${ID_SOURCES[key]}`);
  const version = [
    entry.since !== VERSIONS[0] ? `Needs Redmine ${entry.since} or newer.` : "",
    entry.until !== null ? `Removed after Redmine ${entry.until}.` : "",
  ];
  return [
    `${entry.title}.`,
    clip(entry.description, 300),
    effect,
    returns,
    ids.length > 0 ? `Ids, not names: ${ids.join(", ")}.` : "",
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
