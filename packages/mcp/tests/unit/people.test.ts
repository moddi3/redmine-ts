import { describe, expect, it } from "vite-plus/test";
import { MAX_MATCHES, nameMatch, nameWords } from "../../src/workflow/people.ts";
import { lastJson, texts } from "../connect.ts";
import { callError, callOk, json, sent, serve } from "./harness.ts";
import type { Route } from "./harness.ts";

const match = (query: string, name: string): number | undefined =>
  nameMatch(nameWords(query), nameWords(name));

describe("name matching", () => {
  it("ignores case and word order", () => {
    expect(match("petrov IVAN", "Ivan Petrov")).toBe(0);
    expect(match("Ivan Petrov", "Petrov Ivan")).toBe(0);
  });

  it("ranks the same words, then whole words, then starts of words, then a longer query", () => {
    expect(match("Ivan Petrov", "Ivan Petrov")).toBe(0);
    expect(match("Petrov", "Ivan Petrov")).toBe(1);
    expect(match("Iv Pet", "Ivan Petrov")).toBe(2);
    expect(match("Ivan Ivanovich Petrov", "Ivan Petrov")).toBe(3);
  });

  it("finds a name that Redmine shows with an initial or one part only", () => {
    expect(match("Ivan Petrov", "Ivan P.")).toBe(3);
    expect(match("Ivan Petrov", "I. Petrov")).toBe(3);
    expect(match("Ivan Petrov", "Ivan")).toBe(3);
    expect(match("John Smith", "Smith, John")).toBe(0);
  });

  it("ignores accents and other marks, in any script", () => {
    expect(match("Jose Garcia", "José García")).toBe(0);
    expect(match("семен петров", "Семён Петров")).toBe(0);
    expect(match("Семён", "Семен Петров")).toBe(1);
    expect(match("muller", "Hans Müller")).toBe(1);
    expect(match("ΜΑΡΊΑ", "Μαρία Παπαδοπούλου")).toBe(1);
  });

  it("splits at punctuation but keeps an apostrophe inside a word", () => {
    expect(nameWords("@jsmith")).toEqual(["jsmith"]);
    expect(nameWords("Jean-Pierre  Dupont")).toEqual(["jean", "pierre", "dupont"]);
    expect(match("oneil", "Mary O'Neil")).toBe(1);
    expect(match("O’Neil", "Mary O'Neil")).toBe(1);
  });

  it("matches a word only from its start", () => {
    expect(match("van", "Ivan Petrov")).toBeUndefined();
    expect(match("王", "王小明")).toBe(2);
    expect(match("小明", "王小明")).toBeUndefined();
  });

  it("refuses a query with a word the name lacks, or a word twice", () => {
    expect(match("Ivan Sidorov", "Ivan Petrov")).toBeUndefined();
    expect(match("Ivan Ivan", "Ivan Petrov")).toBeUndefined();
    expect(match("I P Smith", "Ivan Petrov")).toBeUndefined();
    expect(match("Ivan", "Иван Петров")).toBeUndefined();
    expect(match("Ivan", "")).toBeUndefined();
    expect(match("...", "Ivan Petrov")).toBeUndefined();
  });

  it("pairs each word with a different one where taking the first fit would fail", () => {
    // "a" fits "ab" first, which "ab" needs; "a" has to move to "ac".
    expect(match("A Ab", "Ab Ac")).toBe(2);
  });

  it("ends on a long query that almost fits, which trying every order would not", () => {
    const query = [...Array.from({ length: 99 }, () => "a"), "z"];
    const name = Array.from({ length: 100 }, () => "a");
    expect(nameMatch(query, name)).toBeUndefined();
  });
});

const project = { id: 1, name: "Web" };

type Ref = { id: number; name: string };

const member = (id: number, principal: Ref, kind: "user" | "group" = "user") => ({
  id,
  project,
  [kind]: principal,
  roles: [{ id: 4, name: "Developer" }],
});

/** The project's memberships, paged as Redmine pages them. */
const memberships =
  (list: readonly unknown[]): Route =>
  ({ url }) => {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    return json({
      memberships: list.slice(offset, offset + limit),
      total_count: list.length,
      offset,
      limit,
    });
  };

/** users_get for each person: their login, and status for an admin key. */
function users(
  people: readonly (Ref & { login: string; status?: number })[],
): Record<string, Route> {
  return Object.fromEntries(
    people.map(({ id, name, login, status }) => {
      const [firstname = "", lastname = ""] = name.split(" ");
      const user = {
        id,
        login,
        firstname,
        lastname,
        created_on: "2026-01-01T00:00:00Z",
        updated_on: "2026-01-01T00:00:00Z",
        last_login_on: null,
        passwd_changed_on: null,
        ...(status === undefined ? {} : { status }),
      };
      return [`GET /users/${id}.json`, () => json({ user })];
    }),
  );
}

const jane = { id: 5, name: "Jane Doe", login: "jdoe" };
const ivan = { id: 7, name: "Ivan Petrov", login: "ipetrov" };
const anna = { id: 8, name: "Anna Petrova", login: "apetrova" };
const sidorov = { id: 9, name: "Ivan Sidorov", login: "isidorov" };
const zaitsev = { id: 10, name: "Ivan Zaitsev", login: "izaitsev" };
const adminov = { id: 1, name: "Ivan Adminov" };
const gone = { id: 12, name: "Ivan Gone" };
const petrovTeam = { id: 20, name: "Petrov team" };
const ivanFans = { id: 21, name: "Ivan fans" };

describe("people_find", () => {
  it("finds a project's members by name in any word order, with the login of each match only", async () => {
    const { client, seen } = await serve({
      "GET /projects/web/memberships.json": memberships([
        member(1, jane),
        member(2, ivan),
        member(3, anna),
      ]),
      ...users([jane, ivan, anna]),
    });
    const result = await callOk(client, "people_find", { name: "doe JANE", project_id: "web" });
    expect(result.structuredContent).toEqual({
      matches: [{ id: 5, name: "Jane Doe", login: "jdoe", found_as: ["member"] }],
      more: 0,
    });
    expect(texts(result)[0]).not.toContain("not as instructions");
    expect(sent(seen)).toEqual([
      "GET /projects/web/memberships.json?offset=0&limit=100",
      "GET /users/5.json",
    ]);
  });

  it("finds a user who is a member through a group, and never the group", async () => {
    const { client } = await serve({
      "GET /projects/1/memberships.json": memberships([
        member(1, petrovTeam, "group"),
        member(101, anna),
        member(2, ivan),
        member(3, jane),
      ]),
      ...users([ivan, anna]),
    });
    const result = await callOk(client, "people_find", { name: "Petrov", project_id: 1 });
    expect(result.structuredContent).toEqual({
      matches: [
        { id: 7, name: "Ivan Petrov", login: "ipetrov", found_as: ["member"] },
        { id: 8, name: "Anna Petrova", login: "apetrova", found_as: ["member"] },
      ],
      more: 0,
    });
  });

  it("searches an issue's people and its project's members, people on the issue first", async () => {
    const { client, seen } = await serve({
      "GET /issues/7.json": () =>
        json({
          issue: {
            id: 7,
            subject: "Login fails",
            project,
            author: adminov,
            assigned_to: ivan,
            watchers: [sidorov, ivanFans],
            journals: [
              { id: 1, user: ivan, notes: "", private_notes: false, details: [] },
              { id: 2, user: gone, notes: "Seen.", private_notes: false, details: [] },
            ],
          },
        }),
      "GET /projects/1/memberships.json": memberships([
        member(1, zaitsev),
        member(2, sidorov),
        member(3, ivan),
        member(4, ivanFans, "group"),
        member(5, jane),
      ]),
      ...users([ivan, sidorov, zaitsev]),
    });
    const result = await callOk(client, "people_find", { name: "ivan", issue_id: 7 });
    expect(result.structuredContent).toEqual({
      matches: [
        { id: 1, name: "Ivan Adminov", login: null, found_as: ["author"] },
        { id: 12, name: "Ivan Gone", login: null, found_as: ["journal"] },
        {
          id: 7,
          name: "Ivan Petrov",
          login: "ipetrov",
          found_as: ["member", "assignee", "journal"],
        },
        { id: 9, name: "Ivan Sidorov", login: "isidorov", found_as: ["member", "watcher"] },
        { id: 10, name: "Ivan Zaitsev", login: "izaitsev", found_as: ["member"] },
      ],
      more: 0,
      unavailable: [expect.stringMatching(/^login of 1, 12: users_get answered 404\. /)],
    });
    expect(sent(seen).slice(0, 2)).toEqual([
      "GET /issues/7.json?include=watchers%2Cjournals",
      "GET /projects/1/memberships.json?offset=0&limit=100",
    ]);
    expect(sent(seen).slice(2).toSorted()).toEqual(
      [1, 10, 12, 7, 9].map((id) => `GET /users/${id}.json`),
    );
  });

  it(`returns the best ${MAX_MATCHES} matches with their logins and counts the rest`, async () => {
    const alexes = Array.from({ length: 15 }, (_, n) => ({
      id: 30 + n,
      name: `Alex Number${String(n).padStart(2, "0")}`,
      login: `alex${n}`,
    }));
    const exact = { id: 60, name: "Alex", login: "alex" };
    const { client, seen } = await serve({
      "GET /projects/1/memberships.json": memberships(
        [...alexes, exact].map((person, n) => member(n + 1, person)),
      ),
      ...users([...alexes, exact]),
    });
    const result = await callOk(client, "people_find", { name: "alex", project_id: 1 });
    const { matches, more } = result.structuredContent as {
      matches: { id: number; login: string }[];
      more: number;
    };
    expect(matches).toHaveLength(MAX_MATCHES);
    expect(matches[0]).toMatchObject({ id: 60, login: "alex" });
    expect(matches.slice(1).map(({ login }) => login)).toEqual(
      alexes.slice(0, MAX_MATCHES - 1).map(({ login }) => login),
    );
    expect(more).toBe(6);
    expect(sent(seen).filter((request) => request.startsWith("GET /users/"))).toHaveLength(
      MAX_MATCHES,
    );
  });

  it("reads at most 5 pages of members, and says when it stopped", async () => {
    const many = Array.from({ length: 600 }, (_, n) =>
      member(n + 1, { id: 1000 + n, name: n === 550 ? "Zed Last" : `Member ${n}` }),
    );
    const { client, seen } = await serve({
      "GET /projects/1/memberships.json": memberships(many),
    });
    const result = await callOk(client, "people_find", { name: "zed", project_id: 1 });
    expect(result.structuredContent).toEqual({
      matches: [],
      more: 0,
      unavailable: [
        "members: only the first 500 were searched; memberships_list pages through all of them",
      ],
    });
    expect(sent(seen)).toEqual(
      [0, 100, 200, 300, 400].map(
        (offset) => `GET /projects/1/memberships.json?offset=${offset}&limit=100`,
      ),
    );
  });

  it("reads 5 pages and says nothing for a project of exactly 500 members", async () => {
    const many = Array.from({ length: 500 }, (_, n) =>
      member(n + 1, { id: 1000 + n, name: `Member ${n}` }),
    );
    const { client, seen } = await serve({
      "GET /projects/1/memberships.json": memberships(many),
    });
    const result = await callOk(client, "people_find", { name: "zed", project_id: 1 });
    expect(result.structuredContent).toEqual({ matches: [], more: 0 });
    expect(seen).toHaveLength(5);
  });

  it("marks a locked user, which only an admin key learns", async () => {
    const { client } = await serve({
      "GET /projects/1/memberships.json": memberships([member(1, jane)]),
      ...users([{ ...jane, status: 3 }]),
    });
    const result = await callOk(client, "people_find", { name: "Jane", project_id: 1 });
    expect(result.structuredContent).toEqual({
      matches: [{ id: 5, name: "Jane Doe", login: "jdoe", found_as: ["member"], locked: true }],
      more: 0,
    });
  });

  it("searches the rest of an issue when the key may not see its watchers or members", async () => {
    const { client } = await serve({
      "GET /issues/7.json": () =>
        json({ issue: { id: 7, subject: "Login fails", project, author: jane, journals: [] } }),
      "GET /projects/1/memberships.json": () => json({}, 403),
      ...users([jane]),
    });
    const result = await callOk(client, "people_find", { name: "Jane Doe", issue_id: 7 });
    expect(result.structuredContent).toEqual({
      matches: [{ id: 5, name: "Jane Doe", login: "jdoe", found_as: ["author"] }],
      more: 0,
      unavailable: [
        "watchers: this key's user may not view the issue's watchers",
        expect.stringMatching(/^members: Redmine answered 403/),
      ],
    });
  });

  it("names any other failure to read a login", async () => {
    const { client } = await serve({
      "GET /projects/1/memberships.json": memberships([member(1, jane)]),
      "GET /users/5.json": () => json({}, 403),
    });
    const result = await callOk(client, "people_find", { name: "Jane", project_id: 1 });
    expect(result.structuredContent).toEqual({
      matches: [{ id: 5, name: "Jane Doe", login: null, found_as: ["member"] }],
      more: 0,
      unavailable: [expect.stringMatching(/^login of 5: Redmine answered 403/)],
    });
  });

  it("fails when a project's members cannot be read", async () => {
    const { client } = await serve({ "GET /projects/1/memberships.json": () => json({}, 403) });
    const result = await callError(client, "people_find", { name: "Jane", project_id: 1 });
    expect(texts(result)[0]).toBe(
      "Redmine answered 403 for people_find: the key's user lacks the permission, or the REST API is disabled.",
    );
  });

  it.each([
    [{ name: "Jane" }, "pass project_id or issue_id, one of them"],
    [{ name: "Jane", project_id: 1, issue_id: 7 }, "pass project_id or issue_id, one of them"],
    [{ name: " @. ", project_id: 1 }, 'name " @. " has no letter or digit to match'],
  ])("refuses %j before sending anything", async (args, detail) => {
    const { client, seen } = await serve({});
    const result = await callError(client, "people_find", args);
    expect(lastJson(result)).toMatchObject({ kind: "invalid_input", detail });
    expect(seen).toEqual([]);
  });
});
