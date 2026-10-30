import { describe, expect, it } from "vite-plus/test";
import { MAX_CALLS, MAX_MATCHES, nameMatch, nameWords } from "../../src/workflow/people.ts";
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
    expect(match("Iv Petrov", "Ivan P.")).toBe(3);
    expect(match("Ivan Petrov", "Ivan")).toBe(3);
    expect(match("Jean-Pierre Dupont", "J.-P. Dupont")).toBe(3);
    expect(match("John Smith", "Smith, John")).toBe(0);
  });

  it("finds no one whose shown name only starts like a word of the query, or is initials alone", () => {
    expect(match("Anna Ivanova", "Ivan")).toBeUndefined();
    expect(match("Ivan Petrov", "Ivanov")).toBeUndefined();
    expect(match("Ivan Petrov", "Petr")).toBeUndefined();
    expect(match("Ivan Petrov", "P")).toBeUndefined();
    expect(match("Ivan Petrov", "I. P.")).toBeUndefined();
    expect(match("Petrov", "Ivan P.")).toBeUndefined();
  });

  it("finds a name that Redmine runs together only by its first part", () => {
    expect(match("Petrov", "PetrovIvan")).toBe(2);
    expect(match("Ivan Petrov", "PetrovIvan")).toBeUndefined();
    expect(match("Ivan", "PetrovIvan")).toBeUndefined();
  });

  it("ignores accents and other marks, in any script", () => {
    expect(match("Jose Garcia", "José García")).toBe(0);
    expect(match("семен петров", "Семён Петров")).toBe(0);
    expect(match("Семён", "Семен Петров")).toBe(1);
    expect(match("muller", "Hans Müller")).toBe(1);
    expect(match("ΜΑΡΊΑ", "Μαρία Παπαδοπούλου")).toBe(1);
  });

  it("spells in Latin the letters that have no accent to drop", () => {
    expect(nameWords("Łł Øø ẞß Iı Đđ Ðð Ħħ Ææ Œœ Þþ")).toEqual([
      "ll",
      "oo",
      "ssss",
      "ii",
      "dd",
      "dd",
      "hh",
      "aeae",
      "oeoe",
      "thth",
    ]);
    expect(match("lukasz", "Łukasz Nowak")).toBe(1);
    expect(match("ŁUKASZ", "lukasz nowak")).toBe(1);
    expect(match("soren", "Søren Holm")).toBe(1);
    expect(match("strauss", "Johann Strauß")).toBe(1);
    expect(match("isik", "Işık Yılmaz")).toBe(1);
    expect(match("dorde", "Đorđe Kovač")).toBe(1);
  });

  it("splits at punctuation but keeps an apostrophe inside a word, whichever apostrophe", () => {
    expect(nameWords("@jsmith")).toEqual(["jsmith"]);
    expect(nameWords("Jean-Pierre  Dupont")).toEqual(["jean", "pierre", "dupont"]);
    expect(match("oneil", "Mary O'Neil")).toBe(1);
    expect(match("O’Neil", "Mary O'Neil")).toBe(1);
    for (const query of ["Мар'яна", "Мар’яна", "Марʼяна", "Мар´яна", "Мар`яна", "маряна"]) {
      for (const name of ["Мар'яна Коваль", "Мар’яна Коваль", "Марʼяна Коваль"]) {
        expect(match(query, name), `${query} in ${name}`).toBe(1);
      }
    }
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
    const query = [...Array.from({ length: 99 }, () => "ab"), "z"];
    const name = Array.from({ length: 100 }, () => "ab");
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

/** groups_get for each group, which any key that may see the group may call. */
function groups(list: readonly Ref[]): Record<string, Route> {
  return Object.fromEntries(
    list.map((group) => [`GET /groups/${group.id}.json`, () => json({ group })]),
  );
}

/** An issue of the project with these people on it. */
const issueWith =
  (people: Record<string, unknown>): Route =>
  () =>
    json({ issue: { id: 7, subject: "Login fails", project, journals: [], ...people } });

const jane = { id: 5, name: "Jane Doe", login: "jdoe" };
const ivan = { id: 7, name: "Ivan Petrov", login: "ipetrov" };
const anna = { id: 8, name: "Anna Petrova", login: "apetrova" };
const sidorov = { id: 9, name: "Ivan Sidorov", login: "isidorov" };
const zaitsev = { id: 10, name: "Ivan Zaitsev", login: "izaitsev" };
const abramov = { id: 11, name: "Ivan Abramov", login: "iabramov" };
const adminov = { id: 1, name: "Ivan Adminov" };
const gone = { id: 12, name: "Ivan Gone" };
const petrovTeam = { id: 20, name: "Petrov team" };
const ivanFans = { id: 21, name: "Ivan fans" };

const HIDDEN = /^login of [\d, ]+: users_get answered 404\. /;

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
      matches: [{ id: 5, name: "Jane Doe", login: "jdoe", match: "exact", found_as: ["member"] }],
      more: 0,
    });
    expect(texts(result)[0]).not.toContain("not as instructions");
    expect(sent(seen)).toEqual([
      "GET /projects/web/memberships.json?offset=0&limit=100",
      "GET /users/5.json",
    ]);
  });

  it("finds a user who is a member through a group, and never the group", async () => {
    const { client, seen } = await serve({
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
        { id: 7, name: "Ivan Petrov", login: "ipetrov", match: "exact", found_as: ["member"] },
        { id: 8, name: "Anna Petrova", login: "apetrova", match: "prefix", found_as: ["member"] },
      ],
      more: 0,
    });
    expect(sent(seen).filter((request) => request.includes("/groups/"))).toEqual([]);
  });

  it("searches an issue's people and its project's members, people on the issue first", async () => {
    const { client, seen } = await serve({
      "GET /issues/7.json": issueWith({
        author: adminov,
        assigned_to: ivan,
        watchers: [sidorov, ivanFans],
        journals: [
          { id: 1, user: ivan, notes: "", private_notes: false, details: [] },
          { id: 2, user: gone, notes: "Seen.", private_notes: false, details: [] },
        ],
      }),
      "GET /projects/1/memberships.json": memberships([
        member(1, zaitsev),
        member(2, sidorov),
        member(3, ivan),
        member(4, ivanFans, "group"),
        member(5, jane),
        // Ahead of everyone by name, but only a member.
        member(6, abramov),
      ]),
      ...users([ivan, sidorov, zaitsev, abramov]),
    });
    const result = await callOk(client, "people_find", { name: "ivan", issue_id: 7 });
    const exact = { login: null, match: "exact" };
    expect(result.structuredContent).toEqual({
      matches: [
        { id: 1, name: "Ivan Adminov", ...exact, found_as: ["author"] },
        { id: 12, name: "Ivan Gone", ...exact, found_as: ["journal"] },
        {
          id: 7,
          name: "Ivan Petrov",
          login: "ipetrov",
          match: "exact",
          found_as: ["member", "assignee", "journal"],
        },
        {
          id: 9,
          name: "Ivan Sidorov",
          login: "isidorov",
          match: "exact",
          found_as: ["member", "watcher"],
        },
        { id: 11, name: "Ivan Abramov", login: "iabramov", match: "exact", found_as: ["member"] },
        { id: 10, name: "Ivan Zaitsev", login: "izaitsev", match: "exact", found_as: ["member"] },
      ],
      more: 0,
      unavailable: [expect.stringMatching(/^login of 1, 12: users_get answered 404\. /)],
    });
    expect(sent(seen).slice(0, 2)).toEqual([
      "GET /issues/7.json?include=watchers%2Cjournals",
      "GET /projects/1/memberships.json?offset=0&limit=100",
    ]);
    // An author and a journal user are users, so a 404 asks no groups_get.
    expect(sent(seen).slice(2).toSorted()).toEqual(
      [1, 10, 11, 12, 7, 9].map((id) => `GET /users/${id}.json`),
    );
  });

  it("drops a group that watches the issue or is its assignee without being a member", async () => {
    const zorkTeam = { id: 22, name: "Ivan Zork team" };
    const hiddenTeam = { id: 23, name: "Ivan hidden team" };
    const { client, seen } = await serve({
      "GET /issues/7.json": issueWith({
        author: ivan,
        assigned_to: petrovTeam,
        watchers: [zorkTeam, hiddenTeam],
      }),
      "GET /projects/1/memberships.json": memberships([member(1, ivan)]),
      ...users([ivan]),
      ...groups([petrovTeam, zorkTeam]),
    });
    const result = await callOk(client, "people_find", { name: "ivan", issue_id: 7 });
    // The key may not see the third group, so nothing tells it from a user the key may not see.
    expect(result.structuredContent).toEqual({
      matches: [
        { id: 23, name: "Ivan hidden team", login: null, match: "exact", found_as: ["watcher"] },
        {
          id: 7,
          name: "Ivan Petrov",
          login: "ipetrov",
          match: "exact",
          found_as: ["member", "author"],
        },
      ],
      more: 0,
      unavailable: [expect.stringMatching(/^login of 23: users_get answered 404\. /)],
    });
    expect(
      sent(seen)
        .filter((request) => request.includes("/groups/"))
        .toSorted(),
    ).toEqual(["GET /groups/22.json", "GET /groups/23.json"]);
  });

  it("drops a group assignee when the key may not read the members", async () => {
    const { client } = await serve({
      "GET /issues/7.json": issueWith({ author: ivan, assigned_to: petrovTeam, watchers: [] }),
      "GET /projects/1/memberships.json": () => json({}, 403),
      ...users([ivan]),
      ...groups([petrovTeam]),
    });
    const result = await callOk(client, "people_find", { name: "petrov", issue_id: 7 });
    expect(result.structuredContent).toEqual({
      matches: [
        { id: 7, name: "Ivan Petrov", login: "ipetrov", match: "exact", found_as: ["author"] },
      ],
      more: 0,
      unavailable: [expect.stringMatching(/^members: Redmine answered 403/)],
    });
  });

  it("gives the Anonymous user, which stands for deleted users, no login", async () => {
    const anonymous = { id: 4, name: "Anonymous" };
    const routes = {
      "GET /issues/7.json": issueWith({
        author: anonymous,
        watchers: [],
        journals: [{ id: 1, user: anonymous, notes: "Old.", private_notes: false, details: [] }],
      }),
      "GET /projects/1/memberships.json": memberships([]),
    };
    const expected = {
      id: 4,
      name: "Anonymous",
      login: null,
      match: "exact",
      found_as: ["author", "journal"],
    };
    // An admin key reads its empty login.
    const admin = await serve({
      ...routes,
      "GET /users/4.json": () =>
        json({
          user: {
            id: 4,
            login: "",
            firstname: "",
            lastname: "Anonymous",
            created_on: "2026-01-01T00:00:00Z",
            updated_on: "2026-01-01T00:00:00Z",
            last_login_on: null,
            passwd_changed_on: null,
            status: 0,
          },
        }),
    });
    const asAdmin = await callOk(admin.client, "people_find", { name: "anonymous", issue_id: 7 });
    expect(asAdmin.structuredContent).toEqual({
      matches: [expected],
      more: 0,
      unavailable: [
        "login of 4: none, because this is the Anonymous user, which Redmine shows in place of a deleted user. No mention reaches it.",
      ],
    });
    // Any other key gets a 404, which says that it may be the Anonymous user.
    const user = await serve(routes);
    const asUser = await callOk(user.client, "people_find", { name: "anonymous", issue_id: 7 });
    expect(asUser.structuredContent).toEqual({
      matches: [expected],
      more: 0,
      unavailable: [expect.stringMatching(HIDDEN)],
    });
    expect((asUser.structuredContent as { unavailable: string[] }).unavailable[0]).toContain(
      "the Anonymous user that takes the place of deleted users",
    );
    expect(sent(user.seen).filter((request) => request.includes("/groups/"))).toEqual([]);
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

  it("returns partial matches only when nothing matched better, and says they are partial", async () => {
    // Redmine shows the first one by an initial, the second by a first name alone.
    const ivanP = { id: 40, name: "Ivan P.", login: "ip" };
    const firstOnly = { id: 41, name: "Ivan", login: "ivan" };
    const ivanova = { id: 42, name: "Anna Ivanova", login: "aivanova" };
    const { client, seen } = await serve({
      "GET /projects/1/memberships.json": memberships(
        [ivanP, firstOnly, ivanova, ivan].map((person, n) => member(n + 1, person)),
      ),
      ...users([ivanP, firstOnly, ivanova, ivan]),
    });
    const better = await callOk(client, "people_find", { name: "Ivan Petrov", project_id: 1 });
    expect(better.structuredContent).toEqual({
      matches: [
        { id: 7, name: "Ivan Petrov", login: "ipetrov", match: "exact", found_as: ["member"] },
      ],
      more: 0,
    });
    const partial = await callOk(client, "people_find", { name: "Ivan Petrovich", project_id: 1 });
    expect(partial.structuredContent).toEqual({
      matches: [
        { id: 41, name: "Ivan", login: "ivan", match: "partial", found_as: ["member"] },
        { id: 40, name: "Ivan P.", login: "ip", match: "partial", found_as: ["member"] },
      ],
      more: 0,
    });
    expect(sent(seen).filter((request) => request.startsWith("GET /users/"))).toHaveLength(3);
  });

  it("returns a partial match when only a group watcher matched better", async () => {
    const ivanP = { id: 40, name: "Ivan P.", login: "ip" };
    const team = { id: 22, name: "Ivan Petrov team" };
    const { client } = await serve({
      "GET /issues/7.json": issueWith({ watchers: [team] }),
      "GET /projects/1/memberships.json": memberships([member(1, ivanP)]),
      ...users([ivanP]),
      ...groups([team]),
    });
    const result = await callOk(client, "people_find", { name: "Ivan Petrov", issue_id: 7 });
    expect(result.structuredContent).toEqual({
      matches: [{ id: 40, name: "Ivan P.", login: "ip", match: "partial", found_as: ["member"] }],
      more: 0,
    });
  });

  it(`looks up past group watchers until it finds ${MAX_MATCHES} users, and counts only the rest`, async () => {
    const teams = Array.from({ length: 3 }, (_, n) => ({ id: 80 + n, name: `Alex team ${n}` }));
    const alexes = Array.from({ length: 12 }, (_, n) => ({
      id: 30 + n,
      name: `Alex Number${String(n).padStart(2, "0")}`,
      login: `alex${n}`,
    }));
    const { client, seen } = await serve({
      "GET /issues/7.json": issueWith({ watchers: teams }),
      "GET /projects/1/memberships.json": memberships(alexes.map((alex, n) => member(n + 1, alex))),
      ...users(alexes),
      ...groups(teams),
    });
    const result = await callOk(client, "people_find", { name: "alex", issue_id: 7 });
    const { matches, more } = result.structuredContent as {
      matches: { login: string }[];
      more: number;
    };
    expect(matches.map(({ login }) => login)).toEqual(
      alexes.slice(0, MAX_MATCHES).map(({ login }) => login),
    );
    expect(more).toBe(2);
    expect(seen.length).toBeLessThanOrEqual(MAX_CALLS);
  });

  it(`stops looking up at ${MAX_CALLS} calls, and says what it left out`, async () => {
    const ivanP = { id: 40, name: "Ivan P.", login: "ip" };
    const teams = Array.from({ length: 13 }, (_, n) => ({
      id: 80 + n,
      name: `Ivan Petrov team ${n + 1}`,
    }));
    const { client, seen } = await serve({
      "GET /issues/7.json": issueWith({ watchers: teams }),
      "GET /projects/1/memberships.json": memberships([member(1, ivanP)]),
      ...users([ivanP]),
      ...groups(teams),
    });
    const result = await callOk(client, "people_find", { name: "Ivan Petrov", issue_id: 7 });
    expect(result.structuredContent).toEqual({
      matches: [],
      more: 4,
      unavailable: [expect.stringMatching(/^more: 4 were not looked up, because /)],
    });
    expect(seen.length).toBeLessThanOrEqual(MAX_CALLS);
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

  it.each([
    ["project_id", { project_id: 1 }, []],
    ["issue_id", { issue_id: 7 }, ["watchers: this key's user may not view the issue's watchers"]],
  ])("searches the members read before a page that fails, with %s", async (_, target, notes) => {
    const many = Array.from({ length: 600 }, (_, n) =>
      member(n + 1, { id: 1000 + n, name: `Member ${n}` }),
    );
    const pages = memberships(many);
    const { client } = await serve({
      "GET /issues/7.json": issueWith({}),
      "GET /projects/1/memberships.json": (request) =>
        request.url.searchParams.get("offset") === "200" ? json({}, 500) : pages(request),
      ...users([{ id: 1150, name: "Member 150", login: "m150" }]),
    });
    const result = await callOk(client, "people_find", { name: "member 150", ...target });
    expect(result.structuredContent).toEqual({
      matches: [
        { id: 1150, name: "Member 150", login: "m150", match: "exact", found_as: ["member"] },
      ],
      more: 0,
      unavailable: [
        ...notes,
        expect.stringMatching(
          /^members: only the first 200 were searched, because the page after them failed: Redmine answered 500/,
        ),
      ],
    });
  });

  it(`makes at most ${MAX_CALLS} calls, each retried up to twice`, async () => {
    const watchers = Array.from({ length: 12 }, (_, n) => ({ id: 70 + n, name: `Zed ${n + 10}` }));
    const many = Array.from({ length: 600 }, (_, n) =>
      member(n + 1, { id: 1000 + n, name: `Member ${n}` }),
    );
    // Every call answers 503 twice, then as it would. users_get finds none of the watchers, and
    // groups_get finds the even ones.
    const tries = new Map<string, number>();
    const busy =
      (route: Route): Route =>
      (request) => {
        const key = `${request.url.pathname}${request.url.search}`;
        tries.set(key, (tries.get(key) ?? 0) + 1);
        return tries.get(key)! <= 2 ? json({}, 503) : route(request);
      };
    const routes: Record<string, Route> = {
      "GET /issues/7.json": busy(issueWith({ author: jane, watchers })),
      "GET /projects/1/memberships.json": busy(memberships(many)),
    };
    for (const { id, name } of watchers) {
      routes[`GET /users/${id}.json`] = busy(() => json({}, 404));
      routes[`GET /groups/${id}.json`] = busy(() =>
        id % 2 === 0 ? json({ group: { id, name } }) : json({}, 404),
      );
    }
    const { client, seen } = await serve(routes, { retry: { baseMs: 0 } });
    const result = await callOk(client, "people_find", { name: "zed", issue_id: 7 });
    expect(result.structuredContent).toEqual({
      matches: [71, 73, 75, 77, 79].map((id) => ({
        id,
        name: `Zed ${id - 60}`,
        login: null,
        match: "exact",
        found_as: ["watcher"],
      })),
      more: 2,
      unavailable: [
        "members: only the first 500 were searched; memberships_list pages through all of them",
        expect.stringMatching(/^login of 71, 73, 75, 77, 79: users_get answered 404\. /),
        expect.stringMatching(/^more: 2 were not looked up, because /),
      ],
    });
    expect(MAX_CALLS).toBe(26);
    expect(seen).toHaveLength(3 * MAX_CALLS);
    const { tools } = await client.listTools();
    const description = tools.find((tool) => tool.name === "people_find")?.description;
    expect(description).toContain(`Makes at most ${MAX_CALLS} calls: `);
    expect(description).toContain("the SDK retries each call up to twice");
  });

  it("marks a locked user, which only an admin key learns", async () => {
    const { client } = await serve({
      "GET /projects/1/memberships.json": memberships([member(1, jane)]),
      ...users([{ ...jane, status: 3 }]),
    });
    const result = await callOk(client, "people_find", { name: "Jane", project_id: 1 });
    expect(result.structuredContent).toEqual({
      matches: [
        {
          id: 5,
          name: "Jane Doe",
          login: "jdoe",
          match: "exact",
          found_as: ["member"],
          locked: true,
        },
      ],
      more: 0,
    });
  });

  it("searches the rest of an issue when the key may not see its watchers or members", async () => {
    const { client } = await serve({
      "GET /issues/7.json": issueWith({ author: jane }),
      "GET /projects/1/memberships.json": () => json({}, 403),
      ...users([jane]),
    });
    const result = await callOk(client, "people_find", { name: "Jane Doe", issue_id: 7 });
    expect(result.structuredContent).toEqual({
      matches: [{ id: 5, name: "Jane Doe", login: "jdoe", match: "exact", found_as: ["author"] }],
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
      matches: [{ id: 5, name: "Jane Doe", login: null, match: "exact", found_as: ["member"] }],
      more: 0,
      unavailable: [expect.stringMatching(/^login of 5: Redmine answered 403/)],
    });
  });

  it("fails when a project's first page of members cannot be read", async () => {
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
