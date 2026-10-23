import { catalog } from "@redmine-ts/sdk/catalog";

const readTools = catalog
  .filter((entry) => entry.method === "GET")
  .map((entry) => ({
    name: `${entry.namespace}_${entry.verb}`,
    description: [entry.title, entry.description].filter(Boolean).join("\n\n"),
    inputSchema: entry.inputSchema,
    annotations: { readOnlyHint: true },
  }));
console.log(`${readTools.length} read tools`);

const listIssues = catalog.find((entry) => entry.id === "getIssues");
console.log(listIssues?.output.kind); // "list": output.schema describes one issue
