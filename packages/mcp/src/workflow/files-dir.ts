// The one local directory tools may touch, configured with REDMINE_MCP_FILES_DIR. A path must resolve
// inside it after symlinks are followed, and a saved file never replaces one that exists. Node only:
// the web-standard server reaches this through the LocalFiles it is given, never by import.

import { constants, realpathSync } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, open, readlink, realpath, rm, stat } from "node:fs/promises";
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
      return { size, bytes: () => readChecked(root, path, target, size) };
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

/**
 * The real path of a regular file inside `root`, the files directory with symlinks resolved, refused
 * before anything is read or sent otherwise.
 */
async function fileInside(root: string, path: string): Promise<string> {
  let target: string;
  try {
    target = await realpath(resolve(root, path));
  } catch {
    throw invalidInput(`path "${path}" does not exist in the files directory "${root}"`);
  }
  const inside = relative(root, target);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw invalidInput(`path "${path}" resolves outside the files directory "${root}"`);
  }
  if (!(await stat(target)).isFile()) {
    throw invalidInput(`path "${path}" is not a regular file`);
  }
  return target;
}

/**
 * The `size` bytes of `target`, read through one handle that is checked against what `path` names
 * inside `root` after it is opened. The path may have changed since `fileInside` checked it, for example
 * into a symlink to a file outside, and a read by path would follow it. On macOS the open refuses a
 * symlink anywhere on `target`, which has none once resolved, and on Linux the handle's own path in
 * /proc settles it. Elsewhere, or on Linux without /proc, a directory on the path that keeps flipping
 * between a directory and a symlink can still pass the separate lookups below, which is why only trusted
 * users should write in the files directory.
 */
async function readChecked(
  root: string,
  path: string,
  target: string,
  size: number,
): Promise<Uint8Array> {
  // O_NONBLOCK keeps a FIFO swapped in from blocking the open; it is refused as not a file below.
  const flags = constants.O_RDONLY | NO_SYMLINKS | (constants.O_NONBLOCK ?? 0);
  const file = await open(target, flags).catch((error: NodeJS.ErrnoException) => {
    throw ["ELOOP", "ENOENT", "ENOTDIR"].includes(error.code ?? "")
      ? changed(path)
      : invalidInput(`path "${path}" could not be opened (${error.code ?? error.message})`);
  });
  try {
    const opened = await file.stat();
    const again = await fileInside(root, path).catch(() => undefined);
    const now = again === target ? await lstat(target).catch(() => undefined) : undefined;
    const where = await readlink(`/proc/self/fd/${file.fd}`).catch(() => target);
    if (
      !opened.isFile() ||
      opened.size !== size ||
      now?.dev !== opened.dev ||
      now?.ino !== opened.ino ||
      where !== target
    ) {
      throw changed(path);
    }
    // At most the size the caller checked, so a file that grows meanwhile is refused, not held.
    const bytes = new Uint8Array(size);
    let read = 0;
    while (read < size) {
      const { bytesRead } = await file.read(bytes, read, size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    if (read !== size || (await file.stat()).size !== size) throw changed(path);
    return bytes;
  } finally {
    await file.close();
  }
}

/**
 * Darwin's O_NOFOLLOW_ANY, which fs.constants lacks, refuses a symlink anywhere on the path, and it
 * cannot be combined with O_NOFOLLOW. Elsewhere O_NOFOLLOW refuses one in the last segment.
 */
const NO_SYMLINKS = process.platform === "darwin" ? 0x20000000 : (constants.O_NOFOLLOW ?? 0);

function changed(path: string): Error {
  return invalidInput(`path "${path}" changed while it was read`);
}

/**
 * A new file in `root`, the files directory with symlinks resolved, named after `filename`, with " (1)",
 * " (2)" and so on before the extension when the name is taken. Opened with O_EXCL, so it never follows or replaces an existing file or symlink.
 */
async function createUnique(
  root: string,
  filename: string,
  fallback: string,
): Promise<{ path: string; file: FileHandle }> {
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
