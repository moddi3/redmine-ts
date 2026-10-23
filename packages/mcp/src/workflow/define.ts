// Hand-written tools declare input and output with zod. This turns them into the ToolSpec every tool
// shares, so they are listed, validated, called and error-mapped exactly like the generated ones.

import type { ContentBlock } from "@modelcontextprotocol/server";
import { RedmineError, VERSIONS } from "@redmine-ts/sdk";
import { z } from "zod";
import { portable } from "../portable.ts";
import type { Annotations, Client, Schema, Tier, ToolContext, ToolSpec } from "../tools.ts";

export interface WorkflowTool<I extends z.ZodObject, O extends z.ZodObject> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: I;
  readonly output: O;
  readonly annotations: Annotations;
  readonly tier: Tier;
  readonly run: (
    rm: Client,
    input: z.output<I>,
    context: ToolContext,
  ) => Promise<{ structured: z.output<O>; extra?: readonly ContentBlock[] }>;
}

export function defineTool<I extends z.ZodObject, O extends z.ZodObject>(
  tool: WorkflowTool<I, O>,
): ToolSpec {
  const { input, output, run, ...rest } = tool;
  return {
    ...rest,
    inputSchema: jsonSchema(input, "input"),
    outputSchema: jsonSchema(output, "output"),
    since: VERSIONS[0],
    until: null,
    // The server validated the arguments against inputSchema; parsing adds the defaults.
    run: (rm, args, context) => run(rm, input.parse(args), context),
  };
}

/** z.int() bounds every integer to the safe range, which tells an agent nothing. */
function jsonSchema(schema: z.ZodObject, io: "input" | "output"): Schema {
  return portable(
    z.toJSONSchema(schema, {
      io,
      override: ({ jsonSchema: node }) => {
        if (node.maximum === Number.MAX_SAFE_INTEGER) delete node.maximum;
        if (node.minimum === Number.MIN_SAFE_INTEGER) delete node.minimum;
      },
    }) as Schema,
  );
}

/** A failure the tool explains itself, such as a status name that matches nothing. */
export class ToolError extends Error {
  override readonly name = "ToolError";
  readonly data: Record<string, unknown>;

  constructor(message: string, data: Record<string, unknown>) {
    super(message);
    this.data = data;
  }
}

/** Refused before anything is sent, reported like the SDK's own refusals. */
export function invalidInput(detail: string): RedmineError {
  return new RedmineError({ kind: "invalid_input", detail });
}

/** A lookup that fails, for lack of permission or anything else Redmine answers, yields `fallback`. */
export async function bestEffort<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof RedmineError) return fallback;
    throw error;
  }
}
