// How Redmine reports a stale edit on issues (lock_version) and wiki pages (version).
// Run after `node scripts/redmine-env.ts up`: node .audit/probes/conflicts.mjs
import { readFileSync } from "node:fs";

const env = JSON.parse(readFileSync(new URL("../../.redmine/env.json", import.meta.url), "utf8"));

for (const name of ["6.1", "7.0"]) {
  const { baseUrl, adminKey } = env[name];
  const h = {
    "X-Redmine-API-Key": adminKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const call = async (method, path, body) => {
    const r = await fetch(baseUrl + path, {
      method,
      headers: h,
      body: body && JSON.stringify(body),
    });
    const text = await r.text();
    return { status: r.status, text, json: text ? JSON.parse(text) : undefined };
  };
  const issue = (
    await call("POST", "/issues.json", { issue: { project_id: "sdk-test", subject: "lock probe" } })
  ).json.issue;
  const read = (await call("GET", `/issues/${issue.id}.json`)).json.issue;
  console.log(name, "issue JSON exposes lock_version:", "lock_version" in read);
  const fresh = await call("PUT", `/issues/${issue.id}.json`, {
    issue: { subject: "v2", lock_version: 0 },
  });
  const stale = await call("PUT", `/issues/${issue.id}.json`, {
    issue: { subject: "v3", lock_version: 0 },
  });
  console.log(
    name,
    `issue PUT current lock_version -> ${fresh.status}; stale lock_version -> ${stale.status} ${stale.text}`,
  );
  const noLock = await call("PUT", `/issues/${issue.id}.json`, { issue: { subject: "v4" } });
  console.log(name, `issue PUT without lock_version -> ${noLock.status}`);
  await call("DELETE", `/issues/${issue.id}.json`);
  const page = `LockProbe${Date.now()}`;
  await call("PUT", `/projects/sdk-test/wiki/${page}.json`, { wiki_page: { text: "a" } });
  const w1 = await call("PUT", `/projects/sdk-test/wiki/${page}.json`, {
    wiki_page: { text: "b", version: 1 },
  });
  const w2 = await call("PUT", `/projects/sdk-test/wiki/${page}.json`, {
    wiki_page: { text: "c", version: 1 },
  });
  console.log(
    name,
    `wiki PUT current version -> ${w1.status}; stale version -> ${w2.status} ${w2.text}`,
  );
  await call("DELETE", `/projects/sdk-test/wiki/${page}.json`);
}
