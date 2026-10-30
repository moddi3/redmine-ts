import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("waits while another live run holds it, names it, then takes it", async () => {
    const lock = fresh();
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), JSON.stringify({ pid: 1, by: "/elsewhere", since: "then" }));
    const lines: string[] = [];
    let release: (() => void) | undefined;
    const waiting = acquireContractLock(lock, { ...fast, log: (line) => lines.push(line) }).then(
      (taken) => (release = taken),
    );
    await new Promise((done) => setTimeout(done, 200));
    expect(release).toBeUndefined();
    expect(lines).toEqual([`${lock} is held by pid 1 (/elsewhere) since then; waiting`]);
    rmSync(lock, { recursive: true });
    await waiting;
    expect(pidIn(lock)).toBe(process.pid);
    release!();
  });

  it("lets a second project of the same run in, and keeps the lock until the first releases", async () => {
    const lock = fresh();
    const first = await acquireContractLock(lock, fast);
    const second = await acquireContractLock(lock, { ...fast, timeoutMs: 0 });
    second();
    expect(pidIn(lock)).toBe(process.pid);
    first();
    expect(existsSync(lock)).toBe(false);
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
