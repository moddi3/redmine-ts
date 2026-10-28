import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { generate } from "../../generator/generate.ts";
import { overlay } from "../../generator/overlay.ts";
import { loadSpecs, type SpecFile } from "../../generator/spec.ts";
import { uploadKey } from "../../src/core/op.ts";
import { ops } from "../../src/generated/ops.ts";
import type { CustomField, IdName, Issue, IssueSummary } from "../../src/generated/schemas.ts";

const root = resolve(import.meta.dirname, "../..");
const specs = loadSpecs(resolve(root, "../../spec/redmine-openapi"));
const generated = await generate(specs);

const withSpecs = (edit: (byVersion: Record<string, SpecFile["doc"]>) => void): SpecFile[] => {
  const copy = structuredClone(specs);
  edit(Object.fromEntries(copy.map((s) => [s.version, s.doc])));
  return copy;
};

describe("drift between vendored versions", () => {
  test("is one added operation, one added schema and four added properties, with the child shape resolved", () => {
    expect(generated.report.drift).toEqual({
      addedOps: [{ id: "removeUsersFromGroup", since: "7.0" }],
      removedOps: [],
      addedSchemas: [{ name: "issue_child", since: "7.0" }],
      addedProperties: expect.arrayContaining([
        { pointer: "#/components/schemas/custom_field/properties/is_for_all", since: "7.0" },
        {
          pointer: "#/components/schemas/custom_field/properties/default_value_mode",
          since: "7.0",
        },
        { pointer: "#/components/schemas/custom_field/properties/projects", since: "7.0" },
        { pointer: "#/components/schemas/wiki_page.summary/properties/project", since: "7.0" },
      ]),
      conflicts: [],
      resolved: Object.entries(overlay.resolved).map(([pointer, reason]) => ({ pointer, reason })),
    });
    expect(generated.report.drift.addedProperties).toHaveLength(4);
  });

  test("a schema new to 7.0 dates from the first version that can send it", async () => {
    const docBefore = (files: Record<string, string>, type: string) => {
      const text = files["src/generated/schemas.ts"]!;
      const head = text.slice(0, text.indexOf(`export interface ${type} `));
      return head.slice(head.lastIndexOf("\n\n"));
    };
    expect(docBefore(generated.files, "IssueChild")).not.toContain("@since");

    const badged = withSpecs((v) => {
      v["7.0"]!.components.schemas.issue_badge = {
        type: "object",
        properties: { label: { type: "string" } },
      };
      v["7.0"]!.components.schemas.issue!.properties!.badge = {
        $ref: "#/components/schemas/issue_badge",
      };
    });
    expect(docBefore((await generate(badged)).files, "IssueBadge")).toContain("@since 7.0");
  });

  test("a changed property type fails generation until the overlay resolves it", async () => {
    const changed = withSpecs((v) => {
      v["6.1"]!.components.schemas.issue!.properties!.done_ratio = { type: "string" };
    });
    const pointer = "#/components/schemas/issue/properties/done_ratio";
    await expect(generate(changed)).rejects.toThrow(pointer);
    const resolved = await generate(changed, {
      ...overlay,
      resolved: { ...overlay.resolved, [pointer]: "6.1 sent strings" },
    });
    expect(resolved.report.drift.resolved).toContainEqual({ pointer, reason: "6.1 sent strings" });
  });

  test("a removed property fails generation", async () => {
    const removed = withSpecs((v) => {
      v["6.1"]!.components.schemas.issue!.properties!.legacy_flag = { type: "boolean" };
    });
    await expect(generate(removed)).rejects.toThrow(
      "#/components/schemas/issue/properties/legacy_flag",
    );
  });

  test("an overlay resolution that matches no conflict fails generation", async () => {
    await expect(
      generate(specs, { ...overlay, resolved: { "#/components/schemas/issue": "stale" } }),
    ).rejects.toThrow("not a conflict");
  });
});

test("committed output matches the generator", () => {
  for (const [path, code] of Object.entries(generated.files)) {
    expect(readFileSync(resolve(root, path), "utf8"), path).toBe(code);
  }
});

describe("canonical inputs", () => {
  test("a body field named like a path param fails generation with the operation id", async () => {
    const colliding = withSpecs((v) => {
      const body =
        v["7.0"]!.paths["/issues/{issue_id}.{format}"]!.put!.requestBody!.content[
          "application/json"
        ]!.schema!.properties!.issue!;
      body.properties!.issue_id = { type: "integer" };
    });
    await expect(generate(colliding)).rejects.toThrow(
      'updateIssue: input key collision on "issue_id"',
    );
  });

  test("two operations on one namespace verb fail generation", async () => {
    const { getCurrentUser: _, ...verbs } = overlay.verbs;
    await expect(generate(specs, { ...overlay, verbs })).rejects.toThrow("users.get");
  });

  test("hiding a scoped variant requires the sibling to take the scope", async () => {
    const { getNewsListByProject: _, ...verbs } = overlay.verbs;
    await expect(
      generate(specs, {
        ...overlay,
        verbs,
        scopedDuplicates: {
          ...overlay.scopedDuplicates,
          getNewsListByProject: { sibling: "getNewsList", key: "project_id" },
        },
      }),
    ).rejects.toThrow('getNewsList takes no "project_id"');
  });
});

describe("operation descriptors", () => {
  test("stability comes from overlay.stableTags, which must name real tags", async () => {
    expect(ops.getIssues.stability).toBe("stable");
    expect(ops.getVersionsByProject.stability).toBe("alpha");
    await expect(generate(specs, { ...overlay, stableTags: ["Isues"] })).rejects.toThrow(
      "overlay.stableTags names unknown tag Isues",
    );
  });

  test("removeUsersFromGroup sends user_ids[] as repeated query params and no body", () => {
    expect(ops.removeUsersFromGroup).toMatchObject({
      method: "DELETE",
      path: "groups/{group_id}/users.json",
      query: { user_ids: "brackets" },
      body: null,
      since: "7.0",
      safety: "idempotent",
    });
  });

  test("single scalar bodies have no envelope", () => {
    for (const [op, key] of [
      [ops.addWatcher, "user_id"],
      [ops.addUserToGroup, "user_id"],
      [ops.addRelatedIssue, "issue_id"],
    ] as const) {
      expect(op.body, op.id).toEqual({ kind: "json", envelope: null, siblings: [key] });
    }
  });

  test("user bodies carry send_information and pref beside the envelope", () => {
    expect(ops.createUser.body).toEqual({
      kind: "json",
      envelope: "user",
      siblings: ["send_information", "pref"],
    });
    expect(ops.updateUser.body).toMatchObject({
      envelope: "user",
      siblings: ["send_information", "pref"],
    });
    expect(ops.updateMyAccount.body).toMatchObject({ envelope: "user", siblings: ["pref"] });
  });

  test("getIssue accepts every include the spec lists", () => {
    expect(ops.getIssue.includes).toEqual([
      "children",
      "attachments",
      "relations",
      "changesets",
      "journals",
      "watchers",
      "allowed_statuses",
    ]);
    expect(ops.getIssue.query).toEqual({ include: "csv" });
    expect(generated.report.includeMisses).toEqual([]);
  });

  test("issue lists take documented filters, custom fields and keyset walks", () => {
    expect(ops.getIssues.response).toEqual({
      kind: "list",
      items: "issues",
      paged: true,
      keyset: { param: "issue_id" },
    });
    expect(ops.getIssues.customFieldFilters).toBe(true);
    expect(ops.getIssues.filters.status_id).toEqual({
      ops: ["o", "=", "!", "c", "*", "ev", "!ev", "cf"],
      words: { open: "o", closed: "c", any: "*" },
    });
    expect(ops.getIssues.filters.assigned_to_id?.ops).toEqual([
      "=",
      "!",
      "*",
      "!*",
      "ev",
      "!ev",
      "cf",
    ]);
    expect(Object.keys(ops.getIssues.query)).not.toContain("offset");
  });

  test("comma lists are exactly the filters the overlay names, on every operation of the query", () => {
    const joined = Object.values(ops).flatMap((op) =>
      Object.entries(op.filters)
        .filter(([, spec]) => "join" in spec)
        .map(([name, spec]) => `${op.id}.${name}=${spec.join}`),
    );
    const issueFilters = [
      "issue_id",
      "parent_id",
      "child_id",
      "done_ratio",
      "relates",
      "duplicates",
      "duplicated",
      "blocks",
      "blocked",
      "precedes",
      "follows",
      "copied_to",
      "copied_from",
    ];
    expect(joined.toSorted()).toEqual(
      [
        ...["getIssues", "getIssuesByProject"].flatMap((id) =>
          issueFilters.map((f) => `${id}.${f}=,`),
        ),
        "getTimeEntries.issue.parent_id=,",
        "getTimeEntriesByProject.issue.parent_id=,",
      ].toSorted(),
    );
    // Filters that read every value keep the default, including same-named ones on other operations.
    expect(ops.getProjects.filters.parent_id).not.toHaveProperty("join");
    expect(ops.getTimeEntries.filters.issue_id).not.toHaveProperty("join");
    expect(ops.getIssues.filters.assigned_to_id).not.toHaveProperty("join");
  });

  test("only updateIssue clears a field by sending an empty string for null", () => {
    const clearing = Object.values(ops).filter((op) => op.body?.kind === "json" && op.body.clear);
    expect(clearing.map((op) => op.id)).toEqual(["updateIssue"]);
    expect(ops.updateIssue.body).toEqual({
      kind: "json",
      envelope: "issue",
      siblings: [],
      clear: ["assigned_to_id"],
      uploads: "uploads",
    });
  });

  test("the overlay refuses a clear field that is not nullable and a comma list without =", async () => {
    const bad = { ...overlay, clearAsEmpty: { updateIssue: ["subject"] } };
    await expect(generate(specs, bad)).rejects.toThrow(/updateIssue: subject is not a nullable/);
    const worse = { ...overlay, commaLists: [{ ops: ["getIssues"], filters: ["subject"] }] };
    await expect(generate(specs, worse)).rejects.toThrow(/no filter subject documents =/);
  });

  describe("inline uploads", () => {
    const issueBody = (doc: SpecFile["doc"]) =>
      doc.paths["/issues/{issue_id}.{format}"]!.put!.requestBody!.content["application/json"]!
        .schema!.properties!.issue!.properties!;

    test("mark every body that references the uploads component, and nothing else", () => {
      const marked = Object.values(ops).flatMap((op) => {
        const key = uploadKey(op);
        return key === undefined ? [] : [`${op.id}.${key}`];
      });
      const six = [
        "createIssue",
        "createIssueUnderProject",
        "updateIssue",
        "createNews",
        "updateNews",
        "updateWikiPage",
      ];
      expect(marked.toSorted()).toEqual(six.map((id) => `${id}.uploads`).toSorted());
      expect(generated.report.inlineUploads.toSorted()).toEqual(six.toSorted());
      expect(uploadKey(ops.createFile)).toBeUndefined();
    });

    test("an overlay naming a missing component fails generation", async () => {
      await expect(generate(specs, { ...overlay, inlineUploads: "nope" })).rejects.toThrow(
        "overlay.inlineUploads: nope is not an array of objects with a string token",
      );
    });

    test("a component without a string token fails generation", async () => {
      const tokenless = withSpecs((v) => {
        for (const doc of Object.values(v)) {
          delete doc.components.schemas.uploads!.items!.properties!.token;
        }
      });
      await expect(generate(tokenless)).rejects.toThrow(
        "not an array of objects with a string token",
      );
    });

    test("a top-level uploads field that stops referencing the component fails generation", async () => {
      const inline = withSpecs((v) => {
        for (const doc of Object.values(v)) {
          issueBody(doc).uploads = {
            type: "array",
            items: { type: "object", properties: { token: { type: "string" } } },
          };
        }
      });
      await expect(generate(inline)).rejects.toThrow(
        "updateIssue: body field uploads does not reference uploads",
      );
    });

    test("the component below the top of the body fails generation", async () => {
      const nested = withSpecs((v) => {
        for (const doc of Object.values(v)) {
          const body = issueBody(doc);
          body.attachments = {
            type: "object",
            properties: { list: { $ref: "#/components/schemas/uploads" } },
          };
          delete body.uploads;
        }
      });
      await expect(generate(nested)).rejects.toThrow(
        "updateIssue: uploads is referenced below the top of the body",
      );
    });
  });

  test("time entry from/to are plain query params, not filters", () => {
    expect(ops.getTimeEntries.query).toMatchObject({ from: "scalar", to: "scalar" });
    expect(ops.getTimeEntries.filters).not.toHaveProperty("from");
    expect(ops.getTimeEntries.filters).toHaveProperty("spent_on");
  });

  test("response shapes follow the spec", () => {
    expect(ops.getIssue.response).toEqual({ kind: "item", unwrap: "issue" });
    expect(ops.updateIssue.response).toEqual({ kind: "empty" });
    expect(ops.getTrackers.response).toEqual({ kind: "list", items: "trackers", paged: false });
    expect(ops.downloadAttachmentFile.response).toEqual({ kind: "binary" });
    expect(ops.uploadAttachmentFile.body).toEqual({ kind: "binary", key: "file" });
    expect(ops.getMyAccount.response).toEqual({ kind: "item", unwrap: "user" });
  });

  test("paths are relative with .json baked in", () => {
    for (const op of Object.values(ops)) {
      expect(op.path, op.id).not.toMatch(/^\/|\{format\}/);
    }
  });
});

describe("requiredness across versions", () => {
  type Journal = NonNullable<Issue["journals"]>[number];
  type Detail = Journal["details"][number];

  test("a property absent from 6.1 is optional even though 7.0 requires it", () => {
    expectTypeOf<Pick<CustomField, "is_for_all">>().toEqualTypeOf<{ is_for_all?: boolean }>();
  });

  test("required lists that grew between spec revisions stay required", () => {
    expectTypeOf<Pick<Journal, "notes" | "details">>().toEqualTypeOf<{
      notes: string;
      details: Detail[];
    }>();
    expectTypeOf<Pick<Detail, "old_value">>().toEqualTypeOf<{ old_value: string | null }>();
  });
});

describe("spec corrections", () => {
  const always = ["project", "tracker", "status", "priority", "author"] as const;
  type AlwaysSet = Pick<Issue, (typeof always)[number]>;

  test("make the issue fields Redmine always sends required, in both issue schemas", () => {
    expectTypeOf<AlwaysSet>().toEqualTypeOf<Required<AlwaysSet>>();
    expectTypeOf<Pick<IssueSummary, keyof AlwaysSet>>().toEqualTypeOf<AlwaysSet>();
    expectTypeOf<AlwaysSet["project"]>().toEqualTypeOf<IdName>();
    expectTypeOf<NonNullable<Issue["parent"]>>().toEqualTypeOf<{ id: number }>();
    expectTypeOf<NonNullable<IssueSummary["parent"]>>().toEqualTypeOf<{ id: number }>();
  });

  test("leave the loaded specs as they are", () => {
    for (const { doc } of specs) {
      expect(doc.components.schemas.issue!.required).not.toContain("project");
      expect(doc.components.schemas.issue!.properties!.parent!.required).toBeUndefined();
    }
  });

  // The merge takes `required` from the latest spec, so once that spec has the fix, the correction does nothing.
  test("a property the latest spec already requires fails generation, while an older spec lacks it", async () => {
    const latestFixed = withSpecs((v) => {
      v["7.0"]!.components.schemas.issue!.required!.push("author");
    });
    await expect(generate(latestFixed)).rejects.toThrow(
      "requiring author at #/components/schemas/issue no longer changes the merged spec",
    );
  });

  test("a property every vendored spec already requires fails generation", async () => {
    const fixed = withSpecs((v) => {
      for (const doc of Object.values(v)) {
        doc.components.schemas["issue.summary"]!.properties!.parent!.required = ["id"];
      }
    });
    await expect(generate(fixed)).rejects.toThrow(
      "requiring id at #/components/schemas/issue.summary/properties/parent no longer changes the merged spec",
    );
  });

  test("an older spec that already has the fix changes nothing", async () => {
    const olderFixed = withSpecs((v) => {
      v["6.1"]!.components.schemas.issue!.required!.push(...always);
    });
    expect((await generate(olderFixed)).files).toEqual(generated.files);
  });

  test("a correction naming a missing schema or property, or listing none or one twice, fails generation", async () => {
    const correct = (...corrections: { pointer: string; required: string[] }[]) =>
      generate(specs, {
        ...overlay,
        corrections: corrections.map((c) => ({ ...c, reason: "test" })),
      });
    const issue = "#/components/schemas/issue";
    await expect(
      correct({ pointer: "#/components/schemas/isue", required: ["project"] }),
    ).rejects.toThrow("#/components/schemas/isue is not an object schema in 6.1.3-r1.yaml");
    await expect(correct({ pointer: issue, required: ["projects"] })).rejects.toThrow(
      `${issue} has no property projects in 6.1.3-r1.yaml`,
    );
    await expect(correct({ pointer: issue, required: ["constructor"] })).rejects.toThrow(
      `${issue} has no property constructor in 6.1.3-r1.yaml`,
    );
    await expect(correct({ pointer: issue, required: [] })).rejects.toThrow(
      `${issue} lists no property`,
    );
    await expect(
      correct({ pointer: issue, required: ["project"] }, { pointer: issue, required: ["project"] }),
    ).rejects.toThrow(`project at ${issue} is listed twice`);
  });
});
