import { describe, expect, test } from "vite-plus/test";
import { catalog } from "../../src/catalog.ts";
import { createRedmine } from "../../src/index.ts";
import type { Access, RawRequest } from "../../src/index.ts";
import { BASE_URL, empty, failure, fakeFetch, json } from "./fixtures/fake-fetch.ts";

const membership = {
  id: 16,
  roles: [
    { id: 3, name: "Manager" },
    { id: 4, name: "Developer", inherited: true },
  ],
};

function client<A extends Access>(access: A, baseUrl = BASE_URL) {
  const fake = fakeFetch((request) => {
    if (request.url.pathname.endsWith("/uploads.json")) {
      return json({ upload: { id: 9, token: "9.t" } }, 201);
    }
    return request.method === "GET" ? json({ membership }) : empty();
  });
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
    expect(error.message).toContain("Nothing was changed");
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

describe("no-delete reads a membership before an update that names roles", () => {
  const sent = (requests: ReturnType<typeof client>["requests"]) =>
    requests.map(({ method, url }) => `${method} ${url.pathname}`);
  const update = (role_ids: unknown[]) =>
    ({
      method: "PUT",
      path: "memberships/16.json",
      body: { membership: { role_ids } },
    }) as const;

  test("refuses role_ids that keep no current role, and sends only the read", async () => {
    const { rm, requests } = client("no-delete");
    const error = await failure(rm.memberships.update({ membership_id: 16, role_ids: [999999] }));

    expect(error.data).toMatchObject({
      kind: "access_denied",
      access: "no-delete",
      method: "PUT",
      deletes: expect.stringContaining("role_ids"),
    });
    expect(sent(requests)).toEqual(["GET /redmine/memberships/16.json"]);
  });

  test.each([
    ["a role id Redmine reads another way", ["3x"]],
    ["a role id that is not a number", [true]],
  ])("refuses %s through rm.request", async (_name, role_ids) => {
    const { rm, requests } = client("no-delete");
    const error = await failure(rm.request(update(role_ids)));

    expect(error.data).toMatchObject({ kind: "access_denied", deletes: expect.any(String) });
    expect(sent(requests)).toEqual(["GET /redmine/memberships/16.json"]);
  });

  test.each([
    ["a direct role", [5, 3]],
    ["an inherited role", [4]],
    ["a role id as a string", ["3"]],
  ])("sends role_ids that keep %s", async (_name, role_ids) => {
    const { rm, requests } = client("no-delete");
    await rm.request(update(role_ids));

    expect(sent(requests)).toEqual([
      "GET /redmine/memberships/16.json",
      "PUT /redmine/memberships/16.json",
    ]);
  });

  test("reads the membership as JSON when rm.request names it as XML", async () => {
    const { rm, requests } = client("no-delete");
    const error = await failure(
      rm.request({ ...update([999999]), method: "PATCH", path: "memberships/16.xml" }),
    );

    expect(error.data).toMatchObject({ kind: "access_denied", deletes: expect.any(String) });
    expect(sent(requests)).toEqual(["GET /redmine/memberships/16.json"]);
  });

  test("a failed read fails the call with the read's error, and the update is not sent", async () => {
    const fake = fakeFetch(() => json({ errors: [] }, 404));
    const rm = createRedmine({
      baseUrl: BASE_URL,
      auth: { apiKey: "secret-key" },
      fetch: fake.fetch,
      access: "no-delete",
    });
    const error = await failure(rm.memberships.update({ membership_id: 16, role_ids: [3] }));

    expect(error.data.kind).toBe("not_found");
    expect(error.op).toBe("getMembership");
    expect(sent(fake.requests)).toEqual(["GET /redmine/memberships/16.json"]);
  });

  test("full access sends without the read", async () => {
    const { rm, requests } = client("full");
    await rm.memberships.update({ membership_id: 16, role_ids: [999999] });

    expect(sent(requests)).toEqual(["PUT /redmine/memberships/16.json"]);
  });
});
