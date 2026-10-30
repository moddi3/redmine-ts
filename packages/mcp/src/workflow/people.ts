// people_find: the people a name means in a project or on an issue, with the login an @mention takes.
// users_list would search every user, but Redmine answers it to admins only. Any key that sees a
// project may read its members, and users_get returns a login to any key that may see the user.

import { RedmineError } from "@redmine-ts/sdk";
import type { IdName, Membership, User } from "@redmine-ts/sdk";
import { z } from "zod";
import { BY_METHOD } from "../catalog-tools.ts";
import type { Client, ToolSpec } from "../tools.ts";
import { defineTool, invalidInput } from "./define.ts";
import { MAX_MEMBERS, projectMembers } from "./lookups.ts";

/** Matches returned with their login. */
export const MAX_MATCHES = 10;

/** The SDK reads members 100 to a page. */
const MEMBER_PAGES = MAX_MEMBERS / 100;

const LOOKUP_CALLS = 2 * MAX_MATCHES;

export const MAX_CALLS: number = 1 + MEMBER_PAGES + LOOKUP_CALLS;

/** Redmine's User::STATUS_LOCKED. */
const LOCKED = 3;

const FOUND_AS = ["member", "author", "assignee", "watcher", "journal"] as const;
type FoundAs = (typeof FOUND_AS)[number];

/** nameMatch's ranks, by the kind each one returns as. */
const KINDS = ["exact", "exact", "prefix", "partial"] as const;
const PARTIAL = KINDS.indexOf("partial");

const PeopleSchema = z.object({
  matches: z
    .array(
      z.object({
        id: z.int(),
        name: z.string().describe("As Redmine shows it, in the users display format it is set to."),
        login: z
          .string()
          .nullable()
          .describe(
            "What an @login mention takes. null when there is none to read; unavailable says why.",
          ),
        match: z
          .enum(["exact", "prefix", "partial"])
          .describe(
            'How the name matched. "exact": each word of the query is a whole word of the name. "prefix": each starts one. "partial": the name as Redmine shows it is shorter than the query or has initials, such as "Ivan P." or "Ivan" for "Ivan Petrov", so it may be someone else. Partial matches come only when no other did.',
          ),
        found_as: z
          .array(z.enum(FOUND_AS))
          .describe(
            'A "member" of the project, directly or through a group, or the issue\'s "author", "assignee", a "watcher", or the user of a "journal". Without "member", the person is on the issue but not a member of its project.',
          ),
        locked: z
          .literal(true)
          .optional()
          .describe(
            "The user is locked, so a mention does not reach them. Only an admin key tells.",
          ),
      }),
    )
    .describe(
      `At most ${MAX_MATCHES}, best first: the same words, then whole words, then starts of words, then partial matches. People on the issue come before other members.`,
    ),
  more: z
    .int()
    .describe(
      `People whose names match but who were not looked up, because ${MAX_MATCHES} matches came first or, as unavailable then says, the calls ran out. Some may be groups. Pass more of the name to narrow them.`,
    ),
  unavailable: z
    .array(z.string())
    .optional()
    .describe("What could not be read, and why a login is null."),
});

type People = z.output<typeof PeopleSchema>;

export const peopleFindTool: ToolSpec = defineTool({
  name: "people_find",
  title: "Find people by name",
  description: [
    "Finds people by name and returns each one's id, name and login, which an @login mention takes.",
    "Works with any API key, unlike users_list, which needs an admin key.",
    "With project_id it searches the project's members. With issue_id it searches the members of the issue's project and the issue's author, assignee, watchers and journal users.",
    'It matches names as Redmine shows them. Words match in any order, ignoring case and accents, and a word may be the start of one: "petrov ivan" and "Iv Pet" both find Ivan Petrov. Groups the key may see are left out.',
    'A "partial" match, such as "Ivan P." for "Ivan Petrov", may be someone else, and comes only when nothing matched better.',
    `Returns the best ${MAX_MATCHES} matches with their logins.`,
    `Makes at most ${MAX_CALLS} calls: the issue, ${MEMBER_PAGES} pages of members, and ${LOOKUP_CALLS} lookups of matches, best first: users_get, then groups_get for a watcher or assignee that users_get does not find. By default the SDK retries each call up to twice.`,
    "Returns {matches, more, unavailable}.",
  ].join(" "),
  input: z.strictObject({
    name: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'A name or part of one, such as "Ivan Petrov", "petrov ivan" or "Iv". Where Redmine shows people by login, pass a login. Where it runs the last and first name together, pass the last name.',
      ),
    project_id: z
      .union([z.int().positive(), z.string().min(1)])
      .optional()
      .describe(
        'Search this project\'s members: its id or identifier, such as 3 or "web". Pass this or issue_id.',
      ),
    issue_id: z
      .int()
      .positive()
      .optional()
      .describe("Search this issue's people and its project's members. Pass this or project_id."),
  }),
  output: PeopleSchema,
  ...BY_METHOD.GET,
  run: async (rm, { name, project_id, issue_id }) => ({
    structured: await findPeople(rm, name, project_id, issue_id),
  }),
});

interface Person {
  id: number;
  name: string;
  found_as: Set<FoundAs>;
}

async function findPeople(
  rm: Client,
  name: string,
  project_id: number | string | undefined,
  issue_id: number | undefined,
): Promise<People> {
  if ((project_id === undefined) === (issue_id === undefined)) {
    throw invalidInput("pass project_id or issue_id, one of them");
  }
  const query = nameWords(name);
  if (query.length === 0) throw invalidInput(`name "${name}" has no letter or digit to match`);
  const people = new Map<number, Person>();
  const groups = new Set<number>();
  const unavailable: string[] = [];
  const add = (ref: IdName | undefined, as: FoundAs): void => {
    if (ref === undefined) return;
    const person = people.get(ref.id) ?? { id: ref.id, name: ref.name, found_as: new Set() };
    person.found_as.add(as);
    people.set(ref.id, person);
  };
  const readMembers = async (project: number | string): Promise<void> => {
    const read: Membership[] = [];
    let members = read;
    try {
      const result = await projectMembers(rm, project, read);
      members = result.members;
      if (result.more) {
        unavailable.push(
          `members: only the first ${MAX_MEMBERS} were searched; memberships_list pages through all of them`,
        );
      }
    } catch (error) {
      // With project_id alone, no member read leaves nothing to search.
      if (!(error instanceof RedmineError) || (read.length === 0 && issue_id === undefined)) {
        throw error;
      }
      unavailable.push(
        read.length === 0
          ? `members: ${error.message}`
          : `members: only the first ${read.length} were searched, because the page after them failed: ${error.message}`,
      );
    }
    for (const { user, group } of members) {
      add(user, "member");
      if (group !== undefined) groups.add(group.id);
    }
  };

  if (issue_id === undefined) {
    await readMembers(project_id!);
  } else {
    const issue = await rm.issues.get({ issue_id, include: ["watchers", "journals"] });
    add(issue.author, "author");
    add(issue.assigned_to, "assignee");
    for (const watcher of issue.watchers ?? []) add(watcher, "watcher");
    for (const journal of issue.journals ?? []) add(journal.user, "journal");
    if (issue.watchers === undefined) {
      unavailable.push("watchers: this key's user may not view the issue's watchers");
    }
    if (issue.project !== undefined) await readMembers(issue.project.id);
  }
  // An issue may be assigned to a group or watched by one, and a mention names a user.
  for (const id of groups) people.delete(id);

  const memberOnly = (person: Person): number =>
    person.found_as.size === 1 && person.found_as.has("member") ? 1 : 0;
  const ranked = [...people.values()]
    .flatMap((person) => {
      const rank = nameMatch(query, nameWords(person.name));
      return rank === undefined ? [] : [{ person, rank }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        memberOnly(a.person) - memberOnly(b.person) ||
        a.person.name.localeCompare(b.person.name) ||
        a.person.id - b.person.id,
    );
  const { shown, left } = await lookUpBest(rm, ranked);

  const hidden: number[] = [];
  const matches = shown.map(({ person, rank, user }): People["matches"][number] => {
    const match = {
      id: person.id,
      name: person.name,
      login: null,
      match: KINDS[rank]!,
      found_as: FOUND_AS.filter((as) => person.found_as.has(as)),
    };
    if (user === "hidden") {
      hidden.push(person.id);
      return match;
    }
    if (user instanceof RedmineError) {
      unavailable.push(`login of ${person.id}: ${user.message}`);
      return match;
    }
    // Redmine's Anonymous user, which takes the place of a deleted one, has an empty login.
    if (user.login === "") {
      unavailable.push(
        `login of ${person.id}: none, because this is the Anonymous user, which Redmine shows in place of a deleted user. No mention reaches it.`,
      );
      return match;
    }
    return {
      ...match,
      login: user.login,
      ...(user.status === LOCKED ? { locked: true as const } : {}),
    };
  });
  if (hidden.length > 0) {
    unavailable.push(
      `login of ${hidden.join(", ")}: users_get answered 404. To a key that is not an admin's, Redmine hides locked users, the Anonymous user that takes the place of deleted users, and, depending on the key's roles, users and groups outside the projects it can see. A mention from this key would not reach them either.`,
    );
  }
  if (left > 0 && shown.length < MAX_MATCHES) {
    unavailable.push(
      `more: ${left} were not looked up, because people_find makes at most ${MAX_CALLS} calls and each watcher or assignee that users_get does not find takes two. Some of them may be groups. With project_id it searches the project's members alone, without the issue's watchers and assignee.`,
    );
  }
  return {
    matches,
    more: left,
    ...(unavailable.length === 0 ? {} : { unavailable }),
  };
}

interface Candidate {
  person: Person;
  rank: number;
}

/**
 * Looks candidates up best first, in waves within LOOKUP_CALLS, and returns at most MAX_MATCHES users
 * among them, with how many of the rest could still match. A partial candidate counts only when no
 * user ranked better, as it may well be someone else.
 */
async function lookUpBest(
  rm: Client,
  ranked: readonly Candidate[],
): Promise<{ shown: (Candidate & { user: Exclude<Found, "group"> })[]; left: number }> {
  const shown: (Candidate & { user: Exclude<Found, "group"> })[] = [];
  const userAbovePartial = (): boolean => shown.some(({ rank }) => rank < PARTIAL);
  let next = 0;
  let calls = 0;
  while (shown.length < MAX_MATCHES && next < ranked.length) {
    const partial = ranked[next]!.rank === PARTIAL;
    if (partial && userAbovePartial()) break;
    const wave: Candidate[] = [];
    let cost = calls;
    for (const candidate of ranked.slice(next, next + MAX_MATCHES - shown.length)) {
      cost += mayBeGroup(candidate.person) ? 2 : 1;
      if ((candidate.rank === PARTIAL && !partial) || cost > LOOKUP_CALLS) break;
      wave.push(candidate);
    }
    if (wave.length === 0) break;
    next += wave.length;
    const found = await Promise.all(wave.map(({ person }) => lookUp(rm, person, () => calls++)));
    wave.forEach((candidate, at) => {
      const user = found[at]!;
      if (user !== "group") shown.push({ ...candidate, user });
    });
  }
  const left = ranked
    .slice(next)
    .filter(({ rank }) => rank < PARTIAL || !userAbovePartial()).length;
  return { shown, left };
}

/**
 * An issue's author and journal users are always users, and a membership names a group as one, so
 * only a watcher or the assignee may be a group.
 */
function mayBeGroup(person: Person): boolean {
  return [...person.found_as].every((as) => as === "assignee" || as === "watcher");
}

type Found = User | "group" | "hidden" | RedmineError;

/** users_get for a person, which answers 404 for a group, then groups_get if they may be one. */
async function lookUp(rm: Client, person: Person, call: () => void): Promise<Found> {
  try {
    call();
    return await rm.users.get({ user_id: person.id });
  } catch (error) {
    if (!(error instanceof RedmineError)) throw error;
    if (!RedmineError.is(error, "not_found")) return error;
  }
  if (!mayBeGroup(person)) return "hidden";
  try {
    call();
    await rm.groups.get({ group_id: person.id });
    return "group";
  } catch (error) {
    if (!(error instanceof RedmineError)) throw error;
    return RedmineError.is(error, "not_found") ? "hidden" : error;
  }
}

/** Letters that NFKD leaves whole, by the Latin letters they are spelled with. */
const FOLDS: Readonly<Record<string, string>> = {
  ł: "l",
  ø: "o",
  ß: "ss",
  ı: "i",
  đ: "d",
  ð: "d",
  ħ: "h",
  æ: "ae",
  œ: "oe",
  þ: "th",
};

/**
 * A name's words for matching: lower case, without accents or other marks, with letters such as ł and
 * ß spelled in Latin, split at anything but a letter or digit. An apostrophe joins, so "O'Neil" is
 * one word, and ', ’, ´, ` and the Ukrainian ʼ are the same.
 */
export function nameWords(text: string): string[] {
  return (
    text
      // NFKD turns ´ into a space and an accent, so it becomes an apostrophe first.
      .replaceAll("´", "'")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[łøßıđðħæœþ]/gu, (letter) => FOLDS[letter]!)
      .replace(/['‘’ʼ`]/gu, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word !== "")
  );
}

/**
 * How well a query's words name a person, 0 best, or undefined when they do not. Each word pairs with
 * a different word on the other side, in any order:
 * 0, the same words; 1, every query word is a whole word of a longer name; 2, every query word starts
 * a word of the name; 3, a partial match: each word of the name is a word of the query or, with one
 * letter, the initial of one, as "Ivan Petrov" names someone Redmine shows as "Ivan P." or "Ivan".
 * With as many words as the query, a word of the name may also start with one of the query's, as
 * "Iv Petrov" names "Ivan P.". A name of initials alone matches no longer query.
 */
export function nameMatch(query: readonly string[], name: readonly string[]): number | undefined {
  if (query.length === 0 || name.length === 0) return undefined;
  const same = (a: string, b: string): boolean => a === b;
  const starts = (a: string, b: string): boolean => b.startsWith(a);
  if (pairs(query, name, same)) return query.length === name.length ? 0 : 1;
  if (pairs(query, name, starts)) return 2;
  if (!name.some((word) => word.length > 1)) return undefined;
  const initial = (b: string, a: string): boolean => b === a || (b.length === 1 && a.startsWith(b));
  if (pairs(name, query, initial)) return 3;
  // Only a query word that pairs too may be short, or "Ivan Petrov" would name "Ivanov".
  const either = (b: string, a: string): boolean => initial(b, a) || b.startsWith(a);
  if (name.length === query.length && pairs(name, query, either)) return 3;
  return undefined;
}

/** Whether each of `from` can take a different one of `to` that `fits` it: a bipartite matching. */
function pairs(
  from: readonly string[],
  to: readonly string[],
  fits: (a: string, b: string) => boolean,
): boolean {
  if (from.length > to.length) return false;
  const holder: (number | undefined)[] = [];
  const take = (i: number, tried: Set<number>): boolean => {
    for (let j = 0; j < to.length; j++) {
      if (tried.has(j) || !fits(from[i]!, to[j]!)) continue;
      tried.add(j);
      const held = holder[j];
      if (held === undefined || take(held, tried)) {
        holder[j] = i;
        return true;
      }
    }
    return false;
  };
  return from.every((_, i) => take(i, new Set()));
}
