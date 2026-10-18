// Facts behind the impersonation guard and rm.request array formats.
// Run after `node scripts/redmine-env.ts up`: node .audit/probes/guard-and-formats.mjs
import { readFileSync } from "node:fs";

const env = JSON.parse(readFileSync(new URL("../../.redmine/env.json", import.meta.url), "utf8"));

for (const [name, s] of Object.entries(env)) {
  const get = async (path, key, extra = {}) => {
    const r = await fetch(s.baseUrl + path, {
      headers: { "X-Redmine-API-Key": key, Accept: "application/json", ...extra },
    });
    return r.json();
  };
  for (const who of ["adminKey", "userKey"]) {
    const { user } = await get("/users/current.json", s[who]);
    console.log(name, who, "users/current ->", user.login, "admin =", user.admin);
  }
  const switched = await get("/users/current.json", s.userKey, {
    "X-Redmine-Switch-User": "admin",
  });
  console.log(name, "non-admin key + switch to admin answers as", switched.user.login);

  const h = {
    "X-Redmine-API-Key": s.adminKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const created = await fetch(s.baseUrl + "/issues.json", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ issue: { project_id: s.projectIdentifier, subject: "formats probe" } }),
  });
  const id = (await created.json()).issue.id;
  await fetch(`${s.baseUrl}/issues/${id}.json`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ issue: { notes: "n" } }),
  });
  for (const q of [
    "include=journals,watchers",
    "include[]=journals&include[]=watchers",
    "include=journals&include=watchers",
  ]) {
    const { issue } = await get(`/issues/${id}.json?${q}`, s.adminKey);
    console.log(name, q, "-> keys:", ["journals", "watchers"].filter((k) => k in issue).join(","));
  }
  await fetch(`${s.baseUrl}/issues/${id}.json`, { method: "DELETE", headers: h });
}
