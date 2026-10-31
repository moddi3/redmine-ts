import { describe, expect, test } from "vite-plus/test";
import { catalog } from "../../src/catalog.ts";
import { createRedmine } from "../../src/index.ts";
import type { Access, RawRequest } from "../../src/index.ts";
import { BASE_URL, empty, failure, fakeFetch, json } from "./fixtures/fake-fetch.ts";

function client<A extends Access>(access: A, baseUrl = BASE_URL) {
  const fake = fakeFetch((request) =>
    request.url.pathname.endsWith("/uploads.json")
      ? json({ upload: { id: 9, token: "9.t" } }, 201)
      : empty(),
  );
  const rm = createRedmine({ baseUrl, auth: { apiKey: "secret-key" }, fetch: fake.fetch, access });
  return { rm, requests: fake.requests };
}

type Rm = ReturnType<typeof client<"no-delete">>["rm"];

const deleting: Record<string, (rm: Rm) => Promise<unknown>> = {
  "journals.update with empty notes": (rm) => rm.journals.update({ journal_id: 1, notes: "" }),
  "journals.update with whitespace notes": (rm) =>
    rm.journals.update({ journal_id: 1, notes: " \n" }),
  "journals.update with null notes": (rm) => rm.journals.update({ journal_id: 1, notes: null }),
  "memberships.update with empty role_ids": (rm) =>
    rm.memberships.update({ membership_id: 1, role_ids: [] }),
  "issues.update with deleted_attachment_ids": (rm) =>
    rm.issues.update({ issue_id: 1, deleted_attachment_ids: [5] }),
  "wiki.update with deleted_attachment_ids": (rm) =>
    rm.wiki.update({
      project_id: "ops",
      wiki_page_title: "Runbook",
      text: "t",
      deleted_attachment_ids: [5],
    }),
};

const keeping: Record<string, (rm: Rm) => Promise<unknown>> = {
  "journals.update with notes": (rm) => rm.journals.update({ journal_id: 1, notes: "Fixed" }),
  "journals.update without notes": (rm) =>
    rm.journals.update({ journal_id: 1, private_notes: true }),
  "memberships.update with role_ids": (rm) =>
    rm.memberships.update({ membership_id: 1, role_ids: [3] }),
  "issues.update without deleted_attachment_ids": (rm) =>
    rm.issues.update({ issue_id: 1, notes: "n" }),
  "issues.update with empty deleted_attachment_ids": (rm) =>
    rm.issues.update({ issue_id: 1, deleted_attachment_ids: [] }),
  "wiki.update without deleted_attachment_ids": (rm) =>
    rm.wiki.update({ project_id: "ops", wiki_page_title: "Runbook", text: "t" }),
  "wiki.update with empty deleted_attachment_ids": (rm) =>
    rm.wiki.update({
      project_id: "ops",
      wiki_page_title: "Runbook",
      text: "t",
      deleted_attachment_ids: [],
    }),
};

describe("no-delete refuses updates that delete", () => {
  test.each(Object.keys(deleting))("%s", async (name) => {
    const { rm, requests } = client("no-delete");
    const error = await failure(deleting[name]!(rm));

    expect(error.data).toMatchObject({
      kind: "access_denied",
      access: "no-delete",
      method: "PUT",
      deletes: expect.any(String),
    });
    expect(error.message).toContain("nothing was sent");
    expect(requests).toHaveLength(0);
  });

  test.each(Object.keys(keeping))("%s is sent", async (name) => {
    const { rm, requests } = client("no-delete");
    await keeping[name]!(rm);

    expect(requests.map((request) => request.method)).toEqual(["PUT"]);
  });

  test.each(Object.keys(deleting))("full access sends %s", async (name) => {
    const { rm, requests } = client("full");
    await deleting[name]!(rm as Rm);

    expect(requests.map((request) => request.method)).toEqual(["PUT"]);
  });

  test("an update with files to upload is refused before the first upload", async () => {
    const { rm, requests } = client("no-delete");
    const error = await failure(
      rm.issues.update({
        issue_id: 1,
        deleted_attachment_ids: [5],
        uploads: [{ file: new Uint8Array([1]), filename: "a.bin" }],
      }),
    );

    expect(error.data).toMatchObject({ kind: "access_denied", deletes: expect.any(String) });
    expect(requests).toHaveLength(0);
  });

  test("a switched user is refused before the admin check", async () => {
    const { rm, requests } = client("no-delete");
    const error = await failure(
      rm.with({ as: "jsmith" }).memberships.update({ membership_id: 1, role_ids: [] }),
    );

    expect(error.data).toMatchObject({ kind: "access_denied", deletes: expect.any(String) });
    expect(requests).toHaveLength(0);
  });

  test("only issues and wiki pages take deleted_attachment_ids", () => {
    const taking = catalog.filter((entry) => entry.inputSchema.properties?.deleted_attachment_ids);

    expect(taking.map((entry) => entry.id)).toEqual(["updateIssue", "updateWikiPage"]);
  });
});

describe("no-delete reads rm.request as Redmine routes it", () => {
  type Raw = RawRequest<"GET" | "POST" | "PUT" | "PATCH">;
  const refused: Record<string, Raw> = {
    "blank notes": { method: "PUT", path: "journals/1.json", body: { journal: { notes: "" } } },
    "PATCH and .xml": {
      method: "PATCH",
      path: "journals/1.xml",
      body: { journal: { notes: null } },
    },
    "a membership without role_ids": {
      method: "PUT",
      path: "memberships/1.json",
      body: { membership: {} },
    },
    "a scalar deleted_attachment_ids": {
      method: "PUT",
      path: "issues/1.json",
      body: { issue: { deleted_attachment_ids: 5 } },
    },
    "doubled and trailing slashes": {
      method: "PUT",
      path: "projects/ops/wiki//Runbook.json/",
      body: { wiki_page: { deleted_attachment_ids: [5] } },
    },
    "an envelope field in the query": {
      method: "PUT",
      path: "issues/1.json",
      query: { "issue[deleted_attachment_ids]": [5] },
    },
  };
  const sent: Record<string, Raw> = {
    notes: { method: "PUT", path: "journals/1.json", body: { journal: { notes: "Fixed" } } },
    "another field": { method: "PUT", path: "issues/1.json", body: { issue: { subject: "s" } } },
    "another route": {
      method: "PUT",
      path: "journals/1/extra.json",
      body: { journal: { notes: "" } },
    },
    "a POST": {
      method: "POST",
      path: "issues/1.json",
      body: { issue: { deleted_attachment_ids: [5] } },
    },
  };

  test.each(Object.keys(refused))("refuses %s", async (name) => {
    const { rm, requests } = client("no-delete");
    const error = await failure(rm.request(refused[name]!));

    expect(error.op).toBe("request");
    expect(error.data).toMatchObject({ kind: "access_denied", deletes: expect.any(String) });
    expect(requests).toHaveLength(0);
  });

  test.each(Object.keys(sent))("sends %s", async (name) => {
    const { rm, requests } = client("no-delete");
    await rm.request(sent[name]!);

    expect(requests).toHaveLength(1);
  });

  test("routes are read relative to a base URL at the root too", async () => {
    const { rm, requests } = client("no-delete", "https://tracker.example.com");
    const error = await failure(rm.request(refused["blank notes"]!));

    expect(error.data).toMatchObject({ kind: "access_denied", deletes: expect.any(String) });
    expect(requests).toHaveLength(0);
  });
});
