import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { acquireContractLock } from "../../../../scripts/contract-lock.ts";

const fresh = () => join(mkdtempSync(join(tmpdir(), "contract-lock-")), "contract.lock");
const pidIn = (lock: string) => JSON.parse(readFileSync(join(lock, "pid"), "utf8")).pid;
const fast = { pollMs: 20, log: () => {} };

describe("the contract lock", () => {
  it("takes a free lock with this pid and removes it on release", async () => {
    const lock = fresh();
    const release = await acquireContractLock(lock, fast);
    expect(pidIn(lock)).toBe(process.pid);
    release();
    expect(existsSync(lock)).toBe(false);
  });

  it("waits while a live run holds it, then takes it", async () => {
    const lock = fresh();
    const first = await acquireContractLock(lock, fast);
    let second: (() => void) | undefined;
    const waiting = acquireContractLock(lock, fast).then((release) => (second = release));
    await new Promise((done) => setTimeout(done, 200));
    expect(second).toBeUndefined();
    first();
    await waiting;
    expect(pidIn(lock)).toBe(process.pid);
    second!();
  });

  it("waits on a lock made by hand, names it, gives up, and leaves it in place", async () => {
    const lock = fresh();
    mkdirSync(lock);
    const lines: string[] = [];
    await expect(
      acquireContractLock(lock, { ...fast, timeoutMs: 300, log: (line) => lines.push(line) }),
    ).rejects.toThrow(/Gave up on the contract lock after 0.3 s: .* was made by hand/);
    expect(lines).toEqual([
      expect.stringMatching(/was made by hand at .* until its rmdir; waiting/),
    ]);
    expect(existsSync(lock)).toBe(true);
  });

  it("takes over a lock whose pid is gone", async () => {
    const lock = fresh();
    const gone = spawnSync(process.execPath, ["-e", ""]).pid!;
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), JSON.stringify({ pid: gone, by: "/elsewhere", since: "" }));
    const lines: string[] = [];
    const release = await acquireContractLock(lock, { ...fast, log: (line) => lines.push(line) });
    expect(pidIn(lock)).toBe(process.pid);
    expect(lines).toEqual([`${lock}: took over from pid ${gone}, which is gone`]);
    release();
  });

  it("leaves the lock alone on release once another run holds it", async () => {
    const lock = fresh();
    const release = await acquireContractLock(lock, fast);
    writeFileSync(join(lock, "pid"), JSON.stringify({ pid: 1, by: "/elsewhere", since: "" }));
    release();
    expect(pidIn(lock)).toBe(1);
  });
});
