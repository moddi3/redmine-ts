import { beforeAll, expect, it } from "vite-plus/test";
import { type GetIssuesWhere, RedmineError } from "../../src/index.ts";
import {
  cleanups,
  clientFor,
  describeServers,
  freshProject,
  ids,
  isoDay,
  unique,
} from "./helpers.ts";

describeServers("issue filters", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();
  const { Severity, Tags } = server.customFields;
  const needle = unique("needle");
  let projectId: number;
  let a: number;
  let b: number;
  let c: number;
  let d: number;
  let closedId: number;

  beforeAll(async () => {
    const project = await freshProject(admin, cleanup, "filt");
    projectId = project.id;

    const jsmith = await clientFor(server, "user").users.current();
    const roles = await admin.roles.list().all();
    const developer = roles.find((r) => r.name === "Developer");
    if (!developer) throw new Error("the seeded server has no Developer role");
    await admin.memberships.create({
      project_id: projectId,
      user_id: jsmith.id,
      role_ids: [developer.id],
    });

    const statuses = await admin.issueStatuses.list().all();
    const closed = statuses.find((s) => s.is_closed);
    if (!closed) throw new Error("the seeded server has no closed status");
    closedId = closed.id;

    const make = async (
      subject: string,
      extra: Parameters<typeof admin.issues.create>[0] extends infer I ? Partial<I> : never,
    ) => (await admin.issues.create({ project_id: projectId, subject, ...extra })).id;
    a = await make(`alpha ${needle}`, {
      custom_fields: [
        { id: Severity, value: "S1" },
        { id: Tags, value: ["a", "b"] },
      ],
    });
    b = await make("beta", {
      assigned_to_id: jsmith.id,
      custom_fields: [{ id: Severity, value: "S2" }],
    });
    c = await make("gamma", { custom_fields: [{ id: Severity, value: "S1" }] });
    await admin.issues.update({ issue_id: c, status_id: closed.id });
    d = await make("delta", {
      custom_fields: [
        { id: Severity, value: "S3" },
        { id: Tags, value: ["c"] },
      ],
    });
  });

  const found = async (
    where: Parameters<typeof admin.issues.list>[0] extends infer I
      ? I extends { where?: infer W }
        ? W
        : never
      : never,
  ) =>
    ids(await admin.issues.list({ where: { project_id: projectId, ...where }, sort: "id" }).all());

  it('status_id "open" returns the three open issues, not the closed one', async () => {
    expect(await found({ status_id: "open" })).toEqual([a, b, d]);
  });

  it('status_id "closed" returns only the closed issue', async () => {
    expect(await found({ status_id: "closed" })).toEqual([c]);
  });

  it('status_id { not: "closed" } returns the open issues, and { not: "open" } the closed one', async () => {
    expect(await found({ status_id: { not: "closed" } })).toEqual([a, b, d]);
    expect(await found({ status_id: { not: "open" } })).toEqual([c]);
  });

  it("a status word next to a status id is refused, since Redmine reads o|id as every open issue", async () => {
    const sent = (await admin.request({
      method: "GET",
      path: "issues.json",
      query: { project_id: projectId, status_id: `o|${closedId}`, sort: "id" },
    })) as { issues: { id: number }[] };
    expect(ids(sent.issues)).toEqual([a, b, d]);

    const error = await admin.issues
      .list({ where: { project_id: projectId, status_id: ["open", closedId] } })
      .all()
      .catch((e: unknown) => e);
    expect(RedmineError.is(error, "invalid_input")).toBe(true);
  });

  it("a scoped filter without one project is refused, since Redmine drops it and lists every category", async () => {
    const category = await admin.issueCategories.create({ project_id: projectId, name: needle });
    await admin.issues.update({ issue_id: a, category_id: category.id });
    expect(await found({ category_id: category.id })).toEqual([a]);

    const sent = (await admin.request({
      method: "GET",
      path: "issues.json",
      query: { category_id: category.id, issue_id: `${a},${b}`, sort: "id" },
    })) as { issues: { id: number }[] };
    expect(ids(sent.issues)).toEqual([a, b]);

    const error = await admin.issues
      .list({ where: { category_id: category.id, issue_id: [a, b] } })
      .all()
      .catch((e: unknown) => e);
    expect(RedmineError.is(error, "invalid_input")).toBe(true);
  });

  it("a saved query takes no filter but one project, since Redmine runs the query's own filters", async () => {
    const queries = (await admin.request({ method: "GET", path: "queries.json" })) as {
      queries: { id: number; name: string }[];
    };
    const reported = queries.queries.find((q) => q.name === "Reported issues");
    if (!reported) throw new Error("the seeded server has no Reported issues query");
    const listed = async (where: object) =>
      ids(
        await admin.issues
          .list({ query_id: reported.id, where: { project_id: projectId, ...where }, sort: "id" })
          .all(),
      );
    expect(await listed({})).toEqual([a, b, d]);

    const sent = (await admin.request({
      method: "GET",
      path: "issues.json",
      query: { query_id: reported.id, project_id: projectId, status_id: "c", sort: "id" },
    })) as { issues: { id: number }[] };
    expect(ids(sent.issues)).toEqual([a, b, d]);

    const error = await listed({ status_id: "closed" }).catch((e: unknown) => e);
    expect(RedmineError.is(error, "invalid_input")).toBe(true);
  });

  it('status_id "any" returns all four, while the unfiltered list is open-only', async () => {
    expect(await found({ status_id: "any" })).toEqual([a, b, c, d]);
    expect(await found({})).toEqual([a, b, d]);
  });

  it("subject { contains } matches the one subject carrying the needle", async () => {
    expect(await found({ status_id: "any", subject: { contains: needle } })).toEqual([a]);
    expect(await found({ status_id: "any", subject: { contains: "a" } })).toEqual([a, b, c, d]);
    expect(await found({ status_id: "any", subject: { not_contains: needle } })).toEqual([b, c, d]);
  });

  it("assigned_to_id { none: true } returns the unassigned issues, { any: true } the assigned one", async () => {
    expect(await found({ status_id: "any", assigned_to_id: { none: true } })).toEqual([a, c, d]);
    expect(await found({ status_id: "any", assigned_to_id: { any: true } })).toEqual([b]);
  });

  it("a custom field filter takes an array as an OR of values", async () => {
    expect(await found({ status_id: "any", [`cf_${Severity}`]: ["S1", "S3"] })).toEqual([a, c, d]);
    expect(await found({ status_id: "any", [`cf_${Severity}`]: "S2" })).toEqual([b]);
  });

  it("a multi-value custom field matches an issue holding any of the values", async () => {
    expect(await found({ status_id: "any", [`cf_${Tags}`]: "a" })).toEqual([a]);
    expect(await found({ status_id: "any", [`cf_${Tags}`]: ["b", "c"] })).toEqual([a, d]);
  });

  it("updated_on { gte: today } includes the fresh issues and a date two days ahead excludes them", async () => {
    expect(await found({ status_id: "any", updated_on: { gte: isoDay() } })).toEqual([a, b, c, d]);
    expect(await found({ status_id: "any", updated_on: { gte: isoDay(2) } })).toEqual([]);
    expect(
      await found({ status_id: "any", updated_on: { between: [isoDay(-1), isoDay(1)] } }),
    ).toEqual([a, b, c, d]);
  });

  it("updated_on { gte: a UTC time } compares the time, not only the day, and refuses a fraction of a second or an offset", async () => {
    const issues = await admin.issues
      .list({ where: { project_id: projectId, status_id: "any" } })
      .all();
    const newest = issues.reduce((x, y) => (y.updated_on > x.updated_on ? y : x));
    // Redmine sends gte T as "> T - 1 s" and may keep fractional seconds, so one second later can still match.
    const later = new Date(Date.parse(newest.updated_on) + 2000)
      .toISOString()
      .replace(".000Z", "Z");
    expect(await found({ status_id: "any", updated_on: { gte: newest.updated_on } })).toContain(
      newest.id,
    );
    expect(await found({ status_id: "any", updated_on: { gte: later } })).toEqual([]);
    for (const time of ["2026-10-31T08:00:00.500Z", "2026-10-31T11:00:00+03:00"]) {
      const error = await found({ status_id: "any", updated_on: { gte: time } }).catch(
        (e: unknown) => e,
      );
      expect(RedmineError.is(error, "validation"), time).toBe(true);
    }
  });

  it("filters combine with AND", async () => {
    expect(
      await found({
        status_id: "open",
        assigned_to_id: { none: true },
        [`cf_${Severity}`]: ["S1", "S2"],
      }),
    ).toEqual([a]);
  });

  it("a raw condition is sent verbatim", async () => {
    expect(await found({ status_id: "any", updated_on: { raw: "t" } })).toEqual([a, b, c, d]);
  });

  it("an unknown filter key is refused before it can silently match every row", async () => {
    const error = await admin.issues
      .list({ where: { project_id: projectId, nonsense: "x" } as never })
      .all()
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "invalid_input")).toBe(true);
  });

  it("parent_id { contains: id } returns every issue below that one", async () => {
    const tree = await freshProject(admin, cleanup, "tree");
    const make = async (subject: string, parent?: number) =>
      (
        await admin.issues.create({
          project_id: tree.id,
          subject,
          ...(parent === undefined ? {} : { parent_issue_id: parent }),
        })
      ).id;
    const root = await make("root");
    const child = await make("child", root);
    const grandchild = await make("grandchild", child);
    const listed = async (where: Omit<GetIssuesWhere, "project_id">) =>
      ids(await admin.issues.list({ where: { project_id: tree.id, ...where }, sort: "id" }).all());

    expect(await listed({ parent_id: root })).toEqual([child]);
    expect(await listed({ parent_id: { contains: root } })).toEqual([child, grandchild]);
    expect(await listed({ child_id: { contains: grandchild } })).toEqual([root, child]);
  });
});
