// target: packages/mcp/src
// expect: slop(no-type-assertion)
// From an agent's unmerged change for issue 92, packages/mcp/src/server.ts:109.
import type { Schema } from "./tools.ts";

export function unknownArguments(tool: { name: string; inputSchema: Schema }, args: object): string[] {
  const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
  return properties === undefined ? [] : Object.keys(args).filter((key) => !Object.hasOwn(properties, key));
}
