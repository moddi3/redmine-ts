// Version ladder. VERSIONS and AVAILABLE_AT are GENERATED from the filenames in spec/redmine-openapi/
// (x.y granularity). Adding 7.1 = dropping 7.1.0-r1.yaml into spec/ and re-running `vp run gen`.
// Shown here as the generator emits them (src/generated/versions.ts).

export const VERSIONS = ["6.1", "7.0"] as const;
export type Version = (typeof VERSIONS)[number];
export type Latest = "7.0";

/** For a declared server version, the set of spec versions whose additions it includes. */
export interface Ladder {
  "6.1": "6.1";
  "7.0": "6.1" | "7.0";
}

/** True when a server declared as D has everything introduced in S. Pure type-level lookup, no recursion. */
export type AtLeast<D extends Version, S extends Version> = S extends Ladder[D] ? true : false;

// ---- hand-written runtime half (src/core/version.ts) ----

/** Position in the ladder; unknown strings throw at createRedmine (boundary), never later. */
export function parseVersion(raw: string): Version {
  throw new Error("not implemented"); // TODO: accept "7.0", "7.0.1" -> "7.0"; reject anything not in VERSIONS with invalid_input
}

/** Runtime twin of AtLeast, used by the engine guard: since <= declared <= until(or latest). */
export function isAvailable(declared: Version | undefined, since: Version, until: Version | null): boolean {
  throw new Error("not implemented"); // TODO: declared === undefined -> true (no guard, superset typing)
}
