import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Who holds the lock directory. A directory without a pid file was made by hand with `mkdir`, or by a
 * run that has not written its pid yet, and is held either way.
 */
type Holder =
  | { kind: "free" }
  | { kind: "by-hand"; since: Date }
  | { kind: "run"; pid: number; by: string; since: string; alive: boolean };

interface PidFile {
  pid: number;
  by: string;
  since: string;
}

export interface LockOptions {
  timeoutMs?: number;
  pollMs?: number;
  log?: (line: string) => void;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The three Docker Redmines are one per machine, but agents run in separate git worktrees, so the lock
 * lives in the main checkout's .redmine, where the manual `mkdir` protocol takes it too.
 */
export function contractLockPath(): string {
  try {
    const common = execFileSync(
      "git",
      ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return join(dirname(common), ".redmine", "contract.lock");
  } catch {
    return join(root, ".redmine", "contract.lock");
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function holder(lock: string): Holder {
  let since: Date;
  try {
    since = statSync(lock).mtime;
  } catch {
    return { kind: "free" };
  }
  try {
    const file: PidFile = JSON.parse(readFileSync(join(lock, "pid"), "utf8"));
    return { kind: "run", ...file, alive: alive(file.pid) };
  } catch {
    return { kind: "by-hand", since };
  }
}

function holdingLine(lock: string, held: Exclude<Holder, { kind: "free" }>): string {
  return held.kind === "by-hand"
    ? `${lock} was made by hand at ${held.since.toISOString()} and is held until its rmdir`
    : `${lock} is held by pid ${held.pid} (${held.by}) since ${held.since}`;
}

function pidFile(): string {
  const file: PidFile = { pid: process.pid, by: process.cwd(), since: new Date().toISOString() };
  return JSON.stringify(file) + "\n";
}

/**
 * Takes a stale lock in place, so that no other run can `mkdir` the directory in between. The
 * `takeover` directory lets one of several waiters that saw the same dead pid win.
 */
function takeOver(lock: string, stalePid: number): boolean {
  const takeover = join(lock, "takeover");
  try {
    mkdirSync(takeover);
  } catch {
    return false;
  }
  try {
    const now = holder(lock);
    if (now.kind !== "run" || now.pid !== stalePid) return false;
    writeFileSync(join(lock, "pid"), pidFile());
    return true;
  } finally {
    rmdirSync(takeover);
  }
}

function tryTake(lock: string): boolean {
  try {
    mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  writeFileSync(join(lock, "pid"), pidFile(), { flag: "wx" });
  return true;
}

/** Removes the lock only while its pid file names this process. */
function release(lock: string): void {
  const held = holder(lock);
  if (held.kind !== "run" || held.pid !== process.pid) return;
  rmSync(lock, { recursive: true });
}

/** Waits for the lock directory and returns the function that releases it. */
export async function acquireContractLock(
  lock: string,
  {
    timeoutMs = 30 * 60_000,
    pollMs = 2_000,
    log = (line) => process.stderr.write(`${line}\n`),
  }: LockOptions = {},
): Promise<() => void> {
  mkdirSync(dirname(lock), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let said = "";
  for (;;) {
    if (tryTake(lock)) return () => release(lock);
    const held = holder(lock);
    if (held.kind === "free") continue;
    if (held.kind === "run" && !held.alive && takeOver(lock, held.pid)) {
      log(`${lock}: took over from pid ${held.pid}, which is gone`);
      return () => release(lock);
    }
    const line = holdingLine(lock, held);
    if (line !== said) log(`${line}; waiting`);
    said = line;
    if (Date.now() >= deadline) {
      throw new Error(
        `Gave up on the contract lock after ${timeoutMs / 1000} s: ${line}. Remove it by hand only if nothing runs the contract suites.`,
      );
    }
    await new Promise((done) => setTimeout(done, pollMs));
  }
}

/**
 * Vitest globalSetup of the contract projects. Without .redmine/env.json in this checkout the contract
 * suites skip and touch no Redmine, so there is nothing to lock.
 */
export default async function setup(): Promise<(() => void) | undefined> {
  if (!existsSync(join(root, ".redmine", "env.json"))) return undefined;
  return acquireContractLock(contractLockPath());
}
