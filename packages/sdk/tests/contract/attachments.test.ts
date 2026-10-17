import { expect, it } from "vite-plus/test";
import { RedmineError } from "../../src/index.ts";
import { cleanups, clientFor, describeServers, unique } from "./helpers.ts";

describeServers("attachments", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();

  async function newIssue() {
    const issue = await admin.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("attach"),
    });
    cleanup.add(() => admin.issues.delete({ issue_id: issue.id }));
    return issue;
  }

  const redSquarePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAADUExURf8AABniCTcAAAAHdElNRQfqChEUKCnd3od1AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTEwLTE3VDIwOjQwOjQxKzAwOjAwEt+GYwAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMC0xN1QyMDo0MDo0MSswMDowMGOCPt8AAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTAtMTdUMjA6NDA6NDErMDA6MDA0lx8AAAAAD0lEQVQoz2NgGAWjgHwAAAJAAAGMxat3AAAAAElFTkSuQmCC",
    "base64",
  );

  const allBytes = Uint8Array.from({ length: 4096 }, (_, i) => (i * 7 + 3) % 256);

  it("uploads a Blob, attaches it on update and downloads the identical bytes", async () => {
    const issue = await newIssue();
    const filename = "report ü 1.bin";

    const upload = await admin.attachments.upload({
      file: new Blob([allBytes]),
      filename,
      description: "contract payload",
    });
    expect(upload).toMatchObject({ filename, description: "contract payload" });
    expect(upload.token).toMatch(/^\d+\.[0-9a-f]+$/);
    await admin.issues.update({ issue_id: issue.id, uploads: [upload] });

    const read = await admin.issues.get({ issue_id: issue.id, include: ["attachments"] });
    expect(read.attachments).toHaveLength(1);
    expect(read.attachments[0]).toMatchObject({
      filename,
      filesize: allBytes.length,
      description: "contract payload",
      author: { name: "Redmine Admin" },
    });

    const download = await admin.attachments.download(read.attachments[0]!);
    expect(download).toMatchObject({ filename, size: allBytes.length });
    expect(Buffer.from(await download.bytes()).equals(Buffer.from(allBytes))).toBe(true);
  });

  it("uploads a Uint8Array with a declared content type and attaches it on create", async () => {
    const text = new TextEncoder().encode("hello file\n");
    const upload = await admin.attachments.upload({
      file: text,
      filename: "note.txt",
      content_type: "text/plain",
    });

    const created = await admin.issues.create({
      project_id: server.projectIdentifier,
      subject: unique("attach-create"),
      uploads: [upload],
    });
    cleanup.add(() => admin.issues.delete({ issue_id: created.id }));

    const read = await admin.issues.get({ issue_id: created.id, include: ["attachments"] });
    expect(read.attachments[0]).toMatchObject({ filename: "note.txt", content_type: "text/plain" });
    const download = await admin.attachments.download(read.attachments[0]!);
    expect(new TextDecoder().decode(await download.bytes())).toBe("hello file\n");
  });

  it("uploads a ReadableStream and the server stores the streamed bytes", async () => {
    const issue = await newIssue();
    const upload = await admin.attachments.upload({
      file: new Blob(["streamed bytes"]).stream(),
      filename: "stream.txt",
    });
    await admin.issues.update({ issue_id: issue.id, uploads: [upload] });

    const [attachment] = (await admin.issues.get({ issue_id: issue.id, include: ["attachments"] }))
      .attachments;

    const download = await admin.attachments.download(attachment!);
    expect(new TextDecoder().decode(await download.bytes())).toBe("streamed bytes");
  });

  it("a thumbnail of an attached image is a PNG, and a non-image has none (404)", async () => {
    const issue = await newIssue();
    const image = await admin.attachments.upload({
      file: redSquarePng,
      filename: "red.png",
      content_type: "image/png",
    });
    const text = await admin.attachments.upload({
      file: new Blob(["no pixels"]),
      filename: "plain.txt",
    });
    await admin.issues.update({ issue_id: issue.id, uploads: [image, text] });
    const { attachments } = await admin.issues.get({
      issue_id: issue.id,
      include: ["attachments"],
    });
    const png = attachments.find((a) => a.filename === "red.png")!;
    const plain = attachments.find((a) => a.filename === "plain.txt")!;

    expect(png.thumbnail_url).toContain(`/attachments/thumbnail/${png.id}`);
    const thumbnail = await admin.attachments.thumbnail({ id: png.id, size: 32 });
    expect(thumbnail.content_type).toBe("image/png");
    expect(
      Buffer.from(await thumbnail.bytes())
        .subarray(0, 8)
        .toString("hex"),
    ).toBe("89504e470d0a1a0a");
    const error = await admin.attachments.thumbnail({ id: plain.id }).catch((e: unknown) => e);
    expect(RedmineError.is(error, "not_found")).toBe(true);
  });

  it("reads attachment metadata by id and a deleted attachment is not_found", async () => {
    const issue = await newIssue();
    const upload = await admin.attachments.upload({ file: new Blob(["x"]), filename: "x.txt" });
    await admin.issues.update({ issue_id: issue.id, uploads: [upload] });
    const [attachment] = (await admin.issues.get({ issue_id: issue.id, include: ["attachments"] }))
      .attachments;

    expect(await admin.attachments.get({ attachment_id: attachment!.id })).toMatchObject({
      id: attachment!.id,
      filename: "x.txt",
    });
    await admin.attachments.delete({ attachment_id: attachment!.id });

    const error = await admin.attachments
      .get({ attachment_id: attachment!.id })
      .catch((e: unknown) => e);
    expect(RedmineError.is(error, "not_found")).toBe(true);
  });

  it("a download of an attachment that is gone is not_found", async () => {
    const error = await admin.attachments
      .download({ id: 2_000_000_000, filename: "nothing.bin" })
      .catch((e: unknown) => e);

    expect(RedmineError.is(error, "not_found")).toBe(true);
  });
});
