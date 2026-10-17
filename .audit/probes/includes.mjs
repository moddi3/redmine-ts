// Which `include` values return their key even when the collection is empty. Only those may narrow to
// required in Included<T, I>. Run after `node scripts/redmine-env.ts up`: node .audit/probes/includes.mjs
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
    return t ? JSON.parse(t) : undefined;
  };
  const report = (what, obj, includes) =>
    console.log(
      name,
      what,
      includes.map((k) => `${k}=${k in obj ? "present" : "ABSENT"}`).join(" "),
    );
  const stamp = Date.now();
  const project = (
    await call("POST", "/projects.json", {
      project: {
        name: `inc ${stamp}`,
        identifier: `inc-${stamp}`,
        enabled_module_names: [],
        tracker_ids: [],
      },
    })
  ).project;
  const pinc = [
    "trackers",
    "issue_categories",
    "enabled_modules",
    "time_entry_activities",
    "issue_custom_fields",
  ];
  report(
    "project",
    (await call("GET", `/projects/${project.id}.json?include=${pinc.join(",")}`)).project,
    pinc,
  );
  report(
    "projects[0]",
    (await call("GET", `/projects.json?include=${pinc.join(",")}&limit=100`)).projects.find(
      (p) => p.id === project.id,
    ),
    pinc,
  );
  const user = (
    await call("POST", "/users.json", {
      user: {
        login: `inc${stamp}`,
        firstname: "I",
        lastname: "N",
        mail: `inc${stamp}@example.net`,
        password: "inc-pass-12345",
      },
    })
  ).user;
  const uinc = ["memberships", "groups", "auth_source"];
  report(
    "user",
    (await call("GET", `/users/${user.id}.json?include=${uinc.join(",")}`)).user,
    uinc,
  );
  const group = (await call("POST", "/groups.json", { group: { name: `inc-${stamp}` } })).group;
  const ginc = ["users", "memberships"];
  report(
    "group",
    (await call("GET", `/groups/${group.id}.json?include=${ginc.join(",")}`)).group,
    ginc,
  );
  const issue = (
    await call("POST", "/issues.json", { issue: { project_id: "sdk-test", subject: "inc" } })
  ).issue;
  const lst = (await call("GET", `/issues.json?issue_id=${issue.id}&include=attachments,relations`))
    .issues[0];
  report("issues[0]", lst, ["attachments", "relations"]);
  await call("PUT", "/projects/sdk-test/wiki/IncProbe.json", { wiki_page: { text: "x" } });
  report(
    "wiki",
    (await call("GET", "/projects/sdk-test/wiki/IncProbe.json?include=attachments")).wiki_page,
    ["attachments"],
  );
  const news = await call("POST", "/projects/sdk-test/news.json", {
    news: { title: "inc", description: "x" },
  });
  const newsList = (await call("GET", "/projects/sdk-test/news.json?limit=1")).news;
  if (newsList?.[0])
    report(
      "news",
      (await call("GET", `/news/${newsList[0].id}.json?include=attachments,comments`)).news,
      ["attachments", "comments"],
    );
  else console.log(name, "news create returned", JSON.stringify(news));
  await call("DELETE", `/issues/${issue.id}.json`);
  await call("DELETE", `/groups/${group.id}.json`);
  await call("DELETE", `/users/${user.id}.json`);
  await call("DELETE", `/projects/${project.id}.json`);
}
