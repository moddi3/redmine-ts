import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import type { Access, UploadEntry } from "../../src/index.ts";
import {
  cleanups,
  clientFor,
  describeServers,
  freshProject,
  recorder,
  sorted,
  unique,
} from "./helpers.ts";

describeServers("inline uploads", (server) => {
  const log = recorder();
  const admin = clientFor(server, "admin", { onEvent: log.onEvent });
  const cleanup = cleanups();
  let shared: Promise<{ id: number }> | undefined;
  const project = () => (shared ??= freshProject(admin, cleanup, "inline"));
  const bytes = Uint8Array.from({ length: 2048 }, (_, i) => (i * 7 + 3) % 256);
  const file = (name: string) => ({ file: new Blob([`${name} body`]), filename: name });
  const idOf = (entry: UploadEntry | undefined) => Number(entry?.token?.split(".")[0]);

  async function newIssue(subject = unique("inline")) {
    const issue = await admin.issues.create({ project_id: (await project()).id, subject });
    return issue;
  }

  async function failed(promise: Promise<unknown>): Promise<RedmineError> {
    const error = await promise.then(
      () => new Error("expected the call to fail"),
      (e: unknown) => e,
    );
    if (!(error instanceof RedmineError)) throw error;
    return error;
  }

  it("issues.create uploads each file, and Redmine keeps the bytes, type and description", async () => {
    const { id: project_id } = await project();
    log.events.length = 0;
    const created = await admin.issues.create({
      project_id,
      subject: unique("inline-create"),
      uploads: [
        { file: bytes, filename: "a.bin" },
        {
          file: new Blob(["b"]),
          filename: "b.txt",
          content_type: "text/x-probe",
          description: "d",
        },
      ],
    });

    expect(
      log.requests().map((r) => `${r.method} ${new URL(r.url).pathname.split("/").at(-1)}`),
    ).toEqual(["POST uploads.json", "POST uploads.json", "POST issues.json"]);
    const read = await admin.issues.get({ issue_id: created.id, include: ["attachments"] });
    expect(read.attachments.map((a) => a.filename)).toEqual(["a.bin", "b.txt"]);
    expect(read.attachments[0]).toMatchObject({ filesize: bytes.length });
    expect(read.attachments[1]).toMatchObject({ content_type: "text/x-probe", description: "d" });
    const download = await admin.attachments.download(read.attachments[0]!);
    expect(Buffer.from(await download.bytes()).equals(Buffer.from(bytes))).toBe(true);
  });

  it("issues.update uploads the files in list order and passes a stored reference through", async () => {
    const issue = await newIssue();
    const stored = await admin.attachments.upload({ file: new Blob(["r"]), filename: "ref.txt" });
    await admin.issues.update({
      issue_id: issue.id,
      notes: "three files",
      uploads: [file("first.txt"), stored, file("second.txt")],
    });

    const read = await admin.issues.get({ issue_id: issue.id, include: ["attachments"] });
    const byName = new Map(read.attachments.map((a) => [a.filename, a.id]));
    expect([...byName.keys()].sort()).toEqual(["first.txt", "ref.txt", "second.txt"]);
    expect(byName.get("ref.txt")).toBe(idOf(stored));
    expect(byName.get("first.txt")!).toBeLessThan(byName.get("second.txt")!);
  });

  it("news.create and news.update attach files", async () => {
    const { id: project_id } = await project();
    const title = unique("inline-news");
    await admin.news.create({ project_id, title, description: "d", uploads: [file("n1.txt")] });
    const news = (await admin.news.listByProject({ project_id }).all()).find(
      (n) => n.title === title,
    );
    await admin.news.update({ news_id: news!.id, uploads: [file("n2.txt")] });

    const read = await admin.news.get({ news_id: news!.id, include: ["attachments"] });
    expect(read.attachments?.map((a) => a.filename).sort()).toEqual(["n1.txt", "n2.txt"]);
  });

  it("wiki.update attaches files on create and on update", async () => {
    const { id: project_id } = await project();
    const wiki_page_title = unique("Inline");
    await admin.wiki.update({ project_id, wiki_page_title, text: "v1", uploads: [file("w1.txt")] });
    await admin.wiki.update({ project_id, wiki_page_title, text: "v2", uploads: [file("w2.txt")] });

    const read = await admin.wiki.get({ project_id, wiki_page_title, include: ["attachments"] });
    expect(read.attachments?.map((a) => a.filename).sort()).toEqual(["w1.txt", "w2.txt"]);
  });

  it("a refused create hands back its uploads, and the retry attaches those same uploads", async () => {
    const input = {
      project_id: (await project()).id,
      subject: "",
      uploads: [file("r1.txt"), file("r2.txt")],
    };
    const error = await failed(admin.issues.create(input));
    expect(error.kind).toBe("validation");
    expect(error.op).toBe("createIssue");
    expect(error.uploads?.every((entry) => typeof entry.token === "string")).toBe(true);

    log.events.length = 0;
    const subject = unique("inline-retry");
    const retried = await admin.issues.create({ ...input, subject, uploads: error.uploads! });
    expect(log.requests().map((r) => r.method)).toEqual(["POST"]);
    const read = await admin.issues.get({ issue_id: retried.id, include: ["attachments"] });
    expect(sorted(read.attachments.map((a) => a.id))).toEqual(sorted(error.uploads!.map(idOf)));

    const replay = await failed(
      admin.issues.create({ ...input, subject, uploads: error.uploads! }),
    );
    expect(replay.kind).toBe("validation");
    const twins = await admin.issues
      .list({ where: { project_id: input.project_id, subject } })
      .all();
    expect(twins.map((i) => i.id)).toEqual([retried.id]);
  });

  it("replaying an applied update with its attached tokens is refused and adds no second note", async () => {
    const issue = await newIssue();
    const refused = await failed(
      admin.issues.update({ issue_id: issue.id, subject: "", uploads: [file("u.txt")] }),
    );
    const applied = { issue_id: issue.id, notes: "applied once", uploads: refused.uploads! };
    await admin.issues.update(applied);

    const replay = await failed(admin.issues.update(applied));
    expect(replay.kind).toBe("validation");
    const read = await admin.issues.get({
      issue_id: issue.id,
      include: ["journals", "attachments"],
    });
    expect(read.journals.filter((j) => j.notes === "applied once")).toHaveLength(1);
    expect(read.attachments.map((a) => a.filename)).toEqual(["u.txt"]);
  });

  it("a wiki retry is not refused for its attached tokens, so only version stops it from overwriting a later edit", async () => {
    const { id: project_id } = await project();
    const wiki_page_title = unique("Replay");
    await admin.wiki.update({ project_id, wiki_page_title, text: "v1" });
    const stale = await failed(
      admin.wiki.update({
        project_id,
        wiki_page_title,
        text: "v2",
        version: 99,
        uploads: [file("p.txt")],
      }),
    );
    expect(stale.kind).toBe("conflict");
    const applied = {
      project_id,
      wiki_page_title,
      text: "v2",
      version: 1,
      uploads: stale.uploads!,
    };
    await admin.wiki.update(applied);
    await admin.wiki.update({ project_id, wiki_page_title, text: "a later edit" });

    expect((await failed(admin.wiki.update(applied))).kind).toBe("conflict");
    const { version: _, ...unversioned } = applied;
    await admin.wiki.update(unversioned);
    const read = await admin.wiki.get({ project_id, wiki_page_title, include: ["attachments"] });
    expect(read.text).toBe("v2");
    expect(read.attachments?.map((a) => a.filename)).toEqual(["p.txt"]);
  });

  it("a non-member keeps its files on issues.update, through the add_issue_notes of the Non member role", async () => {
    const login = unique("inline-user");
    const user = await admin.users.create({
      login,
      firstname: "Inline",
      lastname: "Uploader",
      mail: `${login}@example.net`,
      password: "inline-uploads-1",
    });
    cleanup.add(() => admin.users.delete({ user_id: user.id }));
    const issue = await newIssue();

    await admin.with({ as: login }).issues.update({
      issue_id: issue.id,
      notes: "from a non-member",
      uploads: [file("member.txt")],
    });

    const read = await admin.issues.get({ issue_id: issue.id, include: ["attachments"] });
    expect(read.attachments.map((a) => [a.filename, a.author?.id])).toEqual([
      ["member.txt", user.id],
    ]);
  });

  it("a read-only client refuses a create with files and sends nothing", async () => {
    const quiet = recorder();
    const reader = clientFor(server, "admin", {
      access: "read-only" as Access,
      onEvent: quiet.onEvent,
    });
    const error = await failed(
      reader.issues.create({
        project_id: (await project()).id,
        subject: "x",
        uploads: [file("x")],
      }),
    );

    expect(error.data).toMatchObject({ kind: "access_denied", method: "POST" });
    expect(quiet.requests()).toEqual([]);
  });
});
