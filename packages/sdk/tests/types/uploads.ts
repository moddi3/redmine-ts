// Typechecked by `vp check`, never executed.

import {
  createRedmine,
  RedmineError,
  type CreateIssueInput,
  type InlineUpload,
  type UploadEntry,
  type UploadRef,
} from "../../src/index.ts";
import { inlineUploadsFitAccess, type WritesWithoutPost } from "../../src/redmine.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const equal = <A, B>(proof: Equal<A, B>) => proof;

const rm = createRedmine({ baseUrl: "https://tracker.example.com/redmine" });
const reader = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  access: "read-only",
});
declare const ref: UploadRef;
declare const stream: ReadableStream<Uint8Array>;
const bytes = new Uint8Array([1]);

export async function everyUploadMethod() {
  const created = await rm.issues.create({
    project_id: "web",
    subject: "Crash on save",
    uploads: [
      { file: new Blob(["log"]), filename: "a.log", content_type: "text/plain" },
      { file: bytes, filename: "b.bin", description: "dump" },
      { file: bytes.buffer, filename: "c.bin" },
      { file: stream, filename: "d.bin" },
      ref,
      { token: "7.aa" },
    ],
  });
  await rm.issues.update({ issue_id: created.id, uploads: [ref, { file: bytes, filename: "e" }] });
  await rm.news.create({
    project_id: "web",
    title: "t",
    description: "d",
    uploads: [{ file: bytes, filename: "n" }],
  });
  await rm.news.update({ news_id: 1, uploads: [{ file: bytes, filename: "n" }] });
  await rm.wiki.update({
    project_id: "web",
    wiki_page_title: "Home",
    text: "x",
    uploads: [{ file: bytes, filename: "w" }],
  });
}

export async function retryWithErrorUploads(input: CreateIssueInput) {
  try {
    await rm.issues.create(input);
  } catch (error) {
    if (!(error instanceof RedmineError) || error.uploads === undefined) throw error;
    equal<typeof error.uploads, UploadEntry[]>(true);
    await rm.issues.create({ ...input, uploads: error.uploads });
  }
}

export function inputStaysMutable(input: CreateIssueInput) {
  input.uploads?.push(ref);
  input.uploads?.push({ file: bytes, filename: "late.log" });
  const entries: UploadEntry[] = [ref];
  entries.push({ file: bytes, filename: "x" });
  return entries;
}

export async function refusedShapes() {
  // @ts-expect-error a file entry has no token
  await rm.issues.update({ issue_id: 1, uploads: [{ file: bytes, filename: "a", token: "7.aa" }] });
  // @ts-expect-error a file entry needs a filename
  await rm.issues.update({ issue_id: 1, uploads: [{ file: bytes }] });
  // @ts-expect-error file takes bytes, not text
  await rm.issues.update({ issue_id: 1, uploads: [{ file: "text", filename: "a" }] });
  // @ts-expect-error files.create takes one token, not uploads
  await rm.files.create({ project_id: "web", token: ref.token, uploads: [ref] });
  // @ts-expect-error a read-only client has no create
  await reader.issues.create({ project_id: "web", subject: "s", uploads: [ref] });
}

export const inline: InlineUpload = { file: bytes, filename: "a" };
// @ts-expect-error an InlineUpload never carries a token
export const tokened: InlineUpload = { file: bytes, filename: "a", token: "7.aa" };

export const accessFits: true = inlineUploadsFitAccess;
export const putWithoutPost = equal<WritesWithoutPost<{ odd: "GET" | "PUT"; ok: "POST" }>, "odd">(
  true,
);
export const patchWithoutPost = equal<WritesWithoutPost<{ odd: "PATCH" }>, "odd">(true);
export const readsOnly = equal<WritesWithoutPost<{ reads: "GET" }>, never>(true);
