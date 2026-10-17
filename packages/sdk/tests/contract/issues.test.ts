import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { clientFor, cleanups, describeServers, freshProject, unique } from "./helpers.ts";

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
    expect(issue.project?.name).toBe("SDK Test");
    expect(issue.author?.name).toBe("Redmine Admin");
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
    expect(issue.allowed_statuses.map((s) => s.id)).toContain(issue.status?.id);
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
