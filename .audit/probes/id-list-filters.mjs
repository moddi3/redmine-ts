// Which list filters read every value of `a|b`, and which need `a,b`? Redmine splits the short filter
// syntax on "|", but several id filters read only the first value and split that on commas.
// For each documented filter with a fixture, asks for two values joined by "|" and by "," and compares
// the result with the union of the two single-value results (and, for "!", the complement). Run against
// the Docker servers:
//   node .audit/probes/id-list-filters.mjs
// Every fixture carries a random tag so results are restricted to them. Cleans up after itself.
import { readFileSync } from "node:fs";

const env = JSON.parse(readFileSync(new URL("../../.redmine/env.json", import.meta.url), "utf8"));
const { ops } = await import("../../packages/sdk/src/generated/ops.ts");
const tag = Math.random().toString(36).slice(2, 8);
const rows = [];

function client({ baseUrl, adminKey }) {
  return async (method, path, body, headers = {}) => {
    const r = await fetch(baseUrl + path, {
      method,
      headers: {
        "X-Redmine-API-Key": adminKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text.slice(0, 80);
    }
    return { status: r.status, json };
  };
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const show = (set) =>
  set.size > 6 ? `${set.size} ids` : `{${[...set].sort((a, b) => a - b).join(",")}}`;

for (const version of ["6.1", "7.0"]) {
  const call = client(env[version]);
  const made = [];
  try {
    const must = (r, what) => {
      if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.json)}`);
      return r.json;
    };
    const make = async (path, body, key, deletePath, headers) => {
      const json = must(await call("POST", path, body, headers), path);
      made.push(deletePath(json[key].id));
      return json[key];
    };

    const me = (await call("GET", "/users.json?name=jsmith")).json.users[0].id;
    const admin = 1;
    const sev = env[version].customFields.Severity;
    const priorities = (await call("GET", "/enumerations/issue_priorities.json")).json
      .issue_priorities;
    const activities = (await call("GET", "/enumerations/time_entry_activities.json")).json
      .time_entry_activities;

    // Projects: a root, two children (parent_id, id, status), and a second project holding one issue.
    const project = (name, extra = {}) =>
      make(
        "/projects.json",
        { project: { name: `${tag}-${name}`, identifier: `${tag}-${name}`, ...extra } },
        "project",
        (id) => `/projects/${id}.json`,
      );
    const root1 = await project("r1");
    const root2 = await project("r2");
    const child1 = await project("c1", { parent_id: root1.id });
    const child2 = await project("c2", { parent_id: root2.id });
    await call("POST", `/projects/${child2.id}/close.json`);
    await call("POST", `/projects/${root2.id}/memberships.json`, {
      membership: { user_id: me, role_ids: [4] },
    });

    const userA = await make(
      "/users.json",
      {
        user: {
          login: `${tag}a`,
          firstname: "Probe",
          lastname: "A",
          mail: `${tag}a@example.net`,
          password: "probe-password-1",
        },
      },
      "user",
      (id) => `/users/${id}.json`,
    );
    const userB = await make(
      "/users.json",
      {
        user: {
          login: `${tag}b`,
          firstname: "Probe",
          lastname: "B",
          mail: `${tag}b@example.net`,
          password: "probe-password-1",
        },
      },
      "user",
      (id) => `/users/${id}.json`,
    );
    await call("PUT", `/users/${userB.id}.json`, { user: { status: 3 } });

    await call("POST", "/projects/sdk-test/memberships.json", {
      membership: { user_id: userA.id, role_ids: [4] },
    });

    const v1 = await make(
      "/projects/sdk-test/versions.json",
      { version: { name: `${tag}-v1` } },
      "version",
      (id) => `/versions/${id}.json`,
    );
    const v2 = await make(
      "/projects/sdk-test/versions.json",
      { version: { name: `${tag}-v2` } },
      "version",
      (id) => `/versions/${id}.json`,
    );
    const c1 = await make(
      "/projects/sdk-test/issue_categories.json",
      { issue_category: { name: `${tag}-c1` } },
      "issue_category",
      (id) => `/issue_categories/${id}.json`,
    );
    const c2 = await make(
      "/projects/sdk-test/issue_categories.json",
      { issue_category: { name: `${tag}-c2` } },
      "issue_category",
      (id) => `/issue_categories/${id}.json`,
    );

    const issue = (name, fields, headers) =>
      make(
        "/issues.json",
        { issue: { project_id: "sdk-test", subject: `${tag} ${name}`, ...fields } },
        "issue",
        (id) => `/issues/${id}.json`,
        headers,
      );
    const parentA = await issue("parent a", {});
    const parentB = await issue("parent b", {});
    const a = await issue("a", {
      tracker_id: 1,
      priority_id: priorities[0].id,
      assigned_to_id: me,
      category_id: c1.id,
      fixed_version_id: v1.id,
      parent_issue_id: parentA.id,
      done_ratio: 30,
      custom_fields: [{ id: sev, value: "S1" }],
    });
    const b = await issue(
      "b",
      {
        tracker_id: 2,
        priority_id: priorities[1].id,
        assigned_to_id: userA.id,
        category_id: c2.id,
        fixed_version_id: v2.id,
        parent_issue_id: parentB.id,
        done_ratio: 40,
        custom_fields: [{ id: sev, value: "S2" }],
      },
      { "X-Redmine-Switch-User": "jsmith" },
    );
    await call("PUT", `/issues/${b.id}.json`, { issue: { status_id: 2 } });
    const inOther = await issue("in other project", {});
    must(
      await call("PUT", `/issues/${inOther.id}.json`, { issue: { project_id: root2.id } }),
      "move issue",
    );
    await call("POST", `/issues/${a.id}/watchers.json`, { user_id: me });
    await call("POST", `/issues/${b.id}/watchers.json`, { user_id: userA.id });

    // Relations: for every type, a -> target a and b -> target b, so `type=targetA|targetB` finds a and b.
    const relations = {};
    for (const type of [
      "relates",
      "duplicates",
      "duplicated",
      "blocks",
      "blocked",
      "precedes",
      "follows",
      "copied_to",
      "copied_from",
    ]) {
      const ta = await issue(`${type} target a`, {});
      const tb = await issue(`${type} target b`, {});
      for (const [from, to] of [
        [a, ta],
        [b, tb],
      ]) {
        must(
          await call("POST", `/issues/${from.id}/relations.json`, {
            relation: { issue_to_id: to.id, relation_type: type },
          }),
          `relation ${type}`,
        );
      }
      relations[type] = [ta.id, tb.id];
    }

    const entry = (issueId, userId, activity, extra = {}) =>
      make(
        "/time_entries.json",
        {
          time_entry: {
            issue_id: issueId,
            hours: 1,
            activity_id: activity,
            comments: `${tag} entry`,
            ...(userId === undefined ? {} : { user_id: userId }),
            ...extra,
          },
        },
        "time_entry",
        (id) => `/time_entries/${id}.json`,
      );
    await entry(a.id, userA.id, activities[0].id);
    await entry(b.id, me, activities[1].id);
    await entry(inOther.id, me, activities[0].id);

    // Walks every page of `path?query` and returns the set of ids.
    const idsOf = async (path, key, query) => {
      const found = new Set();
      for (let offset = 0; ; offset += 100) {
        const params = new URLSearchParams({ ...query, limit: "100", offset: String(offset) });
        const r = await call("GET", `${path}?${params}`);
        if (r.status !== 200) return `HTTP ${r.status}`;
        for (const item of r.json[key]) found.add(item.id);
        if (offset + 100 >= r.json.total_count) return found;
      }
    };

    const lists = {
      getIssues: {
        path: "/issues.json",
        key: "issues",
        universe: { subject: `~${tag}`, status_id: "*" },
      },
      getIssuesByProject: {
        path: "/projects/sdk-test/issues.json",
        key: "issues",
        universe: { subject: `~${tag}`, status_id: "*" },
      },
      getTimeEntriesByProject: {
        path: "/projects/sdk-test/time_entries.json",
        key: "time_entries",
        universe: { comments: `~${tag}` },
      },
      getTimeEntries: {
        path: "/time_entries.json",
        key: "time_entries",
        universe: { comments: `~${tag}` },
      },
      getProjects: {
        path: "/projects.json",
        key: "projects",
        universe: { name: `~${tag}`, status: "!9" },
      },
      getUsers: { path: "/users.json", key: "users", universe: { mail: `~${tag}`, status: "*" } },
    };

    // [op, filter, [a, b], operators to try]. `a` and `b` each select a different fixture.
    const cases = [
      ["getIssues", "issue_id", [a.id, b.id]],
      ["getIssues", "project_id", [1, root2.id]],
      ["getIssues", "tracker_id", [1, 2]],
      ["getIssues", "status_id", [1, 2]],
      ["getIssues", "priority_id", [priorities[0].id, priorities[1].id]],
      ["getIssues", "assigned_to_id", [me, userA.id]],
      ["getIssues", "author_id", [admin, me]],
      ["getIssues", "fixed_version_id", [v1.id, v2.id]],
      ["getIssues", "category_id", [c1.id, c2.id]],
      ["getIssuesByProject", "category_id", [c1.id, c2.id]],
      ["getIssues", "parent_id", [parentA.id, parentB.id]],
      ["getIssues", "child_id", [a.id, b.id]],
      ["getIssues", "done_ratio", [30, 40]],
      ["getIssues", "watcher_id", [me, userA.id]],
      ["getIssues", `cf_${sev}`, ["S1", "S2"]],
      ...Object.entries(relations).map(([type, targets]) => ["getIssues", type, targets]),
      ["getTimeEntries", "issue_id", [a.id, b.id]],
      ["getTimeEntries", "issue.parent_id", [parentA.id, parentB.id]],
      ["getTimeEntries", "issue.fixed_version_id", [v1.id, v2.id]],
      ["getTimeEntries", "issue.category_id", [c1.id, c2.id]],
      ["getTimeEntriesByProject", "issue.category_id", [c1.id, c2.id]],
      ["getTimeEntries", "issue.tracker_id", [1, 2]],
      ["getTimeEntries", "user_id", [userA.id, me]],
      ["getTimeEntries", "project_id", [1, root2.id]],
      ["getTimeEntries", "activity_id", [activities[0].id, activities[1].id]],
      ["getProjects", "id", [child1.id, child2.id]],
      ["getProjects", "parent_id", [root1.id, root2.id]],
      ["getProjects", "status", [1, 5]],
      ["getUsers", "status", [1, 3]],
      ["getUsers", "login", [userA.login, userB.login]],
    ];

    for (const [opId, filter, [x, y]] of cases) {
      const list = lists[opId];
      const spec =
        ops[opId].filters[filter] ?? (filter.startsWith("cf_") ? { ops: ["=", "!"] } : null);
      const universe = { ...list.universe };
      const ids = (query) => idsOf(list.path, list.key, { ...universe, ...query });
      // The filter under test replaces a universe key of the same name (status).
      const all = await ids({});
      delete universe[filter];
      const sx = await ids({ [filter]: String(x) });
      const sy = await ids({ [filter]: String(y) });
      if (![all, sx, sy].every((s) => s instanceof Set)) {
        rows.push({
          version,
          opId,
          filter,
          op: "=",
          note: `setup: ${[all, sx, sy].find((s) => !(s instanceof Set))}`,
        });
        continue;
      }
      const union = new Set([...sx, ...sy]);
      if (sx.size === 0 || sy.size === 0 || sameSet(sx, sy)) {
        rows.push({
          version,
          opId,
          filter,
          op: "=",
          note: `fixture does not separate: ${sx.size} and ${sy.size} of ${all.size}`,
        });
        continue;
      }
      for (const [op, prefix, expected] of [
        ["=", "", union],
        ["!", "!", new Set([...all].filter((i) => !union.has(i)))],
      ]) {
        if (!spec?.ops.includes(op)) continue;
        const judge = (got) =>
          typeof got === "string" ? got : sameSet(got, expected) ? "both" : `wrong ${show(got)}`;
        const pipe = judge(await ids({ [filter]: `${prefix}${x}|${y}` }));
        const comma = judge(await ids({ [filter]: `${prefix}${x},${y}` }));
        rows.push({ version, opId, filter, op, pipe, comma, expected: show(expected) });
      }
    }
  } finally {
    for (const path of made.reverse()) await call("DELETE", path);
  }
}

const verdict = (r) =>
  r.note ??
  (r.pipe === "both" && r.comma === "both"
    ? "both work"
    : r.pipe === "both" && r.comma !== "both"
      ? "`|`"
      : r.comma === "both" && r.pipe !== "both"
        ? "`,`"
        : "neither");
console.log("| version | operation | filter | operator | needs | `a\\|b` | `a,b` |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  console.log(
    `| ${r.version} | ${r.opId} | ${r.filter} | ${r.op} | ${verdict(r)} | ${r.pipe ?? "-"} | ${r.comma ?? "-"} |`,
  );
}

const probed = new Set(rows.map((r) => r.filter));
const skipped = new Set(
  ["getIssues", "getTimeEntries", "getProjects", "getUsers"].flatMap((opId) =>
    Object.keys(ops[opId].filters).filter((f) => !probed.has(f)),
  ),
);
console.log(`
Documented filters without a fixture, by name (the scoped variants share their query class): dates, hours
and text take one value or one string, and the rest read every value in Redmine's source
(app/models/{issue,time_entry,user}_query.rb, query.rb):
${[...skipped].join(", ")}`);
