import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { clientFor, cleanups, describeServers, freshProject, sorted, unique } from "./helpers.ts";

/** The spec leaves these optional, and overlay.corrections makes them required. */
const ALWAYS_SET = ["project", "tracker", "status", "priority", "author"] as const;

describeServers("issues", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();
  const { Severity, Tags } = server.customFields;

  async function newIssue(extra: Partial<Parameters<typeof admin.issues.create>[0]> = {}) {
    const issue = await admin.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("issue"),
      ...extra,
    });
    cleanup.add(() => admin.issues.delete({ issue_id: issue.id }));
    return issue;
  }

  it("creates an issue with a single-value and a multi-value custom field and reads both back (the server stores newlines as CRLF)", async () => {
    const created = await newIssue({
      description: "line one\nline two",
      custom_fields: [
        { id: Severity, value: "S2" },
        { id: Tags, value: ["a", "c"] },
      ],
    });
    expect(created.id).toBeTypeOf("number");

    const issue = await admin.issues.get({ issue_id: created.id });
    expect(issue.subject).toBe(created.subject);
    expect(issue.description).toBe("line one\r\nline two");
    expect(issue.project.name).toBe("SDK Test");
    expect(issue.author.name).toBe("Redmine Admin");
    expect(issue.is_private).toBe(false);
    expect(issue.done_ratio).toBe(0);

    const severity = issue.custom_fields?.find((f) => f.id === Severity);
    expect(severity).toMatchObject({ name: "Severity", value: "S2" });
    const tags = issue.custom_fields?.find((f) => f.id === Tags);
    expect(tags?.multiple).toBe(true);
    expect(tags?.value).toEqual(expect.arrayContaining(["a", "c"]));
    expect(tags?.value).toHaveLength(2);
  });

  it("gets an issue with journals, allowed_statuses, attachments and watchers as present, typed arrays (the author auto-watches a new issue)", async () => {
    const created = await newIssue();
    const me = await admin.users.current();

    const issue = await admin.issues.get({
      issue_id: created.id,
      include: ["journals", "allowed_statuses", "attachments", "watchers"],
    });

    // Reading these without `?.` is the compile-time half of include narrowing.
    expect(issue.journals).toEqual([]);
    expect(issue.attachments).toEqual([]);
    expect(issue.watchers).toEqual([{ id: me.id, name: "Redmine Admin" }]);
    expect(issue.allowed_statuses.length).toBeGreaterThan(0);
    for (const status of issue.allowed_statuses) {
      expect(status).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
    }
    expect(issue.allowed_statuses.map((s) => s.id)).toContain(issue.status.id);
  });

  it("get and list send project, tracker, status, priority and author on every issue, and parent with its id, also after the author is deleted", async () => {
    const project = await freshProject(admin, cleanup, "always");
    const login = unique("author");
    const author = await admin.users.create({
      login,
      firstname: "Gone",
      lastname: "Author",
      mail: `${login}@example.net`,
      password: "contract-pass-1",
    });
    cleanup.add(() => admin.users.delete({ user_id: author.id }));
    const developer = (await admin.roles.list().all()).find((r) => r.name === "Developer");
    if (!developer) throw new Error("the seeded server has no Developer role");
    await admin.memberships.create({
      project_id: project.id,
      user_id: author.id,
      role_ids: [developer.id],
    });
    const parent = await admin.issues.create({ project_id: project.id, subject: "parent" });
    const child = await admin.issues.create(
      { project_id: project.id, subject: "child", parent_issue_id: parent.id },
      { as: login },
    );
    // Redmine moves a deleted user's issues to the anonymous user.
    await admin.users.delete({ user_id: author.id });

    const got = [
      await admin.issues.get({ issue_id: parent.id }),
      await admin.issues.get({ issue_id: child.id }),
    ];
    const listed = await admin.issues.list({ where: { project_id: project.id } }).all();
    expect(sorted(listed.map((i) => i.id))).toEqual(sorted([parent.id, child.id]));

    for (const issues of [got, listed]) {
      for (const issue of issues) {
        for (const key of ALWAYS_SET) {
          expect(issue[key], `${key} of #${issue.id}`).toMatchObject({
            id: expect.any(Number),
            name: expect.any(String),
          });
        }
      }
      const byId = new Map(issues.map((i) => [i.id, i]));
      expect(byId.get(parent.id)).not.toHaveProperty("parent");
      expect(byId.get(child.id)?.parent).toEqual({ id: parent.id });
      expect(byId.get(child.id)?.author).toMatchObject({ name: "Anonymous" });
      expect(byId.get(child.id)?.author.id).not.toBe(author.id);
    }
  });

  it("an update with notes adds a journal carrying them and the author", async () => {
    const created = await newIssue();
    const notes = unique("note");

    await admin.issues.update({
      issue_id: created.id,
      notes,
      subject: `${created.subject} edited`,
    });

    const issue = await admin.issues.get({ issue_id: created.id, include: ["journals"] });
    expect(issue.subject).toBe(`${created.subject} edited`);
    expect(issue.journals).toHaveLength(1);
    expect(issue.journals[0]).toMatchObject({ notes, user: { name: "Redmine Admin" } });
    expect(issue.journals[0]?.details?.some((d) => d.name === "subject")).toBe(true);
  });

  it("updates custom fields and the multi-value field can be cleared", async () => {
    const created = await newIssue({ custom_fields: [{ id: Tags, value: ["a", "b"] }] });

    await admin.issues.update({
      issue_id: created.id,
      custom_fields: [
        { id: Severity, value: "S3" },
        { id: Tags, value: ["b"] },
      ],
    });

    const issue = await admin.issues.get({ issue_id: created.id });
    expect(issue.custom_fields?.find((f) => f.id === Severity)?.value).toBe("S3");
    expect(issue.custom_fields?.find((f) => f.id === Tags)?.value).toEqual(["b"]);
  });

  it("null clears every nullable field of an update, including the assignee Redmine ignores as null", async () => {
    const project = await freshProject(admin, cleanup, "clear");
    const jsmith = await clientFor(server, "user").users.current();
    const developer = (await admin.roles.list().all()).find((r) => r.name === "Developer");
    if (!developer) throw new Error("the seeded server has no Developer role");
    await admin.memberships.create({
      project_id: project.id,
      user_id: jsmith.id,
      role_ids: [developer.id],
    });
    const version = await admin.versions.create({ project_id: project.id, name: unique("v") });
    const category = await admin.issueCategories.create({
      project_id: project.id,
      name: unique("c"),
    });
    const parent = await admin.issues.create({ project_id: project.id, subject: "parent" });
    const filled = {
      description: "text",
      start_date: "2026-10-01",
      due_date: "2026-10-30",
      estimated_hours: 5,
      assigned_to_id: jsmith.id,
      category_id: category.id,
      fixed_version_id: version.id,
      parent_issue_id: parent.id,
    };
    const created = await admin.issues.create({
      project_id: project.id,
      subject: "clearing",
      ...filled,
      custom_fields: [{ id: Severity, value: "S1" }],
    });
    const read = () => admin.issues.get({ issue_id: created.id });

    const before = await read();
    expect(before).toMatchObject({
      assigned_to: { id: jsmith.id },
      category: { id: category.id },
      fixed_version: { id: version.id },
      parent: { id: parent.id },
      start_date: "2026-10-01",
      due_date: "2026-10-30",
      estimated_hours: 5,
    });

    await admin.issues.update({
      issue_id: created.id,
      description: null,
      start_date: null,
      due_date: null,
      estimated_hours: null,
      assigned_to_id: null,
      category_id: null,
      fixed_version_id: null,
      parent_issue_id: null,
      custom_fields: [{ id: Severity, value: null }],
    });

    const after = await read();
    expect(after.assigned_to).toBeUndefined();
    expect(after.category).toBeUndefined();
    expect(after.fixed_version).toBeUndefined();
    expect(after.parent).toBeUndefined();
    expect(after.start_date ?? null).toBeNull();
    expect(after.due_date ?? null).toBeNull();
    expect(after.estimated_hours ?? null).toBeNull();
    expect(after.description || null).toBeNull();
    expect(after.custom_fields?.find((f) => f.id === Severity)?.value || null).toBeNull();
  });

  it("the assignee can be set again after a null cleared it, and null on an unassigned issue is a no-op", async () => {
    const jsmith = await clientFor(server, "user").users.current();
    const created = await newIssue({ assigned_to_id: jsmith.id });

    await admin.issues.update({ issue_id: created.id, assigned_to_id: null });
    expect((await admin.issues.get({ issue_id: created.id })).assigned_to).toBeUndefined();

    await admin.issues.update({ issue_id: created.id, assigned_to_id: null });
    expect((await admin.issues.get({ issue_id: created.id })).assigned_to).toBeUndefined();

    await admin.issues.update({ issue_id: created.id, assigned_to_id: jsmith.id });
    expect((await admin.issues.get({ issue_id: created.id })).assigned_to?.id).toBe(jsmith.id);
  });

  it("deletes an issue and a get afterwards is not_found", async () => {
    const created = await admin.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("doomed"),
    });

    await expect(admin.issues.delete({ issue_id: created.id })).resolves.toBeUndefined();

    const error = await admin.issues.get({ issue_id: created.id }).catch((e: unknown) => e);
    expect(RedmineError.is(error, "not_found")).toBe(true);
  });

  it("creates an issue in a fresh project and reads it by project filter", async () => {
    const project = await freshProject(admin, cleanup);
    const created = await admin.issues.create({
      project_id: project.id,
      subject: unique("scoped"),
    });

    const listed = await admin.issues.list({ where: { project_id: project.id } }).all();

    expect(listed.map((i) => i.id)).toEqual([created.id]);
  });
});
