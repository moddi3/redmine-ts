// target: packages/mcp/tests/contract
// expect: typescript(no-unnecessary-type-assertion)
// From packages/mcp/tests/contract/people.test.ts:53 on main at 590001a.
import type { Client } from "@modelcontextprotocol/client";
import { expect, it } from "vite-plus/test";

interface People {
  people: { id: number; login: string }[];
}

declare const client: Client;

it("finds people", async () => {
  const result = await client.callTool({ name: "people_find", arguments: { name: "smith" } });
  const people = result.structuredContent as unknown as People;
  expect(people.people).toHaveLength(1);
});
