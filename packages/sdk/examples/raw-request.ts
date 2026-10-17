import { createRedmine } from "redmine-ts-sdk";

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

console.log(checklists.filter((item) => !item.is_done).map((item) => item.subject));
