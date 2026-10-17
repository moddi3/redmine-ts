import { VERSIONS, type Ladder, type RedmineVersion } from "../generated/versions.ts";
import { RedmineError } from "./errors.ts";

/** True when a server declared as D has everything introduced in S. A lookup, not type arithmetic. */
export type AtLeast<D extends RedmineVersion, S extends RedmineVersion> = S extends Ladder[D]
  ? true
  : false;

/**
 * Parses a server version string from config or env ("7.0", "7.0.1") into a supported x.y.
 * Redmine does not report its version over the API, so it is always declared, never detected.
 */
export function parseRedmineVersion(raw: string): RedmineVersion {
  const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(raw.trim());
  const found = match && VERSIONS.find((v) => v === `${match[1]}.${match[2]}`);
  if (!found) {
    throw new RedmineError({
      kind: "invalid_input",
      detail: `unsupported Redmine version "${raw}", expected one of ${VERSIONS.join(", ")}`,
    });
  }
  return found;
}

/** Runtime twin of AtLeast. No declared version means no guard. */
export function isAvailable(
  declared: RedmineVersion | undefined,
  since: RedmineVersion,
  until: RedmineVersion | null,
): boolean {
  if (declared === undefined) return true;
  const at = VERSIONS.indexOf(declared);
  return at >= VERSIONS.indexOf(since) && (until === null || at <= VERSIONS.indexOf(until));
}
