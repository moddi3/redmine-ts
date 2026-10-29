import type { z } from "zod";

/**
 * A tool result's structuredContent, parsed with `schema`. A result of the wrong shape fails the test where
 * it is read, where a cast would let the test pass on it.
 */
export function structured<T>(result: { structuredContent?: unknown }, schema: z.ZodType<T>): T {
  return schema.parse(result.structuredContent);
}
