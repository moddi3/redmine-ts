import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { localFiles } from "../../src/node.ts";

/** Run right after files-dir opens a file or resolves a path, to change the directory in between. */
const afterOpen: { run?: () => void } = {};
const afterRealpath: { run?: () => void } = {};

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    open: async (...args: Parameters<typeof real.open>) => {
      const handle = await real.open(...args);
      afterOpen.run?.();
      return handle;
    },
    realpath: async (...args: Parameters<typeof real.realpath>) => {
      const resolved = await real.realpath(...args);
      afterRealpath.run?.();
      return resolved;
    },
  };
});

describe("reading a file of the files directory", () => {
  let root: string;
  let dir: string;

  beforeEach(() => {
    afterOpen.run = undefined;
    afterRealpath.run = undefined;
    root = mkdtempSync(join(tmpdir(), "redmine-mcp-files-"));
    dir = join(root, "files");
    mkdirSync(join(dir, "logs"), { recursive: true });
    writeFileSync(join(dir, "logs", "app.log"), "line 1\n");
    mkdirSync(join(root, "elsewhere"));
    writeFileSync(join(root, "elsewhere", "app.log"), "secret\n");
  });

  it("refuses a handle opened through a symlinked directory that is swapped back before the checks", async () => {
    const file = await localFiles(dir).open("logs/app.log");
    renameSync(join(dir, "logs"), join(root, "logs-moved"));
    symlinkSync(join(root, "elsewhere"), join(dir, "logs"));
    afterOpen.run = () => {
      rmSync(join(dir, "logs"));
      renameSync(join(root, "logs-moved"), join(dir, "logs"));
    };
    await expect(file.bytes()).rejects.toThrow('path "logs/app.log" changed while it was read');
  });

  it("refuses a handle opened through a symlinked directory that the lookups after the open do not see", async () => {
    // Only the open's own check on macOS, or the handle's path in /proc on Linux, can tell: the
    // re-resolved path sees the directory, and lstat then follows the symlink to the same outside file.
    const file = await localFiles(dir).open("logs/app.log");
    const toLink = () => {
      renameSync(join(dir, "logs"), join(root, "logs-moved"));
      symlinkSync(join(root, "elsewhere"), join(dir, "logs"));
    };
    const toDirectory = () => {
      rmSync(join(dir, "logs"));
      renameSync(join(root, "logs-moved"), join(dir, "logs"));
    };
    toLink();
    afterOpen.run = () => {
      afterOpen.run = undefined;
      toDirectory();
      afterRealpath.run = () => {
        afterRealpath.run = undefined;
        toLink();
      };
    };
    await expect(file.bytes()).rejects.toThrow('path "logs/app.log" changed while it was read');
  });

  it("refuses a file that grows after its size was checked", async () => {
    const file = await localFiles(dir).open("logs/app.log");
    expect(file.size).toBe(7);
    appendFileSync(join(dir, "logs", "app.log"), "x".repeat(1024));
    await expect(file.bytes()).rejects.toThrow("changed while it was read");
  });

  it("refuses a FIFO swapped in after the check instead of waiting on it", async () => {
    const file = await localFiles(dir).open("logs/app.log");
    rmSync(join(dir, "logs", "app.log"));
    execFileSync("mkfifo", [join(dir, "logs", "app.log")]);
    await expect(file.bytes()).rejects.toThrow("changed while it was read");
  });

  it.skipIf(process.getuid?.() === 0)(
    "refuses a file it cannot open, naming the error",
    async () => {
      const file = await localFiles(dir).open("logs/app.log");
      chmodSync(join(dir, "logs", "app.log"), 0o000);
      await expect(file.bytes()).rejects.toThrow(
        'path "logs/app.log" could not be opened (EACCES)',
      );
    },
  );

  it("reads the file when nothing changed", async () => {
    const file = await localFiles(dir).open("logs/app.log");
    expect(new TextDecoder().decode(await file.bytes())).toBe("line 1\n");
  });
});
