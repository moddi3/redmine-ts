import { describe, expect, it } from "vite-plus/test";
import { lastJson } from "../connect.ts";
import { callError, callOk, json, sent, serve } from "./harness.ts";
import type { Route, Seen } from "./harness.ts";

interface Journal {
  id: number;
  user: { id: number; name: string };
  notes: string;
  private_notes: boolean;
  created_on: string;
  updated_on: string;
  details: { property: string; name: string; old_value: string | null; new_value: string | null }[];
}

const ME = { id: 1, name: "Redmine Admin" };
const OTHER = { id: 2, name: "John Smith" };

const journal = (id: number, user: Journal["user"], notes: string, private_notes = false) => ({
  id,
  user,
  notes,
  private_notes,
  created_on: "2026-10-30T10:00:00Z",
  updated_on: "2026-10-30T10:00:00Z",
  details: [],
});

const TOOLS = {
  issues_update: { issue_id: 7 },
  issues_transition: { issue_id: 7, status: 3 },
} as const;

function redmine(
  journals: Journal[],
  {
    onPut = (body, add) => {
      if (body.notes?.trim()) add(ME, body.notes, body.private_notes);
    },
    visible = () => true,
    afterPut = {},
  }: {
    onPut?: (
      body: { notes?: string; private_notes?: boolean },
      add: (user: Journal["user"], notes: string, private_notes?: boolean) => void,
    ) => void;
    visible?: (journal: Journal) => boolean;
    afterPut?: Record<string, Route>;
  } = {},
): Record<string, Route> {
  let next = 50;
  let written = false;
  const add = (user: Journal["user"], notes: string, private_notes = false) => {
    journals.push(journal(next++, user, notes, private_notes));
  };
  const routes: Record<string, Route> = {
    "GET /users/current.json": () =>
      json({ user: { ...ME, login: "admin", firstname: "Redmine", lastname: "Admin" } }),
    "GET /issue_statuses.json": () =>
      json({
        issue_statuses: [
          { id: 2, name: "In Progress", is_closed: false },
          { id: 3, name: "Resolved", is_closed: false },
        ],
      }),
    "GET /issues/7.json": () =>
      json({
        issue: {
          id: 7,
          subject: "Login fails",
          status: { id: 2, name: "In Progress", is_closed: false },
          allowed_statuses: [
            { id: 2, name: "In Progress", is_closed: false },
            { id: 3, name: "Resolved", is_closed: false },
          ],
          journals: journals.filter(visible),
        },
      }),
    "PUT /issues/7.json": ({ body }: Seen) => {
      onPut((body as { issue: { notes?: string; private_notes?: boolean } }).issue, add);
      written = true;
      return new Response(null, { status: 204 });
    },
  };
  return Object.fromEntries(
    Object.entries(routes).map(([key, route]) => [
      key,
      (request: Seen) => (written ? (afterPut[key] ?? route) : route)(request),
    ]),
  );
}

const BEFORE = () => [journal(40, OTHER, "Login fails for me too."), journal(41, ME, "Checking.")];

const puts = (seen: readonly Seen[]) => seen.filter((request) => request.method === "PUT");

describe("the journal a write with notes added", () => {
  it("is returned by issues_update, numbered among the journals the key sees, for two extra reads", async () => {
    const { client, seen } = await serve(
      redmine([journal(39, OTHER, "Private.", true), ...BEFORE()], {
        visible: (journal) => !journal.private_notes,
      }),
    );
    const result = await callOk(client, "issues_update", {
      issue_id: 7,
      notes: "Fixed in build 12.",
    });
    expect(result.structuredContent).toEqual({ ok: true, journal: { id: 50, note: 3 } });
    expect(sent(seen).toSorted()).toEqual([
      "GET /issues/7.json?include=journals",
      "GET /issues/7.json?include=journals",
      "GET /users/current.json",
      "PUT /issues/7.json",
    ]);
    expect(seen.findIndex((request) => request.method === "PUT")).toBe(1);

    const again = await callOk(client, "issues_update", {
      issue_id: 7,
      notes: "Fixed in build 12.",
    });
    expect(again.structuredContent).toEqual({ ok: true, journal: { id: 51, note: 4 } });
    expect(sent(seen).filter((line) => line.includes("users/current"))).toHaveLength(1);
  });

  it("is returned by issues_transition beside the status", async () => {
    const { client } = await serve(redmine(BEFORE()));
    const result = await callOk(client, "issues_transition", {
      issue_id: 7,
      status: "Resolved",
      notes: "Fixed in build 12.",
    });
    expect(result.structuredContent).toEqual({
      ok: true,
      status: { id: 3, name: "Resolved" },
      journal: { id: 50, note: 3 },
    });
  });

  it.each(Object.entries(TOOLS))(
    "%s finds its own journal when the same user adds other notes meanwhile",
    async (tool, args) => {
      const { client } = await serve(
        redmine(BEFORE(), {
          onPut: (body, add) => {
            add(ME, body.notes!);
            add(ME, "Another session's note.");
          },
        }),
      );
      const result = await callOk(client, tool, { ...args, notes: "Done." });
      expect(result.structuredContent).toMatchObject({ ok: true, journal: { id: 50, note: 3 } });
    },
  );

  it.each(Object.entries(TOOLS))(
    "%s finds its own journal when another user adds the same notes meanwhile",
    async (tool, args) => {
      const { client } = await serve(
        redmine(BEFORE(), {
          onPut: (body, add) => {
            add(OTHER, body.notes!);
            add(ME, body.notes!);
          },
        }),
      );
      const result = await callOk(client, tool, { ...args, notes: "Done." });
      expect(result.structuredContent).toMatchObject({ ok: true, journal: { id: 51, note: 4 } });
    },
  );

  it.each(Object.entries(TOOLS))(
    "%s returns no journal when the same user adds the same notes meanwhile",
    async (tool, args) => {
      const { client } = await serve(
        redmine(BEFORE(), {
          onPut: (body, add) => {
            add(ME, body.notes!);
            add(ME, body.notes!);
          },
        }),
      );
      const result = await callOk(client, tool, { ...args, notes: "Done." });
      expect(result.structuredContent).not.toHaveProperty("journal");
    },
  );

  it.each(Object.entries(TOOLS))(
    "%s returns no journal when the write added none, though an older one of the user's has the same notes",
    async (tool, args) => {
      // Redmine drops notes without a word for a user who may edit the issue but not add notes.
      const { client, seen } = await serve(
        redmine([...BEFORE(), journal(42, ME, "Done.")], { onPut: () => {} }),
      );
      const result = await callOk(client, tool, { ...args, notes: "Done." });
      expect(result.structuredContent).toMatchObject({ ok: true });
      expect(result.structuredContent).not.toHaveProperty("journal");
      expect(puts(seen)).toHaveLength(1);
    },
  );

  it("issues_update returns no journal for a private note the key cannot read back", async () => {
    const { client } = await serve(
      redmine(BEFORE(), { visible: (journal) => !journal.private_notes }),
    );
    const result = await callOk(client, "issues_update", {
      issue_id: 7,
      notes: "Secret.",
      private_notes: true,
    });
    expect(result.structuredContent).toEqual({ ok: true });
  });

  it.each(
    Object.entries(TOOLS).flatMap(([tool, args]) =>
      [
        ["reading the journals back", "GET /issues/7.json"],
        ["reading the key's user", "GET /users/current.json"],
      ].map(([what, route]) => ({ tool, args, what, route: route! })),
    ),
  )(
    "$tool succeeds without a journal when $what fails after the write, so the notes are not sent again",
    async ({ tool, args, route }) => {
      const failing = () => json({ errors: ["Something went wrong"] }, 500);
      const { client, seen } = await serve(redmine(BEFORE(), { afterPut: { [route]: failing } }));
      const result = await callOk(client, tool, { ...args, notes: "Fixed in build 12." });
      expect(result.structuredContent).toMatchObject({ ok: true });
      expect(result.structuredContent).not.toHaveProperty("journal");
      expect(puts(seen)).toHaveLength(1);
    },
  );

  it.each(Object.entries(TOOLS))(
    "%s still writes, without a journal, when the journals cannot be read before",
    async (tool, args) => {
      const routes = redmine(BEFORE());
      let reads = 0;
      const issue = routes["GET /issues/7.json"]!;
      routes["GET /issues/7.json"] = (request) =>
        request.url.search === "?include=journals" && reads++ === 0
          ? json({ errors: ["Something went wrong"] }, 500)
          : issue(request);
      const { client, seen } = await serve(routes);
      const result = await callOk(client, tool, { ...args, notes: "Fixed in build 12." });
      expect(result.structuredContent).not.toHaveProperty("journal");
      expect(puts(seen)).toHaveLength(1);
    },
  );

  it.each([{}, { notes: "" }, { notes: " \r\n\t" }])(
    "issues_update sends only the update for notes %j",
    async (notes) => {
      const { client, seen } = await serve(redmine(BEFORE()));
      const result = await callOk(client, "issues_update", {
        issue_id: 7,
        done_ratio: 50,
        ...notes,
      });
      expect(result.structuredContent).toEqual({ ok: true });
      expect(sent(seen)).toEqual(["PUT /issues/7.json"]);
    },
  );

  it.each(Object.entries(TOOLS))(
    "%s with notes sends nothing on a read-only server",
    async (tool, args) => {
      const { client, seen } = await serve(redmine(BEFORE()), { access: "read-only" });
      const result = await callError(client, tool, { ...args, notes: "Fixed in build 12." });
      expect(lastJson(result)).toMatchObject({ kind: "access_denied", method: "PUT" });
      expect(seen).toEqual([]);
    },
  );
});
