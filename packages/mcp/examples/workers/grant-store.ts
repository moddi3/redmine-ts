import { DurableObject } from "cloudflare:workers";
import type { GrantStore } from "@redmine-ts/mcp";

/** One object per key: its storage calls do not interleave, so get-then-put is atomic. */
export class GrantKey extends DurableObject {
  async consume(ttlSeconds: number): Promise<boolean> {
    const until = await this.ctx.storage.get<number>("until");
    if (until !== undefined && until > Date.now()) return false;
    await this.ctx.storage.put("until", Date.now() + ttlSeconds * 1000);
    await this.ctx.storage.setAlarm(Date.now() + ttlSeconds * 1000);
    return true;
  }
  async has(): Promise<boolean> {
    const until = await this.ctx.storage.get<number>("until");
    return until !== undefined && until > Date.now();
  }
  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

export function grantStore(keys: DurableObjectNamespace<GrantKey>): GrantStore {
  return {
    consume: (key, ttlSeconds) => keys.get(keys.idFromName(key)).consume(ttlSeconds),
    has: (key) => keys.get(keys.idFromName(key)).has(),
  };
}
