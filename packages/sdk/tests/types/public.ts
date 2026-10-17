// Typechecked by `vp check`, never executed.

import * as sdk from "../../src/index.ts";
import type {
  CreateIssueInput,
  GetIssueInclude,
  GetIssuesInput,
  GetIssuesWhere,
  Issue,
  UpdateIssueInput,
} from "../../src/index.ts";

export const where: GetIssuesWhere = { status_id: "open", cf_12: ["S1", "S2"] };
export const input: GetIssuesInput<"relations"> = { where, include: ["relations"] };
export const include: GetIssueInclude[] = ["journals"];
export const create: CreateIssueInput = { project_id: "web", subject: "Crash on save" };
export const update: UpdateIssueInput = { issue_id: 42, notes: "ack" };
export declare const issue: Issue;

// @ts-expect-error operation descriptors stay internal
export const registry = sdk.ops;
// @ts-expect-error operation descriptors stay internal
export const descriptor = sdk.getIssue;
// @ts-expect-error the namespace table stays internal
export const slots = sdk.SLOTS;
// @ts-expect-error hidden operations have no public input type
export type Hidden = sdk.GetIssuesByProjectInput;
