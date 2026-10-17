import { beforeAll, expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
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
});
