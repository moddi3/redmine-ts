// target: packages/mcp/tests/unit
// expect: slop(bounded-test-loop)
// From packages/mcp/tests/unit/result-budget.test.ts:66 before 6247d70, which capped the loop.
import { expect, it } from "vite-plus/test";

declare function page(offset: number): Promise<{ next_offset: number | null }>;

it("pages on to the last", async () => {
  const pages: { next_offset: number | null }[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const next = await page(offset);
    pages.push(next);
    offset = next.next_offset;
  }
  expect(pages.length).toBeGreaterThan(2);
});
