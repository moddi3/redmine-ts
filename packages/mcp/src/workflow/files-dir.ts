// The one local directory tools may touch, configured with REDMINE_MCP_FILES_DIR. A path must resolve
// inside it after symlinks are followed, and a saved file never replaces one that exists.

import type { FileHandle } from "node:fs/promises";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { invalidInput } from "./define.ts";

/** The real path of a regular file inside `dir`, refused before anything is read or sent otherwise. */
export async function fileInside(dir: string, path: string): Promise<string> {
  const root = await realpath(dir);
  let target: string;
  try {
    target = await realpath(resolve(root, path));
  } catch {
    throw invalidInput(`path "${path}" does not exist in the files directory`);
  }
  const inside = relative(root, target);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw invalidInput(`path "${path}" resolves outside the files directory`);
  }
  if (!(await stat(target)).isFile()) {
    throw invalidInput(`path "${path}" is not a regular file`);
  }
  return target;
}

/**
 * A new file in `dir` named after `filename`, with " (1)", " (2)" and so on before the extension when
 * the name is taken. Opened with O_EXCL, so it never follows or replaces an existing file or symlink.
 */
export async function createUnique(
  dir: string,
  filename: string,
  fallback: string,
): Promise<{ path: string; file: FileHandle }> {
  const root = await realpath(dir);
  const { name, ext } = parse(safeName(filename) ?? fallback);
  for (let n = 0; ; n++) {
    const path = join(root, n === 0 ? `${name}${ext}` : `${name} (${n})${ext}`);
    try {
      return { path, file: await open(path, "wx") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

/** The last segment of a name Redmine stores, without separators or control characters. */
function safeName(filename: string): string | undefined {
  const last = filename.split(/[/\\]/).at(-1) ?? "";
  // oxlint-disable-next-line no-control-regex
  const clean = last.replace(/[\u0000-\u001f\u007f]/g, "_").trim();
  return clean === "" || clean === "." || clean === ".." ? undefined : clean;
}
