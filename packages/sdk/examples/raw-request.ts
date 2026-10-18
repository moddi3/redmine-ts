import { createRedmine } from "@redmine-ts/sdk";

const rm = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
});

interface ChecklistItem {
  id: number;
  subject: string;
  is_done: boolean;
}

const { checklists } = (await rm.request({
  method: "GET",
  path: "issues/42/checklists.json",
})) as { checklists: ChecklistItem[] };

await rm.request({
  method: "POST",
  path: "issues/42/checklists.json",
  body: { checklist: { subject: "Update the changelog", is_done: false } },
});

await rm.request({
  method: "PUT",
  path: "issues/42/checklists/order.json",
  body: [3, 1, 2],
});

const { boards } = (await rm.request({
  method: "GET",
  path: "agile_boards.json",
  query: { project_ids: [1, 2], archived: false },
  arrayFormat: "repeat",
})) as { boards: unknown[] };

console.log(`${boards.length} boards`);
console.log(checklists.filter((item) => !item.is_done).map((item) => item.subject));
