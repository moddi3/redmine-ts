// Generated from spec/redmine-openapi/*.yaml by `vp run gen`. Do not edit.

export const VERSIONS = ["6.1", "7.0"] as const;

export type RedmineVersion = (typeof VERSIONS)[number];

export type LatestVersion = "7.0";

/** For a declared server version, every version whose additions it includes. */
export interface Ladder {
  "6.1": "6.1";
  "7.0": "6.1" | "7.0";
}
