// Which nullable update fields does Redmine ignore when sent as JSON null, and does "" clear them?
// Sets each field, sends null, reads back, then sends "" and reads back. Run against the Docker servers:
//   node .audit/probes/clear-fields.mjs
// Cleans up everything it creates.
import { readFileSync } from "node:fs";

const env = JSON.parse(readFileSync(new URL("../../.redmine/env.json", import.meta.url), "utf8"));
const tag = Math.random().toString(36).slice(2, 8);

function client({ baseUrl, adminKey }) {
  return async (method, path, body) => {
    const r = await fetch(baseUrl + path, {
      method,
      headers: {
        "X-Redmine-API-Key": adminKey,
        "Content-Type": "application/json",
        Accept: "application/json",
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

// default_issue_query_id is not in the REST response, so read it from the project settings page.
async function settingsQuery({ baseUrl }, identifier) {
  const jar = new Map();
  const fetchJar = async (url, init = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const r = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: { ...init.headers, cookie },
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return r;
  };
  const login = await (await fetchJar(`${baseUrl}/login`)).text();
  const token = /name="authenticity_token" value="([^"]+)"/.exec(login)[1];
  await fetchJar(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      authenticity_token: token,
      username: "admin",
      password: "sdk-admin-pass-1",
    }),
  });
  const html = await (await fetchJar(`${baseUrl}/projects/${identifier}/settings`)).text();
  const select =
    /<select[^>]*name="project\[default_issue_query_id\]"[^>]*>([\s\S]*?)<\/select>/.exec(html);
  const selected =
    select &&
    /<option[^>]*selected[^>]*value="(\d+)"|<option[^>]*value="(\d+)"[^>]*selected/.exec(select[1]);
  return selected ? Number(selected[1] ?? selected[2]) : undefined;
}

const rows = [];

// A field is cleared when it reads back absent, null, empty, or (for numbers) 0.
const empty = (v) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) || v === 0;
const show = (v) => (v === undefined ? "absent" : JSON.stringify(v));

async function clearCase(version, call, { resource, field, create, update, read, set, via }) {
  // `create` makes a fresh resource with the field set and returns its path. `update(value)` is the body.
  const path = await create();
  const before = await read((await call("GET", path)).json, call);
  const result = { version, resource, field: via ?? field, before: show(before) };
  for (const [label, value] of [
    ["null", null],
    ["empty", ""],
  ]) {
    const put = await call("PUT", path, update(value));
    const after = await read((await call("GET", path)).json, call);
    result[label] = put.status >= 400 ? `HTTP ${put.status}` : empty(after) ? "cleared" : "ignored";
    // Put the value back so the next attempt starts from the same state.
    if (label === "null" && result[label] !== "cleared") continue;
    if (label === "null") await call("PUT", path, typeof set === "function" ? set() : set);
  }
  rows.push(result);
  return path;
}

for (const version of ["6.1", "7.0"]) {
  const call = client(env[version]);
  const created = []; // [method path] to delete at the end, in reverse
  const cleanup = (path) => created.push(path);

  const me = (await call("GET", "/users.json?name=jsmith")).json.users[0].id;
  const iv = (
    await call("POST", "/projects/sdk-test/versions.json", {
      version: { name: `probe-${tag}`, due_date: "2026-12-31" },
    })
  ).json.version.id;
  cleanup(`/versions/${iv}.json`);
  const cat = (
    await call("POST", "/projects/sdk-test/issue_categories.json", {
      issue_category: { name: `probe-${tag}` },
    })
  ).json.issue_category.id;
  cleanup(`/issue_categories/${cat}.json`);
  const parent = (
    await call("POST", "/issues.json", {
      issue: { project_id: "sdk-test", subject: `probe parent ${tag}` },
    })
  ).json.issue.id;
  cleanup(`/issues/${parent}.json`);

  const newIssue = async (fields) => {
    const r = await call("POST", "/issues.json", {
      issue: { project_id: "sdk-test", subject: `probe ${tag}`, ...fields },
    });
    if (r.status !== 201) throw new Error(`create issue ${r.status} ${JSON.stringify(r.json)}`);
    cleanup(`/issues/${r.json.issue.id}.json`);
    return `/issues/${r.json.issue.id}.json`;
  };
  const issueCase = (field, fields, read, extra = {}) => {
    const key = Object.keys(fields)[0];
    return clearCase(version, call, {
      resource: "issue",
      field,
      create: () => newIssue(fields),
      update: (value) => ({ issue: { [key]: value } }),
      set: { issue: fields },
      read: (j) => read(j.issue),
      ...extra,
    });
  };

  await issueCase("assigned_to_id", { assigned_to_id: me }, (i) => i.assigned_to?.id);
  await issueCase("category_id", { category_id: cat }, (i) => i.category?.id);
  await issueCase("fixed_version_id", { fixed_version_id: iv }, (i) => i.fixed_version?.id);
  await issueCase("parent_issue_id", { parent_issue_id: parent }, (i) => i.parent?.id);
  await issueCase("start_date", { start_date: "2026-10-01" }, (i) => i.start_date);
  await issueCase("due_date", { due_date: "2026-10-30" }, (i) => i.due_date);
  await issueCase("estimated_hours", { estimated_hours: 5 }, (i) => i.estimated_hours);
  await issueCase("done_ratio", { done_ratio: 50 }, (i) => i.done_ratio);
  await issueCase("description", { description: "some text" }, (i) => i.description);

  const cf = (i, id) => i.custom_fields?.find((f) => f.id === id)?.value;
  const severity = env[version].customFields.Severity;
  const tags = env[version].customFields.Tags;
  const customCase = (field, id, value, shape) =>
    clearCase(version, call, {
      resource: "issue",
      field,
      via: `${field} (${shape.name})`,
      create: () => newIssue({ custom_fields: [{ id, value }] }),
      update: (v) => ({ issue: shape.body(id, v) }),
      set: { issue: { custom_fields: [{ id, value }] } },
      read: (j) => cf(j.issue, id),
    });
  const arrayShape = {
    name: "custom_fields [{id, value}]",
    body: (id, v) => ({ custom_fields: [{ id, value: v }] }),
  };
  const mapShape = {
    name: "custom_field_values {id: value}",
    body: (id, v) => ({ custom_field_values: { [id]: v } }),
  };
  await customCase("custom field, single list", severity, "S1", arrayShape);
  await customCase("custom field, single list", severity, "S1", mapShape);
  await customCase("custom field, multi list", tags, ["a", "b"], arrayShape);
  await customCase("custom field, multi list", tags, ["a", "b"], mapShape);

  // Multi list also with an empty array, which Rails turns into nil before Redmine sees it.
  {
    const path = await newIssue({ custom_fields: [{ id: tags, value: ["a", "b"] }] });
    await call("PUT", path, { issue: { custom_fields: [{ id: tags, value: [] }] } });
    const after = cf((await call("GET", path)).json.issue, tags);
    rows.push({
      version,
      resource: "issue",
      field: "custom field, multi list (value: [])",
      before: '["a","b"]',
      null: "-",
      empty: empty(after) ? "cleared" : "ignored",
    });
  }

  // Projects. The REST show response leaves the default_* fields out, so they are read by their effect:
  // a new issue takes the default version and assignee, and the settings page lists the default query.
  const newProject = async (fields) => {
    const identifier = `probe-${tag}-${created.length}`;
    const r = await call("POST", "/projects.json", {
      project: { name: identifier, identifier, ...fields },
    });
    if (r.status !== 201) throw new Error(`create project ${r.status} ${JSON.stringify(r.json)}`);
    cleanup(`/projects/${identifier}.json`);
    return { path: `/projects/${identifier}.json`, identifier, id: r.json.project.id };
  };
  const issueDefault = (read) => async (json, call) => {
    const r = await call("POST", "/issues.json", {
      issue: { project_id: json.project.identifier, subject: `probe default ${tag}` },
    });
    const id = r.json.issue.id;
    const value = read(r.json.issue);
    await call("DELETE", `/issues/${id}.json`);
    return value;
  };
  const projectCase = (field, read, prepare, set) =>
    clearCase(version, call, {
      resource: "project",
      field,
      create: async () => {
        const project = await newProject({});
        await prepare?.(project);
        const r = await call("PUT", project.path, { project: set() });
        if (r.status !== 204)
          throw new Error(`set ${field}: ${r.status} ${JSON.stringify(r.json)}`);
        return project.path;
      },
      update: (value) => ({ project: { [field]: value } }),
      set: () => ({ project: set() }),
      read,
    });
  const parentProject = await newProject({});
  await projectCase(
    "parent_id",
    (j) => j.project.parent?.id,
    null,
    () => ({ parent_id: parentProject.id }),
  );
  await projectCase(
    "description",
    (j) => j.project.description,
    null,
    () => ({ description: "text" }),
  );
  await projectCase(
    "homepage",
    (j) => j.project.homepage,
    null,
    () => ({
      homepage: "http://example.com",
    }),
  );
  await projectCase(
    "default_assigned_to_id",
    issueDefault((i) => i.assigned_to?.id),
    (project) =>
      call("POST", `/projects/${project.identifier}/memberships.json`, {
        membership: { user_id: me, role_ids: [4] },
      }),
    () => ({ default_assigned_to_id: me }),
  );
  let projectVersion;
  await projectCase(
    "default_version_id",
    issueDefault((i) => i.fixed_version?.id),
    async (project) => {
      const r = await call("POST", `/projects/${project.identifier}/versions.json`, {
        version: { name: `probe-${tag}` },
      });
      projectVersion = r.json.version.id;
    },
    () => ({ default_version_id: projectVersion }),
  );
  await projectCase(
    "default_issue_query_id",
    async (json) => settingsQuery(env[version], json.project.identifier),
    null,
    () => ({ default_issue_query_id: 1 }),
  );

  // Create: assigned_to_id null is the same as omitting it (the default assignee still applies), as is "".
  {
    const project = await newProject({});
    await call("POST", `/projects/${project.identifier}/memberships.json`, {
      membership: { user_id: me, role_ids: [4] },
    });
    await call("PUT", project.path, { project: { default_assigned_to_id: me } });
    for (const [label, fields] of [
      ["omitted", {}],
      ["null", { assigned_to_id: null }],
      ["empty", { assigned_to_id: "" }],
    ]) {
      const r = await call("POST", "/issues.json", {
        issue: { project_id: project.identifier, subject: `probe create ${tag}`, ...fields },
      });
      rows.push({
        version,
        resource: "issue (create)",
        field: `assigned_to_id ${label}, project has a default assignee`,
        before: "-",
        null: `assigned to ${r.json.issue.assigned_to?.id}`,
        empty: "-",
      });
      await call("DELETE", `/issues/${r.json.issue.id}.json`);
    }
  }

  // Versions.
  const newVersion = async (fields) => {
    const r = await call("POST", "/projects/sdk-test/versions.json", {
      version: { name: `probe-${tag}-${created.length}`, ...fields },
    });
    cleanup(`/versions/${r.json.version.id}.json`);
    return `/versions/${r.json.version.id}.json`;
  };
  await call("PUT", "/projects/sdk-test/wiki/ProbePage.json", { wiki_page: { text: "x" } });
  for (const [field, value, read] of [
    ["due_date", "2026-12-31", (v) => v.due_date],
    ["wiki_page_title", "ProbePage", (v) => v.wiki_page_title],
  ]) {
    await clearCase(version, call, {
      resource: "version",
      field,
      create: () => newVersion({ [field]: value }),
      update: (v) => ({ version: { [field]: v } }),
      set: { version: { [field]: value } },
      read: (j) => read(j.version),
    });
  }

  // Journals (7.0 adds PUT /journals/{id}): a journal that keeps a detail survives with empty notes.
  {
    const path = await newIssue({});
    await call("PUT", path, { issue: { notes: "a note", status_id: 2 } });
    const journal = (await call("GET", `${path}?include=journals`)).json.issue.journals.find(
      (j) => j.notes === "a note",
    );
    const probe = await call("PUT", `/journals/${journal.id}.json`, { journal: { notes: null } });
    if (probe.status === 404) {
      rows.push({
        version,
        resource: "journal",
        field: "notes",
        before: '"a note"',
        null: "HTTP 404 (no endpoint)",
        empty: "-",
      });
    } else {
      const read = async () =>
        (await call("GET", `${path}?include=journals`)).json.issue.journals.find(
          (j) => j.id === journal.id,
        )?.notes;
      const afterNull = await read();
      await call("PUT", `/journals/${journal.id}.json`, { journal: { notes: "a note" } });
      await call("PUT", `/journals/${journal.id}.json`, { journal: { notes: "" } });
      const afterEmpty = await read();
      rows.push({
        version,
        resource: "journal",
        field: "notes",
        before: '"a note"',
        null:
          probe.status >= 400 ? `HTTP ${probe.status}` : empty(afterNull) ? "cleared" : "ignored",
        empty: empty(afterEmpty) ? "cleared" : "ignored",
      });
    }
  }

  await call("DELETE", "/projects/sdk-test/wiki/ProbePage.json");
  // Children before parents: the project fixtures go last, and a project holding issues is deleted whole.
  for (const path of created.reverse()) await call("DELETE", path);
}

console.log("| version | resource | field | before | null | empty string |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  console.log(
    `| ${r.version} | ${r.resource} | ${r.field} | ${r.before} | ${r.null} | ${r.empty} |`,
  );
}

console.log(`
Not probeable here: users.update and my_account.update auth_source_id (no authentication source is seeded
and REST cannot create one). Time entries, memberships, wiki pages and news have no nullable input.`);
