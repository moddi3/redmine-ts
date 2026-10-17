import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { clientFor, cleanups, describeServers, ids, unique } from "./helpers.ts";

describeServers("projects", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();

  async function newProject(extra: Partial<Parameters<typeof admin.projects.create>[0]> = {}) {
    const identifier = unique("proj");
    const project = await admin.projects.create({
      name: `Name ${identifier}`,
      identifier,
      ...extra,
    });
    cleanup.add(() => admin.projects.delete({ project_id: project.id }));
    return project;
  }

  it("creates a project and reads it back by id and by identifier", async () => {
    const project = await newProject({
      description: "made by a contract test",
      is_public: false,
      enabled_module_names: ["issue_tracking", "wiki"],
    });
    expect(project).toMatchObject({
      is_public: false,
      status: 1,
      description: "made by a contract test",
    });

    const byId = await admin.projects.get({ project_id: project.id });
    const byIdentifier = await admin.projects.get({
      project_id: project.identifier,
      include: ["enabled_modules"],
    });
    expect(byId).toMatchObject({ id: project.id, identifier: project.identifier, status: 1 });
    expect(byIdentifier.id).toBe(project.id);
    expect(byIdentifier.enabled_modules.map((m) => m.name).sort()).toEqual([
      "issue_tracking",
      "wiki",
    ]);
  });

  it("updates a project and ignores an identifier change while still succeeding", async () => {
    const project = await newProject();

    await admin.projects.update({
      project_id: project.id,
      name: "Renamed",
      description: "new text",
      identifier: unique("other"),
    });

    const read = await admin.projects.get({ project_id: project.id });
    expect(read).toMatchObject({
      name: "Renamed",
      description: "new text",
      identifier: project.identifier,
    });
  });

  it("lists the project through a name filter", async () => {
    const project = await newProject();

    const found = await admin.projects
      .list({ where: { name: { contains: project.identifier } } })
      .all();

    expect(ids(found)).toEqual([project.id]);
  });

  it("closes and reopens a project", async () => {
    const project = await newProject();

    await admin.projects.close({ project_id: project.id });
    expect((await admin.projects.get({ project_id: project.id })).status).toBe(5);

    await admin.projects.reopen({ project_id: project.id });
    expect((await admin.projects.get({ project_id: project.id })).status).toBe(1);
  });

  it("archives a project out of the default list and unarchives it back", async () => {
    const project = await newProject();
    const listed = () =>
      admin.projects.list({ where: { name: { contains: project.identifier } } }).all();

    await admin.projects.archive({ project_id: project.id });
    expect(await listed()).toEqual([]);

    await admin.projects.unarchive({ project_id: project.id });
    expect(ids(await listed())).toEqual([project.id]);
    expect((await admin.projects.get({ project_id: project.id })).status).toBe(1);
  });

  it("deletes a project and a get afterwards is not_found", async () => {
    const identifier = unique("gone");
    const project = await admin.projects.create({ name: identifier, identifier });

    await expect(admin.projects.delete({ project_id: project.id })).resolves.toBeUndefined();

    const error = await admin.projects.get({ project_id: identifier }).catch((e: unknown) => e);
    expect(RedmineError.is(error, "not_found")).toBe(true);
  });
});
