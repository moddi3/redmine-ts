// redmine-ts-sdk. Module map and the public surface (src/index.ts). Directory is layout under packages/sdk/.
//
//  packages/sdk/
//    spec/ (repo root)   redmine-openapi/6.1.3-r1.yaml, 7.0.1-r1.yaml     INPUT, vendored, pinned
//    generator/          parse merge overlay model emit/* run             BUILD-TIME, hand-written, not shipped
//    src/generated/      versions schemas ops slots resources catalog      OUTPUT, committed, never edited, `gen --check` in CI
//    src/core/           op  version errors config wire listing engine files quirks     HAND-WRITTEN runtime, generic over Op
//    src/redmine.ts      createRedmine: engine + SLOTS + extras                       ASSEMBLY (the only file importing both halves)
//    src/index.ts        public re-exports (below)
//    src/testing.ts      fakeRedmine                                     entry: redmine-ts-sdk/testing
//    src/catalog.ts      catalog, availableIn                            entry: redmine-ts-sdk/catalog
//    tests/unit/         fake-transport behavior tests (vp test)
//    tests/contract/     real Docker Redmine 6.1 and 7.0 matrix (vp test --project contract)
//
// Dependency direction (enforced by an oxlint no-restricted-imports rule, plus package.json "exports" hiding everything else):
//    generated/*  ──▶  core/op.ts, core/version.ts            (types only; generated code has no logic)
//    core/*       ──▶  core/*                                  (never imports generated/, except generated/versions.ts for the ladder)
//    redmine.ts   ──▶  core/*, generated/slots, generated/resources
//  So the engine is testable with a hand-made registry, and a regenerate can never change runtime logic.
//
// package.json exports (4 entries; nothing else is importable):
//    "."          createRedmine, types, ops, RedmineError
//    "./testing"  fakeRedmine
//    "./catalog"  catalog, availableIn
//    "./package.json"

export { createRedmine } from "./redmine.ts";
export type { Redmine, Core, Extras } from "./redmine.ts";
export type { RedmineConfig, Auth, BearerSource, RetryPolicy, CallOptions, SdkEvent } from "./config.ts";
export { RedmineError } from "./errors.ts";
export type { RedmineErrorData, ErrorKind } from "./errors.ts";
export type { Listing, Page, ListInput, Cond } from "./listing.ts";
export type { Files, UploadRef, Download, BinarySource } from "./files.ts";
export type { Version, Latest } from "./version.ts";
export { VERSIONS } from "./version.ts";
export type { InputOf, ReturnOf } from "./op.ts";
export { ops } from "./generated-example.ts"; // generated: every operation as data, for rm.call
export type * from "./generated-example.ts"; // generated: Issue, Project, User, TimeEntry, ... (snake_case, = the wire)
// Deliberately NOT exported: Op, Slot, Plan, Engine, wire.ts, interpret/decode, anything under generated/ not listed above.
