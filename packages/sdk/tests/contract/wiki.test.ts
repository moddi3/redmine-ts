import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { cleanups, clientFor, describeServers, freshProject, unique } from "./helpers.ts";

describeServers("wiki pages and URL encoding", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();

  it("a title with unicode and a space survives the path, create answers with the page and update with nothing", async () => {
    const project = await freshProject(admin, cleanup, "wiki");
    const wiki_page_title = unique("Pagé ü");

    const created = await admin.wiki.update({
      project_id: project.id,
      wiki_page_title,
      text: "v1",
    });
    const updated = await admin.wiki.update({
      project_id: project.id,
      wiki_page_title,
      text: "v2",
      comments: "second",
    });

    expect(created).toMatchObject({ text: "v1", version: 1 });
    expect(updated).toBeUndefined();
    const read = await admin.wiki.get({ project_id: project.id, wiki_page_title });
    expect(read).toMatchObject({ text: "v2", version: 2, comments: "second" });
    expect(
      (await admin.wiki.getVersion({ project_id: project.id, wiki_page_title, version_id: 1 }))
        .text,
    ).toBe("v1");
    expect((await admin.wiki.list({ project_id: project.id }).all()).map((p) => p.title)).toContain(
      read.title,
    );
  });

  it("an update against a stale version is a conflict the SDK reports as http 409", async () => {
    const project = await freshProject(admin, cleanup, "wiki");
    const wiki_page_title = unique("Locked");
    await admin.wiki.update({ project_id: project.id, wiki_page_title, text: "v1" });
    await admin.wiki.update({ project_id: project.id, wiki_page_title, text: "v2" });

    const error = await admin.wiki
      .update({ project_id: project.id, wiki_page_title, text: "stale", version: 1 })
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "http")).toBe(true);
    expect((error as RedmineError).data).toMatchObject({ status: 409 });
    expect((await admin.wiki.get({ project_id: project.id, wiki_page_title })).text).toBe("v2");
  });

  it("deletes a page and a get afterwards is not_found", async () => {
    const project = await freshProject(admin, cleanup, "wiki");
    const wiki_page_title = unique("Doomed");
    await admin.wiki.update({ project_id: project.id, wiki_page_title, text: "bye" });

    await admin.wiki.delete({ project_id: project.id, wiki_page_title });

    const error = await admin.wiki
      .get({ project_id: project.id, wiki_page_title })
      .catch((e: unknown) => e);
    expect(RedmineError.is(error, "not_found")).toBe(true);
  });

  it("filter values with reserved URL characters reach the server intact", async () => {
    const project = await freshProject(admin, cleanup, "enc");
    const subject = `a&b +c#d ü ${unique("q")}`;
    const created = await admin.issues.create({ project_id: project.id, subject });
    await admin.issues.create({ project_id: project.id, subject: "plain" });

    const found = await admin.issues
      .list({
        where: { project_id: project.id, status_id: "any", subject: { contains: "&b +c#d ü" } },
      })
      .all();

    expect(found.map((i) => [i.id, i.subject])).toEqual([[created.id, subject]]);
  });
});
