// people_find: the people a name means in a project or on an issue, with the login an @mention takes.
// users_list would search every user, but Redmine answers it to admins only. Any key that sees a
// project may read its members, and users_get returns a login to any key that may see the user.

import { RedmineError } from "@redmine-ts/sdk";
import type { IdName } from "@redmine-ts/sdk";
import { z } from "zod";
import { BY_METHOD } from "../catalog-tools.ts";
import type { Client, ToolSpec } from "../tools.ts";
import { defineTool, invalidInput } from "./define.ts";
import { MAX_MEMBERS, projectMembers } from "./lookups.ts";

/** Matches returned with their login, so also the users_get requests one call sends. */
export const MAX_MATCHES = 10;

/** The SDK reads members 100 to a page. */
const MEMBER_PAGES = MAX_MEMBERS / 100;

/** Redmine's User::STATUS_LOCKED. */
const LOCKED = 3;

const FOUND_AS = ["member", "author", "assignee", "watcher", "journal"] as const;
type FoundAs = (typeof FOUND_AS)[number];

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
            "What an @login mention takes. null when users_get could not read the user; unavailable says why.",
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
      `At most ${MAX_MATCHES}, best first: the same words, then whole words, then starts of words, then a longer query that holds a start of each word of the name. People on the issue come before other members.`,
    ),
  more: z
    .int()
    .describe(
      `Matches left out after the first ${MAX_MATCHES}. Pass more of the name to see them.`,
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
    'Words match in any order, ignoring case and accents, and a word may be the start of one: "petrov ivan" and "Iv Pet" both find Ivan Petrov. Groups are not matched.',
    `Returns the best ${MAX_MATCHES} matches with their logins and counts the rest in more.`,
    `Sends at most ${1 + MEMBER_PAGES + MAX_MATCHES} requests: the issue, ${MEMBER_PAGES} pages of members, and users_get for each match it returns.`,
    "Returns {matches, more, unavailable}.",
  ].join(" "),
  input: z.strictObject({
    name: z
      .string()
      .min(1)
      .max(200)
      .describe('A name or part of one, such as "Ivan Petrov", "petrov ivan" or "Iv".'),
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
    const { members, more } = await projectMembers(rm, project);
    if (more) {
      unavailable.push(
        `members: only the first ${MAX_MEMBERS} were searched; memberships_list pages through all of them`,
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
    if (issue.project !== undefined) {
      try {
        await readMembers(issue.project.id);
      } catch (error) {
        if (!(error instanceof RedmineError)) throw error;
        unavailable.push(`members: ${error.message}`);
      }
    }
  }
  // An issue may be assigned to a group or watched by one, and a mention names a user.
  for (const id of groups) people.delete(id);

  const memberOnly = (person: Person): number =>
    person.found_as.size === 1 && person.found_as.has("member") ? 1 : 0;
  const found = [...people.values()]
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
    )
    .map(({ person }) => person);
  const shown = found.slice(0, MAX_MATCHES);
  const users = await Promise.all(
    shown.map((person) =>
      rm.users.get({ user_id: person.id }).catch((error: unknown) => {
        if (error instanceof RedmineError) return error;
        throw error;
      }),
    ),
  );
  const hidden: number[] = [];
  const matches = shown.map((person, at): People["matches"][number] => {
    const user = users[at]!;
    const found_as = FOUND_AS.filter((as) => person.found_as.has(as));
    if (user instanceof RedmineError) {
      if (RedmineError.is(user, "not_found")) hidden.push(person.id);
      else unavailable.push(`login of ${person.id}: ${user.message}`);
      return { id: person.id, name: person.name, login: null, found_as };
    }
    return {
      id: person.id,
      name: person.name,
      login: user.login,
      found_as,
      ...(user.status === LOCKED ? { locked: true as const } : {}),
    };
  });
  if (hidden.length > 0) {
    unavailable.push(
      `login of ${hidden.join(", ")}: users_get answered 404. Redmine hides locked users from a key that is not an admin's, and, depending on its roles, users outside the projects it can see. A mention from this key would not reach them either.`,
    );
  }
  return {
    matches,
    more: found.length - shown.length,
    ...(unavailable.length === 0 ? {} : { unavailable }),
  };
}

/**
 * A name's words for matching: lower case, without accents or other marks, split at anything but a
 * letter or digit. An apostrophe joins, so "O'Neil" is one word.
 */
export function nameWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/**
 * How well a query's words name a person, 0 best, or undefined when they do not. Each word pairs with
 * a different word on the other side, in any order:
 * 0, the same words; 1, every query word is a whole word of a longer name; 2, every query word starts
 * a word of the name; 3, the query has a word starting with each word of the name, as "Ivan Petrov"
 * names someone Redmine shows as "Ivan P." or "Ivan".
 */
export function nameMatch(query: readonly string[], name: readonly string[]): number | undefined {
  if (query.length === 0 || name.length === 0) return undefined;
  const same = (a: string, b: string): boolean => a === b;
  const starts = (a: string, b: string): boolean => b.startsWith(a);
  if (pairs(query, name, same)) return query.length === name.length ? 0 : 1;
  if (pairs(query, name, starts)) return 2;
  if (pairs(name, query, starts)) return 3;
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
