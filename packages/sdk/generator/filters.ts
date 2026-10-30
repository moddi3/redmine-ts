// Filter prose in the `where` grammar. The spec documents each filter in Redmine's wire syntax (`!3`, `o`,
// `>=2024-01-01`), which only `raw` takes, so the catalog, the JSDoc and the MCP's table get this instead.

import { CUSTOM_FIELD } from "../src/core/listing.ts";
import type { FilterSpec } from "../src/core/op.ts";
import type { Overlay } from "./overlay.ts";

/** How each `Cond` operator object is written, its wire code, its value schema, and how prose shows it. */
export const OPERATORS: readonly { name: string; code: string; value: string; form: string }[] = [
  { name: "not", code: "!", value: "many", form: "{not: value or array}" },
  { name: "gte", code: ">=", value: "scalar", form: "{gte: value}" },
  { name: "lte", code: "<=", value: "scalar", form: "{lte: value}" },
  { name: "between", code: "><", value: "pair", form: "{between: [from, to]}" },
  { name: "contains", code: "~", value: "text", form: '{contains: "text"}' },
  { name: "not_contains", code: "!~", value: "text", form: '{not_contains: "text"}' },
  { name: "starts_with", code: "^", value: "text", form: '{starts_with: "text"}' },
  { name: "ends_with", code: "$", value: "text", form: '{ends_with: "text"}' },
  { name: "any", code: "*", value: "yes", form: "{any: true} for any value set" },
  { name: "none", code: "!*", value: "yes", form: "{none: true} for no value" },
];

const RAW = '{raw: "..."} in Redmine\'s own syntax, such as a relative date';

/** On an id filter, `contains` takes the id and matches a subtree. */
const ID_CONTAINS = "{contains: id}";

export type Kind = "id" | "date" | "number" | "text";

export interface FilterProse {
  /** What the value is, read from the operators the spec documents. Undefined when the spec lists the values. */
  kind: Kind | undefined;
  /** The spec's summary line, with the overlay's notes. */
  summary: string;
  /** What to pass, such as "id, `me` for current user". */
  value: string;
  /** Summary, value and the forms the filter takes, one sentence a line. */
  description: string;
  /** The spec's lines in Redmine's syntax, which `raw` takes. Empty when the spec has none. */
  raw: string;
}

/** The operator objects a filter takes, besides raw, in OPERATORS order. */
export function operatorsOf(spec: FilterSpec): typeof OPERATORS {
  return OPERATORS.filter((o) => spec.ops.includes(o.code));
}

export function filterProse(
  op: string,
  name: string,
  spec: FilterSpec,
  specDescription: string,
  overlay: Overlay,
  projectInPath: boolean,
): FilterProse {
  const fail = (msg: string): never => {
    throw new Error(`${op}: filter ${name}: ${msg}`);
  };
  const [first = "", ...lines] = specDescription.split("\n");
  const listed = lines.filter((line) => line.startsWith("Values:")).map(spoken);
  const special = lines.filter((line) => line.startsWith("Special values:")).map(spoken);
  const kind = kindOf(name, spec.ops, listed.length > 0, special.length > 0);
  // Every relation filter documents `=p` (same project), and its value is the related issue's id.
  const derived =
    listed.length > 0 ? listed.join(", ") : spec.ops.includes("=p") ? "issue id" : kind;
  const named = overlay.filterValues[name];
  if (named !== undefined && derived !== undefined) {
    fail(`overlay.filterValues names it, but the spec already gives "${derived}"`);
  }
  const base =
    named ?? derived ?? fail("the spec gives no value; name one in overlay.filterValues");
  const words = Object.keys(spec.words ?? {});
  const subtree = kind === "id" && spec.ops.includes("~") ? overlay.subtrees[name] : undefined;
  if (kind === "id" && spec.ops.includes("~") && subtree === undefined) {
    fail("contains takes an id here; say what it matches in overlay.subtrees");
  }
  const value = [
    base,
    ...special,
    ...(words.length > 0 ? [`${words.map((word) => `\`${word}\``).join(", ")} alone`] : []),
    ...(subtree === undefined ? [] : [`${ID_CONTAINS} for ${subtree}`]),
  ].join(", ");
  const notes = [
    overlay.filterNotes[op]?.[name],
    spec.scoped && !projectInPath ? "Needs one project_id." : undefined,
  ];
  const summary = [first.trim(), ...notes.filter((note) => note !== undefined)].join(" ");
  return prose(spec, kind, summary, value, lines.join("\n"));
}

/** The custom field filters `cf_<id>`, which the spec documents as one object parameter. */
export const CUSTOM_FIELD_PROSE: FilterProse = prose(
  CUSTOM_FIELD,
  undefined,
  "Custom field by id, such as `cf_12`. Its format decides the operators.",
  "per the field's format",
  "",
);

function prose(
  spec: FilterSpec,
  kind: Kind | undefined,
  summary: string,
  value: string,
  raw: string,
): FilterProse {
  const forms = [
    ...operatorsOf(spec).map((o) =>
      o.name === "contains" && kind === "id" ? ID_CONTAINS : o.form,
    ),
    RAW,
  ];
  const description = [
    summary,
    `Value: ${value}.`,
    `Accepts a value, an array meaning any of them, or one of ${forms.join(", ")}.`,
  ].join("\n");
  return { kind, summary, value, description, raw };
}

/** The `where` of one operation: the grammar and the forms its filters take. */
export function whereLegend(
  where: readonly { spec: FilterSpec; prose: FilterProse }[],
  customFields: boolean,
): string {
  const filters = customFields
    ? [...where, { spec: CUSTOM_FIELD, prose: CUSTOM_FIELD_PROSE }]
    : where;
  const used = new Set(filters.flatMap((f) => operatorsOf(f.spec)));
  return [
    "Filters keyed by Redmine filter name. A value or an array means equals any of them.",
    `An object with one operator picks another comparison: ${OPERATORS.filter((o) => used.has(o))
      .map((o) => o.form)
      .join(", ")}.`,
    `Every filter also takes ${RAW}.`,
    ...(filters.some((f) => f.prose.kind === "date") ? ["Dates are YYYY-MM-DD."] : []),
    "Unknown filters and operators are refused before anything is sent.",
  ].join(" ");
}

/**
 * A filter whose spec lists its values has no kind, and one with special values such as `me` takes ids besides
 * them, updated_by included. Otherwise the operators tell: date operators such as `t` (today), comparisons, or
 * text matches.
 */
function kindOf(
  name: string,
  codes: readonly string[],
  listed: boolean,
  special: boolean,
): Kind | undefined {
  const id = /(^|_)id$/.test(name);
  if (listed) return undefined;
  if (special) return "id";
  if (codes.includes("t")) return "date";
  if (codes.includes(">=")) return id ? "id" : "number";
  if (codes.includes("~") && !id) return "text";
  return id ? "id" : undefined;
}

/** "Values: `1` (active), `5` (closed)" becomes "`1` for active, `5` for closed". */
function spoken(line: string): string {
  return line.replace(/^[\w ]+: /, "").replaceAll(/(`[^`]+`) \(([^)]+)\)/g, "$1 for $2");
}
