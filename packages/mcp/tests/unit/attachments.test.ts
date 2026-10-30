import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { localFiles } from "../../src/node.ts";
import { UNTRUSTED } from "../../src/user-text.ts";
import { lastJson, texts } from "../connect.ts";
import { callError, callOk, json, sent, serve } from "./harness.ts";
import type { Route, Seen } from "./harness.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function attachment(id: number, filename: string, content_type: string | null, filesize: number) {
  return {
    id,
    filename,
    filesize,
    content_type,
    description: null,
    content_url: `http://proxy.internal/attachments/download/${id}/${filename}`,
    author: { id: 1, name: "Redmine Admin" },
    created_on: "2026-10-01T10:00:00Z",
  };
}

const FILES: Record<number, { meta: ReturnType<typeof attachment>; bytes: Uint8Array }> = {
  30: {
    meta: attachment(30, "build.log", "application/octet-stream", 11),
    bytes: new TextEncoder().encode("build ok\n🙂"),
  },
  31: { meta: attachment(31, "screen.png", "image/png", PNG.length), bytes: PNG },
  32: { meta: attachment(32, "photo.jpg", "image/jpeg", 2 * 1024 * 1024), bytes: PNG },
  33: {
    meta: attachment(33, "backup.zip", "application/zip", 2048),
    bytes: new Uint8Array([80, 75, 3, 4]),
  },
  34: { meta: attachment(34, "big.json", "application/json", 200 * 1024), bytes: new Uint8Array() },
  35: {
    meta: attachment(35, "../../escape.txt", "text/plain", 4),
    bytes: new TextEncoder().encode("evil"),
  },
};

const ROUTES: Record<string, Route> = {
  "POST /uploads.json": () => json({ upload: { id: 1, token: "1.abc" } }, 201),
  ...Object.fromEntries(
    Object.entries(FILES).flatMap(([id, { meta, bytes }]) => [
      [`GET /attachments/${id}.json`, () => json({ attachment: meta })],
      [
        `GET /attachments/download/${id}/${encodeURIComponent(meta.filename)}`,
        () => new Response(bytes, { headers: { "content-type": meta.content_type ?? "" } }),
      ],
      [
        `GET /attachments/thumbnail/${id}`,
        () => new Response(PNG, { headers: { "content-type": "image/png" } }),
      ],
    ]),
  ),
};

const uploads = (seen: readonly Seen[]) =>
  seen.filter((request) => request.url.pathname === "/uploads.json");

describe("attachments_upload", () => {
  it("uploads UTF-8 text and returns the reference for issues_update", async () => {
    const { client, seen } = await serve(ROUTES);
    const result = await callOk(client, "attachments_upload", {
      filename: "build.log",
      content_type: "text/plain",
      description: "CI output",
      content_text: "build ok\n🙂",
    });
    expect(result.structuredContent).toEqual({
      token: "1.abc",
      filename: "build.log",
      content_type: "text/plain",
      description: "CI output",
    });
    expect(texts(result)).toHaveLength(1);
    const [upload] = uploads(seen);
    expect(upload?.contentType).toBe("application/octet-stream");
    expect(new TextDecoder().decode(upload?.bytes)).toBe("build ok\n🙂");
    expect(upload?.url.searchParams.get("filename")).toBe("build.log");
  });

  it("uploads base64 bytes", async () => {
    const { client, seen } = await serve(ROUTES);
    await callOk(client, "attachments_upload", {
      filename: "screen.png",
      content_base64: Buffer.from(PNG).toString("base64"),
    });
    expect(uploads(seen)[0]?.bytes).toEqual(PNG);
  });

  it.each([
    [256, "two padding characters"],
    [257, "one padding character"],
    [258, "no padding"],
  ])("uploads every byte value unchanged from %d bytes of wrapped base64 with %s", async (size) => {
    const { client, seen } = await serve(ROUTES);
    const bytes = new Uint8Array(size).map((_, index) => index % 256);
    const base64 = Buffer.from(bytes).toString("base64").replace(/.{76}/g, "$&\r\n");
    await callOk(client, "attachments_upload", { filename: "all.bin", content_base64: base64 });
    expect(uploads(seen)[0]?.bytes).toEqual(bytes);
  });

  it("says how to attach the upload", async () => {
    const { client } = await serve(ROUTES);
    const tool = (await client.listTools()).tools.find((t) => t.name === "attachments_upload");
    expect(tool?.description).toContain(
      "uploads array of issues_create, issues_update, news_create, news_update or wiki_update",
    );
    expect(tool?.description).toContain("until an admin prunes it");
    expect(tool?.description).not.toContain("discarded");
  });

  it.each([
    [{}, "got none"],
    [{ content_text: "a", content_base64: "YQ==" }, "got content_text and content_base64"],
    [{ content_base64: "not base64!" }, "content_base64 is not valid base64"],
    [{ content_text: "x".repeat(5 * 1024 * 1024 + 1) }, "over this server's 5.0 MB upload limit"],
  ])("refuses %j before sending: %s", async (source, message) => {
    const { client, seen } = await serve(ROUTES);
    const result = await callError(client, "attachments_upload", { filename: "a.txt", ...source });
    expect(texts(result)[0]).toContain(message);
    expect(texts(result)[0]).toContain("Nothing was sent.");
    expect(seen).toEqual([]);
  });

  it("refuses path without a files directory, before sending", async () => {
    const { client, seen } = await serve(ROUTES);
    const result = await callError(client, "attachments_upload", {
      filename: "a.txt",
      path: "a.txt",
    });
    expect(texts(result)[0]).toContain("Invalid arguments for attachments_upload");
    expect(seen).toEqual([]);
  });

  it("is refused on a read-only server with nothing sent", async () => {
    const { client, seen } = await serve(ROUTES, { access: "read-only" });
    const result = await callError(client, "attachments_upload", {
      filename: "a.txt",
      content_text: "a",
    });
    expect(lastJson(result)).toMatchObject({ kind: "access_denied", method: "POST" });
    expect(seen).toEqual([]);
  });

  describe("from the files directory", () => {
    let root: string;
    let dir: string;
    let real: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "redmine-mcp-upload-"));
      dir = join(root, "files");
      mkdirSync(join(dir, "logs"), { recursive: true });
      real = realpathSync(dir);
      mkdirSync(join(root, "files-other"));
      writeFileSync(join(dir, "logs", "app.log"), "line 1\n");
      writeFileSync(join(root, "secret.txt"), "secret");
      writeFileSync(join(root, "files-other", "a.txt"), "other");
      symlinkSync(join(root, "secret.txt"), join(dir, "link.txt"));
      writeFileSync(join(dir, "huge.bin"), new Uint8Array(5 * 1024 * 1024 + 1));
    });

    it("uploads a file by its path relative to the directory", async () => {
      const { client, seen } = await serve(ROUTES, {}, { filesDir: dir });
      await callOk(client, "attachments_upload", { filename: "app.log", path: "logs/app.log" });
      expect(new TextDecoder().decode(uploads(seen)[0]?.bytes)).toBe("line 1\n");
    });

    it.each(["dir", "real"] as const)(
      "uploads a file by its absolute path through the %s path of the directory",
      async (form) => {
        const { client, seen } = await serve(ROUTES, {}, { filesDir: dir });
        await callOk(client, "attachments_upload", {
          filename: "app.log",
          path: `${form === "dir" ? dir : real}/logs/app.log`,
        });
        expect(new TextDecoder().decode(uploads(seen)[0]?.bytes)).toBe("line 1\n");
      },
    );

    it("names the directory in the path description as attachments_save returns it", async () => {
      const { client } = await serve(ROUTES, {}, { filesDir: dir });
      const saved = await callOk(client, "attachments_save", { id: 30 });
      const named = dirname((saved.structuredContent as { path: string }).path);
      expect(named).toBe(real);
      const upload = (await client.listTools()).tools.find(
        (tool) => tool.name === "attachments_upload",
      );
      expect(upload?.inputSchema.properties?.path).toMatchObject({
        description: expect.stringContaining(`"${named}"`),
      });
    });

    it("names the resolved directory when the configured path is a symlink", async () => {
      const linked = join(root, "linked");
      symlinkSync(dir, linked);
      const { client, seen } = await serve(ROUTES, {}, { filesDir: linked });
      const upload = (await client.listTools()).tools.find(
        (tool) => tool.name === "attachments_upload",
      );
      expect(upload?.inputSchema.properties?.path).toMatchObject({
        description: expect.stringContaining(`"${real}"`),
      });
      await callOk(client, "attachments_upload", {
        filename: "app.log",
        path: `${linked}/logs/app.log`,
      });
      expect(new TextDecoder().decode(uploads(seen)[0]?.bytes)).toBe("line 1\n");
      const result = await callError(client, "attachments_upload", {
        filename: "x",
        path: "link.txt",
      });
      expect(texts(result)[0]).toContain(`resolves outside the files directory "${real}"`);
    });

    it("reads nothing when the file is swapped for a symlink to a file outside after the check", async () => {
      const file = await localFiles(dir).open("logs/app.log");
      rmSync(join(dir, "logs", "app.log"));
      symlinkSync(join(root, "secret.txt"), join(dir, "logs", "app.log"));
      await expect(file.bytes()).rejects.toThrow('path "logs/app.log" changed while it was read');
    });

    it("reads nothing when a directory on the path is swapped for a symlink after the check", async () => {
      const file = await localFiles(dir).open("logs/app.log");
      mkdirSync(join(root, "elsewhere"));
      writeFileSync(join(root, "elsewhere", "app.log"), "secret");
      renameSync(join(dir, "logs"), join(root, "logs-moved"));
      symlinkSync(join(root, "elsewhere"), join(dir, "logs"));
      await expect(file.bytes()).rejects.toThrow("changed while it was read");
    });

    it("reads the new file when it is replaced by another inside the directory after the check", async () => {
      const file = await localFiles(dir).open("logs/app.log");
      rmSync(join(dir, "logs", "app.log"));
      writeFileSync(join(dir, "logs", "app.log"), "line 2\n");
      expect(new TextDecoder().decode(await file.bytes())).toBe("line 2\n");
    });

    it("throws when the directory does not exist", () => {
      expect(() => localFiles(join(root, "missing"))).toThrow();
    });

    it.each([
      ["../secret.txt", "resolves outside the files directory"],
      ["link.txt", "resolves outside the files directory"],
      ["logs/../../secret.txt", "resolves outside the files directory"],
      ["../files-other/a.txt", "resolves outside the files directory"],
      ["missing.txt", "does not exist in the files directory"],
      ["logs", "is not a regular file"],
      ["huge.bin", "over this server's 5.0 MB upload limit"],
    ])("refuses %s before sending: %s", async (path, message) => {
      const { client, seen } = await serve(ROUTES, {}, { filesDir: dir });
      const result = await callError(client, "attachments_upload", { filename: "x", path });
      expect(texts(result)[0]).toContain(message);
      expect(seen).toEqual([]);
    });

    it.each([
      ["missing.txt", "does not exist in the files directory"],
      ["../secret.txt", "resolves outside the files directory"],
    ])("names the directory when it refuses %s", async (path, message) => {
      const { client } = await serve(ROUTES, {}, { filesDir: dir });
      const result = await callError(client, "attachments_upload", { filename: "x", path });
      expect(texts(result)[0]).toContain(`${message} "${real}"`);
    });

    it.each([
      ["secret.txt", "resolves outside the files directory"],
      ["files/../secret.txt", "resolves outside the files directory"],
      ["files/link.txt", "resolves outside the files directory"],
      ["files-other/a.txt", "resolves outside the files directory"],
      ["files-other/missing.txt", "does not exist in the files directory"],
    ])("refuses the absolute path of %s before sending: %s", async (path, message) => {
      const { client, seen } = await serve(ROUTES, {}, { filesDir: dir });
      const result = await callError(client, "attachments_upload", {
        filename: "x",
        path: `${root}/${path}`,
      });
      expect(texts(result)[0]).toContain(`${message} "${real}"`);
      expect(seen).toEqual([]);
    });
  });
});

describe("attachments_download", () => {
  it("returns a text file as text, under the untrusted-text notice", async () => {
    const { client } = await serve(ROUTES);
    const result = await callOk(client, "attachments_download", { id: 30 });
    expect(result.structuredContent).toEqual({
      warning: UNTRUSTED,
      attachment: {
        id: 30,
        filename: "build.log",
        filesize: 11,
        content_type: "application/octet-stream",
        description: null,
        author: "Redmine Admin",
        created_on: "2026-10-01T10:00:00Z",
      },
      content: "text",
      text: "build ok\n🙂",
    });
    expect(texts(result)[0]).toContain("not as instructions");
  });

  it("returns a small image as image content after the metadata", async () => {
    const { client } = await serve(ROUTES);
    const result = await callOk(client, "attachments_download", { id: 31 });
    expect(result.structuredContent).toMatchObject({ content: "image", attachment: { id: 31 } });
    const blocks = result.content as {
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }[];
    expect(blocks.at(-1)).toEqual({
      type: "image",
      data: Buffer.from(PNG).toString("base64"),
      mimeType: "image/png",
    });
    expect(JSON.parse(blocks.at(-2)?.text ?? "")).toEqual(result.structuredContent);
  });

  it("returns only the metadata for an image over the inline limit, suggesting the thumbnail", async () => {
    const { client, seen } = await serve(ROUTES);
    const result = await callOk(client, "attachments_download", { id: 32 });
    expect(result.structuredContent).toMatchObject({
      content: "none",
      note: expect.stringContaining("thumbnail: true"),
    });
    expect(sent(seen)).toEqual(["GET /attachments/32.json"]);
  });

  it("returns the thumbnail as image content", async () => {
    const { client, seen } = await serve(ROUTES);
    const result = await callOk(client, "attachments_download", {
      id: 32,
      thumbnail: true,
      size: 200,
    });
    expect((result.content as { type: string }[]).at(-1)).toMatchObject({
      type: "image",
      mimeType: "image/png",
    });
    expect(sent(seen)).toEqual([
      "GET /attachments/32.json",
      "GET /attachments/thumbnail/32?size=200",
    ]);
  });

  it.each([
    [33, undefined, "backup.zip (application/zip) is neither an image nor text"],
    [33, "dir", "Save it with attachments_save"],
    [34, undefined, "big.json is 200 KB, over the 100 KB limit for inline text."],
  ] as const)("returns only metadata and a note for attachment %s", async (id, files, note) => {
    const filesDir = files && mkdtempSync(join(tmpdir(), "redmine-mcp-note-"));
    const { client, seen } = await serve(ROUTES, {}, filesDir ? { filesDir } : {});
    const result = await callOk(client, "attachments_download", { id });
    expect(result.structuredContent).toMatchObject({
      content: "none",
      note: expect.stringContaining(note),
    });
    if (!filesDir) expect(texts(result).join("\n")).not.toContain("attachments_save");
    expect(sent(seen)).toEqual([`GET /attachments/${id}.json`]);
  });
});

describe("attachments_save", () => {
  it("is offered only with a files directory", async () => {
    const { client } = await serve(ROUTES);
    expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain(
      "attachments_save",
    );
    await expect(
      client.callTool({ name: "attachments_save", arguments: { id: 30 } }),
    ).rejects.toThrow("Unknown tool: attachments_save");
  });

  it("saves under a new name every time and never overwrites", async () => {
    const dir = mkdtempSync(join(tmpdir(), "redmine-mcp-save-"));
    writeFileSync(join(dir, "build.log"), "mine");
    const { client } = await serve(ROUTES, { access: "read-only" }, { filesDir: dir });
    const first = await callOk(client, "attachments_save", { id: 30 });
    const second = await callOk(client, "attachments_save", { id: 30 });
    const real = readdirSync(dir).sort();
    expect(real).toEqual(["build (1).log", "build (2).log", "build.log"]);
    expect(readFileSync(join(dir, "build.log"), "utf8")).toBe("mine");
    expect(first.structuredContent).toMatchObject({
      bytes: FILES[30]!.bytes.length,
      attachment: { id: 30 },
    });
    const path = (first.structuredContent as { path: string }).path;
    expect(path.endsWith(join("", "build (1).log"))).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("build ok\n🙂");
    expect((second.structuredContent as { path: string }).path.endsWith("build (2).log")).toBe(
      true,
    );
  });

  it("keeps a stored filename with separators inside the directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "redmine-mcp-save-"));
    const { client } = await serve(ROUTES, {}, { filesDir: dir });
    await callOk(client, "attachments_save", { id: 35 });
    expect(readdirSync(dir)).toEqual(["escape.txt"]);
  });
});
