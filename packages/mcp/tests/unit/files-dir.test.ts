import { execFileSync } from "node:child_process";
import {
  appendFileSync,
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

/** Runs right after files-dir opens a file, to change the directory between the open and the checks. */
const afterOpen: { run?: () => void } = {};

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    open: async (...args: Parameters<typeof real.open>) => {
      const handle = await real.open(...args);
      afterOpen.run?.();
      return handle;
    },
  };
});

describe("reading a file of the files directory", () => {
  let root: string;
  let dir: string;

  beforeEach(() => {
    afterOpen.run = undefined;
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

  it("refuses a file that grows after its size was checked, without reading it", async () => {
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

  it("reads the file when nothing changed", async () => {
    const file = await localFiles(dir).open("logs/app.log");
    expect(new TextDecoder().decode(await file.bytes())).toBe("line 1\n");
  });
});
