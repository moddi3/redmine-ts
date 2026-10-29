// target: packages/mcp/tests/unit
// expect: slop(no-structured-content-cast)
// From packages/mcp/tests/unit/result-budget.test.ts:71 before 6247d70; PRs 76 and 77 added 30 more like it.
import type { Client } from "@modelcontextprotocol/client";
import { expect, it } from "vite-plus/test";

interface Page {
  items: { id: number; subject: string }[];
  next_offset: number | null;
}

declare const client: Client;

it("reads a page", async () => {
  const result = await client.callTool({ name: "issues_list", arguments: { limit: 20 } });
  const page = result.structuredContent as unknown as Page;
  expect(page.items.length).toBeGreaterThan(0);
});
