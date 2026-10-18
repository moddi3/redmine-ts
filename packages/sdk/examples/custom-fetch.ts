import { createRedmine } from "@redmine-ts/sdk";

const throughGateway: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("X-Gateway-Token", process.env.GATEWAY_TOKEN!);
  return fetch(input, { ...init, headers });
};

export const rm = createRedmine({
  baseUrl: "https://gateway.example.com/redmine",
  auth: { apiKey: process.env.REDMINE_API_KEY! },
  fetch: throughGateway,
});

const sent: { method: string; url: string }[] = [];
const fakeRedmine: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  sent.push({ method: request.method, url: request.url });
  return Response.json({ issue: { id: 42, subject: "Stubbed issue" } });
};

const test = createRedmine({ baseUrl: "https://redmine.test", fetch: fakeRedmine });
const issue = await test.issues.get({ issue_id: 42 });
// sent: [{ method: "GET", url: "https://redmine.test/issues/42.json" }]

console.log(issue.subject, sent);
