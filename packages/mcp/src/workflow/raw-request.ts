// raw_request: rm.request for what the typed tools do not cover. The SDK refuses methods the access
// mode does not allow and paths outside REDMINE_URL, so this tool only says which ones it will send.

import { RedmineError } from "@redmine-ts/sdk";
import type { Access } from "@redmine-ts/sdk";
import { z } from "zod";
import { BY_METHOD } from "../catalog-tools.ts";
import { isApiPath } from "../tools.ts";
import type { Annotations, ToolSpec } from "../tools.ts";
import { defineTool, ToolError } from "./define.ts";

const BY_ACCESS: Readonly<Record<Access, { sends: string; annotations: Annotations }>> = {
  "read-only": {
    sends:
      "This server is read-only: only GET is sent, and any other method is refused before sending.",
    annotations: BY_METHOD.GET.annotations,
  },
  "no-delete": {
    sends: "This server refuses DELETE before sending; GET, POST, PUT and PATCH are sent.",
    annotations: { ...BY_METHOD.DELETE.annotations, idempotentHint: false },
  },
  full: {
    sends: "Every method is sent, DELETE included, and Redmine has no undo.",
    annotations: { ...BY_METHOD.DELETE.annotations, idempotentHint: false },
  },
};

const Scalar = z.union([z.string(), z.number(), z.boolean()]);

/** Any JSON value, one type per branch: some clients send a value whose schema names no type as a string. */
const Json = z.union([Scalar, z.null(), z.array(z.unknown()), z.record(z.string(), z.unknown())]);

export function rawRequestTool(access: Access): ToolSpec {
  const { sends, annotations } = BY_ACCESS[access];
  return defineTool({
    name: "raw_request",
    title: "Send a raw Redmine request",
    description: [
      "Sends one request to any Redmine REST path with this server's credentials.",
      "Prefer the typed tools; use this for plugin endpoints, such as agile_boards.json, and for fields or parameters the typed tools miss.",
      "path is relative to REDMINE_URL with no leading slash, such as issues/7.json; query holds URL parameters; body is any JSON value, sent as is, and not allowed on GET.",
      sends,
      "Returns {response}: the parsed JSON, or null when Redmine sends no body.",
    ].join(" "),
    input: z.strictObject({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().min(1).describe("Relative to REDMINE_URL, such as issues/7.json."),
      query: z
        .record(z.string(), z.union([Scalar, z.array(z.union([z.string(), z.number()]))]))
        .optional()
        .describe('URL parameters, such as {status_id: "*", limit: 5}.'),
      body: Json.optional().describe('A JSON value, such as {issue: {notes: "Done"}}.'),
      array_format: z
        .enum(["brackets", "comma", "repeat"])
        .optional()
        .describe(
          "How an array in query is written: k[]=a&k[]=b (brackets, the default), k=a,b (comma) or k=a&k=b (repeat).",
        ),
    }),
    output: z.object({
      response: Json.describe("The parsed JSON response, or null for an empty body."),
    }),
    tier: "read",
    annotations,
    run: async (rm, { method, path, query, body, array_format }) => {
      const response = await rm
        .request({
          method,
          path,
          ...(query === undefined ? {} : { query }),
          ...(body === undefined ? {} : { body }),
          ...(array_format === undefined ? {} : { arrayFormat: array_format }),
        })
        .catch((error: unknown) => {
          if (RedmineError.is(error, "unauthorized") && !isApiPath(path)) {
            throw new ToolError(
              `Redmine answered 401 for ${path}. Redmine accepts API credentials only on its REST formats and answers 401 elsewhere even to valid ones, so end the path in .json, such as issues/7.json.`,
              error.toJSON(),
            );
          }
          throw error;
        });
      // rm.request resolves to parsed JSON, or undefined when Redmine sends no body.
      return { structured: { response: (response ?? null) as z.output<typeof Json> } };
    },
  });
}
