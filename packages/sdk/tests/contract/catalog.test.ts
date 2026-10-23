import { beforeAll, expect, it } from "vite-plus/test";
import { catalog, type CatalogEntry } from "../../src/catalog.ts";
import type { Listing } from "../../src/index.ts";
import { schemaChecker } from "../schema-checker.ts";
import { clientFor, cleanups, describeServers, isoDay, unique } from "./helpers.ts";

const check = schemaChecker();
const entries = new Map(catalog.map((e) => [`${e.namespace}.${e.verb}`, e]));

const redSquarePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAADUExURf8AABniCTcAAAAHdElNRQfqChEUKCnd3od1AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTEwLTE3VDIwOjQwOjQxKzAwOjAwEt+GYwAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMC0xN1QyMDo0MDo0MSswMDowMGOCPt8AAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTAtMTdUMjA6NDA6NDErMDA6MDA0lx8AAAAAD0lEQVQoz2NgGAWjgHwAAAJAAAGMxat3AAAAAElFTkSuQmCC",
  "base64",
);

const isListing = (value: unknown): value is Listing<unknown> =>
  typeof value === "object" && value !== null && "page" in value;

/**
 * Checks `input` against the method's inputSchema, sends it, and checks every decoded item that comes
 * back against the output schema. A list is read one page of up to 100 items.
 */
async function probe<I, R>(
  method: string,
  input: I,
  run: (input: I) => R,
): Promise<{ value: Awaited<R>; problems: string[] }> {
  const entry: CatalogEntry | undefined = entries.get(method);
  if (!entry) throw new Error(`no catalog entry for ${method}`);
  const problems = check(entry.inputSchema, input).map((p) => `${method} input ${p}`);
  const value = (await run(input)) as Awaited<R>;
  const { output } = entry;
  const absent = value === undefined && output.kind === "item" && output.optional;
  const items = isListing(value) ? (await value.page({ limit: 100 })).items : absent ? [] : [value];
  if (output.kind === "item" || output.kind === "list") {
    if (isListing(value) !== (output.kind === "list"))
      problems.push(`${method} is not a ${output.kind}`);
    if (items.length === 0 && !absent) problems.push(`${method} returned nothing to check`);
    items.forEach((item, i) => {
      for (const p of check(output.schema, item)) problems.push(`${method} item ${i} ${p}`);
    });
  }
  return { value, problems };
}

describeServers("catalog schemas against real responses", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();
  const setupProblems: string[] = [];
  const word = unique("needle").replaceAll("-", "");

  async function setup<I, R>(method: string, input: I, run: (input: I) => R) {
    const { value, problems } = await probe(method, input, run);
    setupProblems.push(...problems);
    return value;
  }

  const s = {} as {
    projectId: number;
    issueId: number;
    relationId: number;
    attachmentId: number;
    attachmentName: string;
    timeEntryId: number;
    versionId: number;
    categoryId: number;
    newsId: number;
    membershipId: number;
    groupId: number;
    roleId: number;
    userId: number;
    wikiTitle: string;
  };

  beforeAll(async () => {
    const identifier = unique("cat");
    const project = await setup(
      "projects.create",
      {
        name: identifier,
        identifier,
        description: "catalog contract",
        is_public: false,
        enabled_module_names: ["issue_tracking", "time_tracking", "wiki", "news", "files"],
      },
      (i) => admin.projects.create(i),
    );
    cleanup.add(() => admin.projects.delete({ project_id: project.id }));
    s.projectId = project.id;

    const jsmith = await clientFor(server, "user").users.current();
    s.userId = jsmith.id;
    const developer = (await admin.roles.list().all()).find((r) => r.name === "Developer");
    if (!developer) throw new Error("the seeded server has no Developer role");
    s.roleId = developer.id;
    const [activity] = await admin.enumerations.listTimeEntryActivities().all();
    if (!activity) throw new Error("the seeded server has no time entry activity");

    const membership = await setup(
      "memberships.create",
      { project_id: s.projectId, user_id: s.userId, role_ids: [s.roleId] },
      (i) => admin.memberships.create(i),
    );
    s.membershipId = membership.id;

    const group = await setup(
      "groups.create",
      { name: unique("group"), user_ids: [s.userId] },
      (i) => admin.groups.create(i),
    );
    cleanup.add(() => admin.groups.delete({ group_id: group.id }));
    s.groupId = group.id;
    await setup(
      "memberships.create",
      { project_id: s.projectId, user_id: s.groupId, role_ids: [s.roleId] },
      (i) => admin.memberships.create(i),
    );

    const category = await setup(
      "issueCategories.create",
      { project_id: s.projectId, name: unique("cat"), assigned_to_id: s.userId },
      (i) => admin.issueCategories.create(i),
    );
    s.categoryId = category.id;
    const version = await setup(
      "versions.create",
      { project_id: s.projectId, name: unique("v"), due_date: isoDay(30), description: "next" },
      (i) => admin.versions.create(i),
    );
    s.versionId = version.id;

    const { Severity, Tags } = server.customFields;
    const issue = await setup(
      "issues.create",
      {
        project_id: s.projectId,
        subject: `catalog ${word}`,
        description: "line one\nline two",
        category_id: s.categoryId,
        fixed_version_id: s.versionId,
        assigned_to_id: s.userId,
        start_date: isoDay(),
        estimated_hours: 2.5,
        custom_fields: [
          { id: Severity, value: "S2" },
          { id: Tags, value: ["a", "c"] },
        ],
      },
      (i) => admin.issues.create(i),
    );
    s.issueId = issue.id;
    await setup(
      "issues.create",
      { project_id: s.projectId, subject: unique("child"), parent_issue_id: s.issueId },
      (i) => admin.issues.create(i),
    );
    const other = await setup(
      "issues.create",
      { project_id: s.projectId, subject: unique("other") },
      (i) => admin.issues.create(i),
    );
    const relation = await setup(
      "relations.create",
      { issue_id: s.issueId, issue_to_id: other.id, relation_type: "relates" as const },
      (i) => admin.relations.create(i),
    );
    s.relationId = relation.id;
    await setup("issues.addWatcher", { issue_id: s.issueId, user_id: s.userId }, (i) =>
      admin.issues.addWatcher(i),
    );

    const image = await setup(
      "attachments.upload",
      { file: redSquarePng, filename: "red.png", content_type: "image/png", description: "red" },
      (i) => admin.attachments.upload(i),
    );
    await setup(
      "issues.update",
      {
        issue_id: s.issueId,
        notes: `noted ${word}`,
        subject: `catalog ${word} edited`,
        done_ratio: 30,
        uploads: [image],
      },
      (i) => admin.issues.update(i),
    );
    const read = await admin.issues.get({ issue_id: s.issueId, include: ["attachments"] as const });
    s.attachmentId = read.attachments[0]!.id;
    s.attachmentName = read.attachments[0]!.filename;

    const entry = await setup(
      "timeEntries.create",
      {
        issue_id: s.issueId,
        activity_id: activity.id,
        hours: 1.5,
        spent_on: isoDay(),
        comments: "catalog",
      },
      (i) => admin.timeEntries.create(i),
    );
    s.timeEntryId = entry.id;

    s.wikiTitle = unique("Page");
    await setup(
      "wiki.update",
      { project_id: s.projectId, wiki_page_title: s.wikiTitle, text: `v1 ${word}` },
      (i) => admin.wiki.update(i),
    );
    await setup(
      "wiki.update",
      {
        project_id: s.projectId,
        wiki_page_title: s.wikiTitle,
        text: `v2 ${word}`,
        comments: "second",
        version: 1,
      },
      (i) => admin.wiki.update(i),
    );

    await setup(
      "news.create",
      {
        project_id: s.projectId,
        title: `news ${word}`,
        summary: "short",
        description: "long",
      },
      (i) => admin.news.create(i),
    );
    const [news] = await admin.news.listByProject({ project_id: s.projectId }).all();
    if (!news) throw new Error("the news item was not created");
    s.newsId = news.id;

    const file = await setup(
      "attachments.upload",
      { file: new Blob(["release notes"]), filename: "notes.txt" },
      (i) => admin.attachments.upload(i),
    );
    await setup(
      "files.create",
      {
        project_id: s.projectId,
        token: file.token,
        version_id: s.versionId,
        filename: "notes.txt",
        description: "a release file",
      },
      (i) => admin.files.create(i),
    );
  });

  it("every input sent while seeding matches its inputSchema, and every result its output schema", () => {
    expect(setupProblems).toEqual([]);
  });

  const reads: Record<string, () => Promise<{ problems: string[] }>> = {
    "issues.list": () =>
      probe(
        "issues.list",
        {
          where: { project_id: s.projectId, status_id: "any" },
          include: ["attachments", "relations"] as const,
        },
        (i) => admin.issues.list(i),
      ),
    "issues.get": () =>
      probe(
        "issues.get",
        {
          issue_id: s.issueId,
          include: [
            "children",
            "attachments",
            "relations",
            "changesets",
            "journals",
            "watchers",
            "allowed_statuses",
          ] as const,
        },
        (i) => admin.issues.get(i),
      ),
    "projects.list": () =>
      probe(
        "projects.list",
        {
          where: { id: s.projectId },
          include: [
            "trackers",
            "issue_categories",
            "time_entry_activities",
            "enabled_modules",
            "issue_custom_fields",
          ] as const,
        },
        (i) => admin.projects.list(i),
      ),
    "projects.get": () =>
      probe(
        "projects.get",
        {
          project_id: s.projectId,
          include: [
            "trackers",
            "issue_categories",
            "time_entry_activities",
            "enabled_modules",
            "issue_custom_fields",
          ] as const,
        },
        (i) => admin.projects.get(i),
      ),
    "memberships.list": () =>
      probe("memberships.list", { project_id: s.projectId }, (i) => admin.memberships.list(i)),
    "memberships.get": () =>
      probe("memberships.get", { membership_id: s.membershipId }, (i) => admin.memberships.get(i)),
    "users.list": () =>
      probe("users.list", { include: ["auth_source"] as const, where: { status: 1 } }, (i) =>
        admin.users.list(i),
      ),
    "users.get": () =>
      probe(
        "users.get",
        { user_id: s.userId, include: ["memberships", "groups", "auth_source"] as const },
        (i) => admin.users.get(i),
      ),
    "users.current": () =>
      probe("users.current", { include: ["memberships", "groups"] as const }, (i) =>
        admin.users.current(i),
      ),
    "timeEntries.list": () =>
      probe("timeEntries.list", { where: { project_id: s.projectId } }, (i) =>
        admin.timeEntries.list(i),
      ),
    "timeEntries.get": () =>
      probe("timeEntries.get", { time_entry_id: s.timeEntryId }, (i) => admin.timeEntries.get(i)),
    "news.list": () => probe("news.list", {}, (i) => admin.news.list(i)),
    "news.get": () =>
      probe("news.get", { news_id: s.newsId, include: ["attachments", "comments"] as const }, (i) =>
        admin.news.get(i),
      ),
    "news.listByProject": () =>
      probe("news.listByProject", { project_id: s.projectId }, (i) => admin.news.listByProject(i)),
    "relations.list": () =>
      probe("relations.list", { issue_id: s.issueId }, (i) => admin.relations.list(i)),
    "relations.get": () =>
      probe("relations.get", { issue_relation_id: s.relationId }, (i) => admin.relations.get(i)),
    "versions.list": () =>
      probe("versions.list", { project_id: s.projectId }, (i) => admin.versions.list(i)),
    "versions.get": () =>
      probe("versions.get", { version_id: s.versionId }, (i) => admin.versions.get(i)),
    "wiki.list": () => probe("wiki.list", { project_id: s.projectId }, (i) => admin.wiki.list(i)),
    "wiki.get": () =>
      probe(
        "wiki.get",
        {
          project_id: s.projectId,
          wiki_page_title: s.wikiTitle,
          include: ["attachments"] as const,
        },
        (i) => admin.wiki.get(i),
      ),
    "wiki.getVersion": () =>
      probe(
        "wiki.getVersion",
        { project_id: s.projectId, wiki_page_title: s.wikiTitle, version_id: 1 },
        (i) => admin.wiki.getVersion(i),
      ),
    "queries.list": () => probe("queries.list", {}, (i) => admin.queries.list(i)),
    "attachments.get": () =>
      probe("attachments.get", { attachment_id: s.attachmentId }, (i) => admin.attachments.get(i)),
    "attachments.download": () =>
      probe("attachments.download", { id: s.attachmentId, filename: s.attachmentName }, (i) =>
        admin.attachments.download(i),
      ),
    "attachments.thumbnail": () =>
      probe("attachments.thumbnail", { id: s.attachmentId, size: 32 }, (i) =>
        admin.attachments.thumbnail(i),
      ),
    "issueStatuses.list": () => probe("issueStatuses.list", {}, (i) => admin.issueStatuses.list(i)),
    "trackers.list": () => probe("trackers.list", {}, (i) => admin.trackers.list(i)),
    "issueCategories.list": () =>
      probe("issueCategories.list", { project_id: s.projectId }, (i) =>
        admin.issueCategories.list(i),
      ),
    "issueCategories.get": () =>
      probe("issueCategories.get", { issue_category_id: s.categoryId }, (i) =>
        admin.issueCategories.get(i),
      ),
    "enumerations.listIssuePriorities": () =>
      probe("enumerations.listIssuePriorities", {}, (i) =>
        admin.enumerations.listIssuePriorities(i),
      ),
    "enumerations.listTimeEntryActivities": () =>
      probe("enumerations.listTimeEntryActivities", {}, (i) =>
        admin.enumerations.listTimeEntryActivities(i),
      ),
    "enumerations.listDocumentCategories": () =>
      probe("enumerations.listDocumentCategories", {}, (i) =>
        admin.enumerations.listDocumentCategories(i),
      ),
    "roles.list": () => probe("roles.list", {}, (i) => admin.roles.list(i)),
    "roles.get": () => probe("roles.get", { role_id: s.roleId }, (i) => admin.roles.get(i)),
    "groups.list": () =>
      probe("groups.list", { builtin: "1" as const }, (i) => admin.groups.list(i)),
    "groups.get": () =>
      probe(
        "groups.get",
        { group_id: s.groupId, include: ["users", "memberships"] as const },
        (i) => admin.groups.get(i),
      ),
    "customFields.list": () => probe("customFields.list", {}, (i) => admin.customFields.list(i)),
    "search.list": () =>
      probe("search.list", { q: word, all_words: "1" }, (i) => admin.search.list(i)),
    "search.listByProject": () =>
      probe("search.listByProject", { project_id: s.projectId, q: word }, (i) =>
        admin.search.listByProject(i),
      ),
    "files.list": () =>
      probe("files.list", { project_id: s.projectId }, (i) => admin.files.list(i)),
    "myAccount.get": () => probe("myAccount.get", {}, (i) => admin.myAccount.get(i)),
  };

  it("probes every read method in the catalog", () => {
    const readMethods = catalog
      .filter((e) => e.method === "GET")
      .map((e) => `${e.namespace}.${e.verb}`);
    expect(Object.keys(reads).sort()).toEqual(readMethods.sort());
  });

  it.each(Object.keys(reads))("%s", async (method) => {
    const { problems } = await reads[method]!();
    expect(problems).toEqual([]);
  });
});
