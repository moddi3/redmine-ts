// `node generator/run.ts` regenerates src/generated; `--check` fails when the committed output differs.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./generate.ts";
import { loadSpecs } from "./spec.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { files, report } = await generate(loadSpecs(resolve(root, "../../spec/redmine-openapi")));
if (process.argv.includes("--check")) {
  const stale = Object.entries(files).filter(([path, code]) => {
    try {
      return readFileSync(resolve(root, path), "utf8") !== code;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(
      `out of date, run \`vp run gen\`:\n  ${stale.map(([path]) => path).join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log("generated code is up to date");
} else {
  for (const [path, code] of Object.entries(files)) writeFileSync(resolve(root, path), code);
  const { drift } = report;
  console.log(
    `operations ${report.ops}, hidden ${report.hidden.length}, schemas ${report.schemas}`,
  );
  for (const [ns, verbs] of Object.entries(report.namespaces)) {
    console.log(`  ${ns}: ${verbs.map(([verb, id]) => `${verb} (${id})`).join(", ")}`);
  }
  for (const { id, reason } of report.hidden) console.log(`  hidden ${id}: ${reason}`);
  console.log(`inline uploads: ${report.inlineUploads.join(", ")}`);
  console.log("corrections:");
  for (const { pointer, required, reason } of report.corrections)
    console.log(`  ${pointer} requires ${required.join(", ")}: ${reason}`);
  console.log("drift:");
  for (const { id, since } of drift.addedOps) console.log(`  added operation ${id} since ${since}`);
  for (const { id, until } of drift.removedOps)
    console.log(`  removed operation ${id} after ${until}`);
  for (const { name, since } of drift.addedSchemas)
    console.log(`  added schema ${name} since ${since}`);
  for (const { pointer, since } of drift.addedProperties)
    console.log(`  added ${pointer} since ${since}`);
  for (const { pointer, reason } of drift.resolved) console.log(`  resolved ${pointer}: ${reason}`);
  console.log(`  conflicts: ${drift.conflicts.length}`);
  for (const miss of report.includeMisses) console.log(`warning: ${miss}`);
}
