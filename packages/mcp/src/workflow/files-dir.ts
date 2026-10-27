// The one local directory tools may touch, configured with REDMINE_MCP_FILES_DIR. A path must resolve
// inside it after symlinks are followed, and a saved file never replaces one that exists. Node only:
// the web-standard server reaches this through the LocalFiles it is given, never by import.

import { realpathSync } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { open, readFile, realpath, rm, stat } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import type { LocalFiles } from "../tools.ts";
import { invalidInput } from "./define.ts";

/** The files directory `dir` for createRedmineMcpServer's `files` option. Throws when `dir` does not exist. */
export function localFiles(dir: string): LocalFiles {
  const root = realpathSync.native(dir);
  return {
    dir: root,
    async open(path) {
      const target = await fileInside(root, path);
      const { size } = await stat(target);
      return { size, bytes: async () => new Uint8Array(await readFile(target)) };
    },
    async save(filename, fallback, body) {
      const { path, file } = await createUnique(root, filename, fallback);
      let bytes = 0;
      try {
        for await (const chunk of body) {
          await file.write(chunk);
          bytes += chunk.byteLength;
        }
      } catch (error) {
        await file.close();
        await rm(path, { force: true });
        throw error;
      }
      await file.close();
      return { path, bytes };
    },
  };
}

/** The real path of a regular file inside `dir`, refused before anything is read or sent otherwise. */
async function fileInside(dir: string, path: string): Promise<string> {
  let target: string;
  try {
    target = await realpath(resolve(dir, path));
  } catch {
    throw invalidInput(`path "${path}" does not exist in the files directory "${dir}"`);
  }
  const inside = relative(dir, target);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw invalidInput(`path "${path}" resolves outside the files directory "${dir}"`);
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
async function createUnique(
  dir: string,
  filename: string,
  fallback: string,
): Promise<{ path: string; file: FileHandle }> {
  const { name, ext } = parse(safeName(filename) ?? fallback);
  for (let n = 0; ; n++) {
    const path = join(dir, n === 0 ? `${name}${ext}` : `${name} (${n})${ext}`);
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
