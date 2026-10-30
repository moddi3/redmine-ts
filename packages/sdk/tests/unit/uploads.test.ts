import { describe, expect, test, vi } from "vite-plus/test";
import type { SdkEvent } from "../../src/core/config.ts";
import { RedmineError } from "../../src/core/errors.ts";
import { createRedmine } from "../../src/redmine.ts";
import {
  BASE_URL,
  empty,
  failure,
  fakeFetch,
  hang,
  json,
  keyOf,
  sleep,
} from "./fixtures/fake-fetch.ts";
import type { Recorded, Responder } from "./fixtures/fake-fetch.ts";

// Assembly is tested against the hand-made registry: a regenerate cannot change what is asserted here.
vi.mock("../../src/generated/ops.ts", async () => ({
  ops: (await import("./fixtures/registry.ts")).ops,
}));
vi.mock("../../src/generated/slots.ts", async () => ({
  SLOTS: (await import("./fixtures/registry.ts")).SLOTS,
}));

const issue = { id: 9, subject: "Printer on fire" };
const uploaded = (token: string): Response => json({ upload: { id: 1, token } }, 201);
const bytes = new Uint8Array([1, 2, 3, 4]);

function client(respond: Responder, config: Record<string, unknown> = {}) {
  const fake = fakeFetch(respond);
  // oxlint-disable-next-line no-explicit-any -- the registry is hand-made, so methods are reached through `any`
  const rm: any = createRedmine({
    baseUrl: BASE_URL,
    auth: { apiKey: "secret-key" },
    fetch: fake.fetch,
    retry: { attempts: 2, baseMs: 1, maxMs: 5 },
    ...config,
  });
  return { rm, requests: fake.requests };
}

/** Uploads answer with tokens 1.t, 2.t, ... in order; everything else with `record`. */
function server(record: () => Response = () => json({ issue }, 201)): Responder {
  let tokens = 0;
  return (request) =>
    request.url.pathname.endsWith("/uploads.json") ? uploaded(`${++tokens}.t`) : record();
}

const paths = (requests: readonly Recorded[]): string[] =>
  requests.map((r) => `${r.method} ${r.url.pathname.replace("/redmine/", "")}${r.url.search}`);

describe("inline uploads", () => {
  test("upload each file, then send the record with its reference", async () => {
    const { rm, requests } = client(server());
    const created = await rm.issues.create({
      project_id: 1,
      subject: "s",
      uploads: [
        {
          file: new Blob([bytes]),
          filename: "a.log",
          content_type: "text/plain",
          description: "d",
        },
      ],
    });

    expect(created).toEqual(issue);
    expect(paths(requests)).toEqual([
      "POST uploads.json?filename=a.log&content_type=text%2Fplain",
      "POST issues.json",
    ]);
    expect(requests[0]?.headers.get("content-type")).toBe("application/octet-stream");
    expect([...(requests[0]?.bytes ?? [])]).toEqual([1, 2, 3, 4]);
    expect(requests[1]?.json()).toEqual({
      issue: {
        project_id: 1,
        subject: "s",
        uploads: [
          { token: "1.t", filename: "a.log", content_type: "text/plain", description: "d" },
        ],
      },
    });
  });

  test("keep the list order and pass references through verbatim", async () => {
    const { rm, requests } = client(server());
    const stored = { token: "7.aa", filename: "x", description: "kept" };
    await rm.issues.create({
      project_id: 1,
      subject: "s",
      uploads: [stored, { file: bytes, filename: "y" }, { token: "8.bb", filename: "z" }],
    });

    expect(paths(requests)).toEqual(["POST uploads.json?filename=y", "POST issues.json"]);
    expect(requests[1]?.json()).toMatchObject({
      issue: {
        uploads: [stored, { token: "1.t", filename: "y" }, { token: "8.bb", filename: "z" }],
      },
    });
  });

  test("references alone send one request, as before", async () => {
    const { rm, requests } = client(server());
    await rm.issues.create({ project_id: 1, subject: "s", uploads: [{ token: "7.aa" }] });

    expect(paths(requests)).toEqual(["POST issues.json"]);
    expect(requests[0]?.json()).toEqual({
      issue: { project_id: 1, subject: "s", uploads: [{ token: "7.aa" }] },
    });
  });

  test.each([
    {
      call: "issues.update",
      path: { issue_id: 7 },
      fields: { notes: "n" },
      record: "PUT issues/7.json",
      envelope: "issue",
    },
    {
      call: "news.create",
      path: { project_id: "web" },
      fields: { title: "t" },
      record: "POST projects/web/news.json",
      envelope: "news",
    },
    {
      call: "wiki.update",
      path: { project_id: "web", wiki_page_title: "Home" },
      fields: { text: "x" },
      record: "PUT projects/web/wiki/Home.json",
      envelope: "wiki_page",
    },
  ])("$call uploads first, then sends the token in $envelope", async (row) => {
    const { rm, requests } = client(server(() => empty()));
    const [namespace, verb] = row.call.split(".") as [string, string];
    const result = await rm[namespace][verb]({
      ...row.path,
      ...row.fields,
      uploads: [{ file: bytes, filename: "a.bin" }],
    });

    expect(result).toBeUndefined();
    expect(paths(requests)).toEqual(["POST uploads.json?filename=a.bin", row.record]);
    expect(requests[1]?.json()).toEqual({
      [row.envelope]: { ...row.fields, uploads: [{ token: "1.t", filename: "a.bin" }] },
    });
  });

  test("onEvent sees each request under its own operation, in order", async () => {
    const events: SdkEvent[] = [];
    const { rm } = client(server(), { onEvent: (event: SdkEvent) => void events.push(event) });
    await rm.issues.create({
      project_id: 1,
      subject: "s",
      uploads: [
        { file: bytes, filename: "a" },
        { file: bytes, filename: "b" },
      ],
    });

    expect(events.map((e) => `${e.type} ${e.op}`)).toEqual([
      "request uploadAttachmentFile",
      "response uploadAttachmentFile",
      "request uploadAttachmentFile",
      "response uploadAttachmentFile",
      "request createIssue",
      "response createIssue",
    ]);
  });

  test("the next upload starts only after the previous one answered", async () => {
    let firstAnswered = false;
    let overlapped = false;
    const { rm } = client(
      async (request, call) => {
        if (call === 1) {
          await sleep(20);
          firstAnswered = true;
          return uploaded("1.t");
        }
        if (call === 2) overlapped = !firstAnswered;
        return request.url.pathname.endsWith("/uploads.json") ? uploaded("2.t") : json({ issue });
      },
      { maxConcurrent: 4 },
    );
    await rm.issues.create({
      project_id: 1,
      subject: "s",
      uploads: [
        { file: bytes, filename: "a" },
        { file: bytes, filename: "b" },
      ],
    });

    expect(overlapped).toBe(false);
  });

  test("an upload retries a 429 like attachments.upload, and the record carries the new token", async () => {
    let call = 0;
    const { rm, requests } = client((request) => {
      call++;
      if (call === 1) return empty(429);
      return request.url.pathname.endsWith("/uploads.json") ? uploaded("2.t") : json({ issue });
    });
    await rm.issues.create({
      project_id: 1,
      subject: "s",
      uploads: [{ file: new Blob([bytes]), filename: "a" }],
    });

    expect(paths(requests)).toEqual([
      "POST uploads.json?filename=a",
      "POST uploads.json?filename=a",
      "POST issues.json",
    ]);
    expect(requests[2]?.json()).toMatchObject({ issue: { uploads: [{ token: "2.t" }] } });
  });

  test("the record retries a 429 without uploading again", async () => {
    let records = 0;
    const { rm, requests } = client(server(() => (++records === 1 ? empty(429) : json({ issue }))));
    await rm.issues.create({
      project_id: 1,
      subject: "s",
      uploads: [{ file: bytes, filename: "a" }],
    });

    expect(paths(requests)).toEqual([
      "POST uploads.json?filename=a",
      "POST issues.json",
      "POST issues.json",
    ]);
  });
});

describe("refusals before any byte", () => {
  const file = { file: bytes, filename: "a.bin" };

  test.each(["read-only"])("a %s client refuses an update with files", async (access) => {
    const { rm, requests } = client(server(), { access });
    const error = await failure(rm.issues.update({ issue_id: 1, uploads: [file] }));

    expect(error.data).toEqual({ kind: "access_denied", access, method: "PUT" });
    expect(requests).toHaveLength(0);
  });

  test("a no-delete client uploads and updates", async () => {
    const { rm, requests } = client(
      server(() => empty()),
      { access: "no-delete" },
    );
    await rm.issues.update({ issue_id: 1, uploads: [file] });

    expect(requests.map((r) => r.method)).toEqual(["POST", "PUT"]);
  });

  test("a declared version older than the operation refuses it", async () => {
    const { rm, requests } = client(server(), { version: "6.1" });
    const error = await failure(rm.documents.create({ project_id: 1, uploads: [file] }));

    expect(error.data).toMatchObject({ kind: "unsupported_version", since: "7.0" });
    expect(requests).toHaveLength(0);
  });

  test("a record input the record would refuse fails before the upload", async () => {
    const { rm, requests } = client(server());
    const error = await failure(rm.issues.update({ uploads: [file] }));

    expect(error.data).toMatchObject({ kind: "invalid_input" });
    expect(error.message).toContain("issue_id");
    expect(requests).toHaveLength(0);
  });

  test.each([
    { entry: { file: "text", filename: "x" }, names: "uploads[0]", about: "file" },
    { entry: { file: bytes, filename: "" }, names: "uploads[0].filename", about: "filename" },
    { entry: { file: bytes }, names: "uploads[0].filename", about: "filename" },
    { entry: { file: bytes, filename: "x", token: "7.aa" }, names: "uploads[0]", about: "token" },
  ])("an entry $entry is refused naming $names", async ({ entry, names, about }) => {
    const { rm, requests } = client(server());
    const error = await failure(rm.issues.update({ issue_id: 1, uploads: [entry] }));

    expect(error.data.kind).toBe("invalid_input");
    expect(error.op).toBe("updateIssue");
    expect(error.message).toContain(names);
    expect(error.message).toContain(about);
    expect(requests).toHaveLength(0);
  });

  test("the second entry is named when only it is wrong", async () => {
    const { rm, requests } = client(server());
    const error = await failure(
      rm.issues.update({ issue_id: 1, uploads: [file, { file: 42, filename: "x" }] }),
    );

    expect(error.message).toContain("uploads[1]");
    expect(requests).toHaveLength(0);
  });

  test("a non-admin key acting as another user is refused before the first upload", async () => {
    const { rm, requests } = client(keyOf("member", server()));
    const error = await failure(
      rm.issues.create({ project_id: 1, subject: "s", uploads: [file] }, { as: "jsmith" }),
    );

    expect(error.data).toMatchObject({ kind: "switch_user_rejected", reason: "not_admin" });
    expect(paths(requests)).toEqual(["GET users/current.json"]);
  });
});

describe("a failed call hands back its uploads", () => {
  const twoFiles = () => [
    { file: new Blob(["a"]), filename: "a" },
    { file: new Blob(["b"]), filename: "b" },
  ];

  test("a failed second upload keeps the first reference and the pending entry", async () => {
    let call = 0;
    const { rm, requests } = client(() =>
      ++call === 1 ? uploaded("1.t") : json({ errors: ["File is too big"] }, 422),
    );
    const input = { project_id: 1, subject: "s", uploads: twoFiles() };
    const error = await failure(rm.issues.create(input));

    expect(error.data).toMatchObject({ kind: "validation", messages: ["File is too big"] });
    expect(error.op).toBe("uploadAttachmentFile");
    expect(paths(requests)).toEqual([
      "POST uploads.json?filename=a",
      "POST uploads.json?filename=b",
    ]);
    expect(error.uploads).toEqual([{ token: "1.t", filename: "a" }, input.uploads[1]]);
    expect(error.uploads?.[1]).toBe(input.uploads[1]);
  });

  test("a failed first upload hands back the entries as given", async () => {
    const { rm, requests } = client(() => empty(503));
    const input = { project_id: 1, subject: "s", uploads: twoFiles() };
    const error = await failure(rm.issues.create(input));

    expect(error.data).toMatchObject({ kind: "http", status: 503 });
    expect(paths(requests)).toEqual(["POST uploads.json?filename=a"]);
    expect(error.uploads).toEqual(input.uploads);
    expect(error.uploads).not.toBe(input.uploads);
  });

  test("a refused record hands back every reference, and the retry uploads nothing again", async () => {
    let records = 0;
    const { rm, requests } = client(
      server(() =>
        ++records === 1 ? json({ errors: ["Subject cannot be blank"] }, 422) : json({ issue }, 201),
      ),
    );
    const input = { project_id: 1, subject: "", uploads: twoFiles() };
    const error = await failure(rm.issues.create(input));

    expect(error.op).toBe("createIssue");
    expect(error.uploads).toEqual([
      { token: "1.t", filename: "a" },
      { token: "2.t", filename: "b" },
    ]);
    expect(await rm.issues.create({ ...input, subject: "s", uploads: error.uploads })).toEqual(
      issue,
    );
    expect(paths(requests).slice(3)).toEqual(["POST issues.json"]);
    expect(requests[3]?.json()).toMatchObject({
      issue: { subject: "s", uploads: [{ token: "1.t" }, { token: "2.t" }] },
    });
  });

  test("an abort during the second upload keeps the first reference and sends no record", async () => {
    const controller = new AbortController();
    const { rm, requests } = client((request, call) =>
      call === 1 ? uploaded("1.t") : hang(request),
    );
    const pending = failure(
      rm.issues.create(
        { project_id: 1, subject: "s", uploads: twoFiles() },
        { signal: controller.signal },
      ),
    );
    while (requests.length < 2) await sleep(1);
    controller.abort();
    const error = await pending;

    expect(error.kind).toBe("aborted");
    expect(error.uploads?.[0]).toEqual({ token: "1.t", filename: "a" });
    expect(error.uploads?.[1]).toHaveProperty("file");
    expect(requests).toHaveLength(2);
  });

  test("the references stay out of JSON and out of the enumerable properties", async () => {
    const { rm } = client(server(() => json({ errors: ["Subject cannot be blank"] }, 422)));
    const error = await failure(
      rm.issues.create({ project_id: 1, subject: "", uploads: twoFiles() }),
    );

    expect(error.uploads).toHaveLength(2);
    expect(JSON.stringify(error)).not.toContain("1.t");
    expect(error.toJSON()).not.toHaveProperty("uploads");
    expect(Object.keys(error)).not.toContain("uploads");
  });

  test("frozen input is read, never written", async () => {
    const { rm } = client(server(() => json({ errors: ["no"] }, 422)));
    const entries = Object.freeze([Object.freeze({ file: bytes, filename: "a" })]);
    const input = Object.freeze({ project_id: 1, subject: "s", uploads: entries });
    const error = await failure(rm.issues.create(input));

    expect(entries).toEqual([{ file: bytes, filename: "a" }]);
    expect(error.uploads).toEqual([{ token: "1.t", filename: "a" }]);
    error.uploads?.push({ token: "2.t" });
    expect(entries).toHaveLength(1);
  });

  test("an error outside a call with files carries no uploads", async () => {
    const { rm } = client(() => json({ errors: ["no"] }, 422));
    const error = await failure(rm.issues.update({ issue_id: 1, uploads: [{ token: "7.aa" }] }));

    expect(error).toBeInstanceOf(RedmineError);
    expect(error.uploads).toBeUndefined();
  });
});

describe("streams, which are read once", () => {
  const stream = (): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });

  test("a stream uploads once, without a retry, and a failed one stays in error.uploads", async () => {
    const { rm, requests } = client(() => empty(503));
    const entry = { file: stream(), filename: "s.bin" };
    const error = await failure(
      rm.issues.create({ project_id: 1, subject: "s", uploads: [entry] }),
    );

    expect(error.data).toMatchObject({ kind: "http", status: 503 });
    expect(paths(requests)).toEqual(["POST uploads.json?filename=s.bin"]);
    expect([...(requests[0]?.bytes ?? [])]).toEqual([1, 2, 3, 4]);
    expect(error.uploads?.[0]).toBe(entry);
  });

  test("a retry with a stream the failed call read asks for new bytes and sends nothing", async () => {
    const { rm, requests } = client(() => {
      throw new TypeError("socket hang up");
    });
    const input = { project_id: 1, subject: "s", uploads: [{ file: stream(), filename: "s.bin" }] };
    const first = await failure(rm.issues.create(input));
    const retry = await failure(rm.issues.create({ ...input, uploads: first.uploads }));

    expect(first.kind).toBe("network");
    expect(retry.data.kind).toBe("invalid_input");
    expect(retry.message).toContain("uploads[0].file");
    expect(retry.message).toContain("pass the file again");
    expect(requests).toHaveLength(1);
  });

  test("after a failed stream, new bytes in its place upload only that file", async () => {
    let call = 0;
    const { rm, requests } = client((request) => {
      call++;
      if (call === 2) return empty(503);
      return request.url.pathname.endsWith("/uploads.json")
        ? uploaded(`${call}.t`)
        : json({ issue }, 201);
    });
    const input = {
      project_id: 1,
      subject: "s",
      uploads: [
        { file: new Blob(["a"]), filename: "a" },
        { file: stream(), filename: "b" },
      ],
    };
    const error = await failure(rm.issues.create(input));
    const uploads = error.uploads!.map((entry, at) =>
      at === 1 ? { file: new Blob(["b"]), filename: "b" } : entry,
    );
    await rm.issues.create({ ...input, uploads });

    expect(paths(requests)).toEqual([
      "POST uploads.json?filename=a",
      "POST uploads.json?filename=b",
      "POST uploads.json?filename=b",
      "POST issues.json",
    ]);
    expect(requests[3]?.json()).toMatchObject({
      issue: { uploads: [{ token: "1.t" }, { token: "3.t" }] },
    });
  });

  test("a stream that attachments.upload already sent is refused inline", async () => {
    const { rm, requests } = client(server());
    const file = stream();
    await rm.attachments.upload({ file, filename: "s.bin" });
    const error = await failure(
      rm.issues.create({ project_id: 1, subject: "s", uploads: [{ file, filename: "s.bin" }] }),
    );

    expect(error.message).toContain("uploads[0].file");
    expect(requests).toHaveLength(1);
  });

  test.each([
    { refusal: "access_denied", config: { access: "read-only" }, options: {} },
    { refusal: "aborted", config: {}, options: { signal: AbortSignal.abort() } },
  ])(
    "a stream that attachments.upload refused with $refusal uploads inline, and is refused once sent",
    async ({ refusal, config, options }) => {
      const bodies: unknown[] = [];
      const fetch = async (url: string, init: RequestInit): Promise<Response> => {
        bodies.push(init.body);
        return url.includes("/uploads.json") ? uploaded("1.t") : json({ issue }, 201);
      };
      const file = stream();
      const refused = await failure(
        client(server(), { fetch, ...config }).rm.attachments.upload(
          { file, filename: "s.bin" },
          options,
        ),
      );
      const { rm } = client(server(), { fetch });
      const input = { project_id: 1, subject: "s", uploads: [{ file, filename: "s.bin" }] };
      await rm.issues.create(input);
      const reused = await failure(rm.issues.create(input));

      expect(refused.data.kind).toBe(refusal);
      expect(bodies[0]).toBe(file);
      expect(file.locked).toBe(false);
      expect(reused.data.kind).toBe("invalid_input");
      expect(reused.message).toContain("uploads[0].file");
      expect(bodies).toHaveLength(2);
    },
  );

  test("the same stream twice in one call is refused before the first upload", async () => {
    const { rm, requests } = client(server());
    const file = stream();
    const error = await failure(
      rm.issues.create({
        project_id: 1,
        subject: "s",
        uploads: [
          { file, filename: "a" },
          { file, filename: "b" },
        ],
      }),
    );

    expect(error.data.kind).toBe("invalid_input");
    expect(error.message).toContain("uploads[1].file");
    expect(error.message).toContain("uploads[0].file");
    expect(requests).toHaveLength(0);
  });

  test("a stream in two calls at once uploads in the first and is refused in the second", async () => {
    const { rm, requests } = client(server());
    const file = stream();
    const input = { project_id: 1, subject: "s", uploads: [{ file, filename: "s.bin" }] };
    const [first, second] = await Promise.allSettled([
      rm.issues.create(input),
      rm.issues.create(input),
    ]);

    expect(first.status).toBe("fulfilled");
    const error = (second as PromiseRejectedResult).reason as RedmineError;
    expect(error.data.kind).toBe("invalid_input");
    expect(error.message).toContain("uploads[0].file");
    expect(paths(requests)).toEqual(["POST uploads.json?filename=s.bin", "POST issues.json"]);
  });

  test("a stream that an inline upload never sent uploads in a later call", async () => {
    const { rm, requests } = client(server());
    const file = stream();
    const input = { project_id: 1, subject: "s", uploads: [{ file, filename: "s.bin" }] };
    const aborted = await failure(rm.issues.create(input, { signal: AbortSignal.abort() }));
    await rm.issues.create(input);

    expect(aborted.data.kind).toBe("aborted");
    expect(paths(requests)).toEqual(["POST uploads.json?filename=s.bin", "POST issues.json"]);
  });

  test("a stream locked to a reader is refused before anything is sent", async () => {
    const { rm, requests } = client(server());
    const file = stream();
    file.getReader();
    const error = await failure(
      rm.issues.update({ issue_id: 1, uploads: [{ file, filename: "a" }] }),
    );

    expect(error.data.kind).toBe("invalid_input");
    expect(error.message).toContain("uploads[0].file");
    expect(requests).toHaveLength(0);
  });
});
