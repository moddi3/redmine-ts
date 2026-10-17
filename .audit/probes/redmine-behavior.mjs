// Observes Redmine behaviors the SDK design depends on. Run after `node scripts/redmine-env.ts up`:
//   node .audit/probes/redmine-behavior.mjs
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
    const t = await r.text();
    let j;
    try {
      j = t ? JSON.parse(t) : undefined;
    } catch {
      j = t.slice(0, 60);
    }
    return { s: r.status, j, ct: r.headers.get("content-type") };
  };
  const c = await call("POST", "/issues.json", {
    issue: { project_id: "sdk-test", subject: "probe", bogus_field: 1 },
  });
  console.log(name, "unknown body attribute ->", c.s);
  const id = c.j.issue.id;
  const includes = [
    "journals",
    "allowed_statuses",
    "attachments",
    "relations",
    "children",
    "watchers",
    "changesets",
  ];
  const g = await call("GET", `/issues/${id}.json?include=${includes.join(",")}`);
  console.log(
    name,
    "included keys on a fresh issue:",
    includes.map((k) => `${k}=${k in g.j.issue ? "present" : "ABSENT"}`).join(" "),
  );
  console.log(
    name,
    "assigned_to on unassigned issue:",
    "assigned_to" in g.j.issue ? "present" : "absent",
  );
  const bad = await call("GET", "/issues.json?status_id=~zzz&limit=1");
  const unknown = await call("GET", "/issues.json?bogus_filter=1&limit=1");
  const all = await call("GET", "/issues.json?status_id=*&limit=1");
  console.log(
    name,
    `undocumented operator total=${bad.j.total_count}, unknown key total=${unknown.j.total_count}, all total=${all.j.total_count}`,
  );
  console.log(
    name,
    "limit=1000 echoed limit:",
    (await call("GET", "/issues.json?limit=1000")).j.limit,
  );
  const put = await call("PUT", `/issues/${id}.json`, { issue: { notes: "n" } });
  console.log(name, "PUT ->", put.s, "content-type", put.ct, "body", JSON.stringify(put.j));
  const sw = await fetch(baseUrl + "/users/current.json", {
    headers: { ...h, "X-Redmine-Switch-User": "nobody" },
  });
  console.log(name, "unknown switch user ->", sw.status);
  console.log(
    name,
    "422 body:",
    JSON.stringify((await call("PUT", `/issues/${id}.json`, { issue: { subject: "" } })).j),
  );
  await call("DELETE", `/issues/${id}.json`);
  const uid = (await call("GET", "/users.json?name=jsmith")).j.users[0].id;
  const gid = (
    await call("POST", "/groups.json", { group: { name: `probe-${Date.now()}`, user_ids: [uid] } })
  ).j.group.id;
  const rm = await call("DELETE", `/groups/${gid}/users.json?user_ids[]=${uid}`);
  const after = (await call("GET", `/groups/${gid}.json?include=users`)).j.group.users.length;
  console.log(name, "bulk removeUsersFromGroup ->", rm.s, "members after:", after);
  await call("DELETE", `/groups/${gid}.json`);
}
