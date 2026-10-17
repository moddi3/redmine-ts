import { beforeAll, expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import {
  cleanups,
  clientFor,
  describeServers,
  freshProject,
  ids,
  recorder,
  unique,
} from "./helpers.ts";

const TOTAL = 7;

describeServers("pagination", (server) => {
  const seen = recorder();
  const admin = clientFor(server, "admin", { onEvent: seen.onEvent });
  const cleanup = cleanups();
  let projectId: number;
  let created: number[];

  beforeAll(async () => {
    const project = await freshProject(admin, cleanup, "page");
    projectId = project.id;
    created = [];
    for (let n = 0; n < TOTAL; n++) {
      const issue = await admin.issues.create({ project_id: projectId, subject: unique(`p${n}`) });
      created.push(issue.id);
    }
  });

  const issues = (extra: Parameters<typeof admin.issues.list>[0] = {}) =>
    admin.issues.list({ where: { project_id: projectId }, ...extra });

  it("iterating with pageSize 3 yields all seven issues exactly once, in id order", async () => {
    const yielded: number[] = [];
    for await (const issue of issues({ pageSize: 3, sort: "id" })) yielded.push(issue.id);

    expect(yielded).toEqual(created);
  });

  it("descending sort walks the same issues backwards", async () => {
    const all = await issues({ pageSize: 3, sort: "id:desc" }).all();

    expect(ids(all)).toEqual([...created].reverse());
  });

  it("pages() reports page sizes 3, 3, 1 and a constant total_count", async () => {
    const pages: Array<{ n: number; total: number | undefined; offset: number }> = [];
    for await (const page of issues({ pageSize: 3, sort: "id" }).pages()) {
      pages.push({ n: page.items.length, total: page.total_count, offset: page.offset });
    }

    expect(pages).toEqual([
      { n: 3, total: TOTAL, offset: 0 },
      { n: 3, total: TOTAL, offset: 3 },
      { n: 1, total: TOTAL, offset: 6 },
    ]);
  });

  it("keyset paging yields the same ids in the same order", async () => {
    const all = await issues({ pageSize: 3, paging: "keyset" }).all();

    expect(ids(all)).toEqual(created);
  });

  it("keyset paging refuses a sort before any request", async () => {
    const before = seen.requests().length;

    const error = await issues({ paging: "keyset", sort: "id:desc" })
      .all()
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "invalid_input")).toBe(true);
    expect(seen.requests().length).toBe(before);
  });

  it("page() returns one explicit page with the server's total_count", async () => {
    const page = await issues({ sort: "id" }).page({ offset: 3, limit: 3 });

    expect(page).toMatchObject({ total_count: TOTAL, offset: 3, limit: 3 });
    expect(ids(page.items)).toEqual(created.slice(3, 6));
  });

  it("count() matches the number of created issues", async () => {
    expect(await issues().count()).toBe(TOTAL);
  });

  it("all({ max }) returns when the cap is met and throws protocol page_cap when exceeded", async () => {
    expect(await issues({ pageSize: 3 }).all({ max: TOTAL })).toHaveLength(TOTAL);

    const error = await issues({ pageSize: 3 })
      .all({ max: TOTAL - 1 })
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "protocol")).toBe(true);
    expect((error as RedmineError).data).toMatchObject({ kind: "protocol", reason: "page_cap" });
  });

  it("breaking out of the loop stops fetching further pages", async () => {
    const before = seen.requests().length;

    for await (const issue of issues({ pageSize: 3, sort: "id" })) {
      expect(issue.id).toBe(created[0]);
      break;
    }

    expect(seen.requests().length - before).toBe(1);
  });
});

const OVER_CAP = 105;

describeServers("pagination past the server's 100-row page cap", (server) => {
  const seen = recorder();
  const admin = clientFor(server, "admin", { onEvent: seen.onEvent, maxConcurrent: 1 });
  const cleanup = cleanups();
  let projectId: number;
  let created: number[];

  beforeAll(async () => {
    projectId = (await freshProject(admin, cleanup, "cap")).id;
    created = [];
    for (let n = 0; n < OVER_CAP; n++) {
      created.push((await admin.issues.create({ project_id: projectId, subject: `cap ${n}` })).id);
    }
  });

  it("a pageSize of 150 is clamped by the server to 100 and every issue still arrives once, in order", async () => {
    const sizes: number[] = [];
    const yielded: number[] = [];
    for await (const page of admin.issues
      .list({ where: { project_id: projectId }, pageSize: 150, sort: "id" })
      .pages()) {
      sizes.push(page.items.length);
      yielded.push(...ids(page.items));
    }

    expect(sizes).toEqual([100, 5]);
    expect(yielded).toEqual(created);
  });

  it("keyset paging walks the same issues past the cap", async () => {
    const all = await admin.issues
      .list({ where: { project_id: projectId }, pageSize: 150, paging: "keyset" })
      .all();

    expect(ids(all)).toEqual(created);
  });

  it("count() and all({ max }) agree about the total", async () => {
    const issues = admin.issues.list({ where: { project_id: projectId } });

    expect(await issues.count()).toBe(OVER_CAP);
    expect(await issues.all({ max: OVER_CAP })).toHaveLength(OVER_CAP);
  });
});

describeServers("pagination on non-issue lists", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();

  it("projects.list pages a name-filtered set of three with pageSize 2", async () => {
    const prefix = unique("plist");
    const made = [];
    for (const suffix of ["a", "b", "c"]) {
      const project = await admin.projects.create({
        name: `${prefix} ${suffix}`,
        identifier: `${prefix}-${suffix}`,
      });
      cleanup.add(() => admin.projects.delete({ project_id: project.id }));
      made.push(project.id);
    }
    const projects = admin.projects.list({
      where: { name: { contains: prefix } },
      pageSize: 2,
      sort: "id",
    });

    const sizes: number[] = [];
    for await (const page of projects.pages()) sizes.push(page.items.length);

    expect(sizes).toEqual([2, 1]);
    expect(ids(await projects.all())).toEqual(made);
    expect(await projects.count()).toBe(3);
  });

  it("an unpaged list (issue statuses) comes back whole with no total_count", async () => {
    const page = await admin.issueStatuses.list().page();

    expect(page.total_count).toBeUndefined();
    expect(page.items.length).toBeGreaterThanOrEqual(6);
    expect(await admin.issueStatuses.list().count()).toBe(page.items.length);
  });
});
