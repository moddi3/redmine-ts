import { afterAll, describe, it } from "vite-plus/test";
import { createRedmine, RedmineError } from "../../src/index.ts";
import type { CallOptions, RedmineConfig, SdkEvent } from "../../src/index.ts";
import { contractServers } from "./env.ts";
import type { ContractServer } from "./env.ts";

/**
 * `describe.each` over the running servers. With no .redmine/env.json (and REDMINE_CONTRACT unset) the
 * file still registers one skipped suite, because Vitest fails a file with no tests.
 */
export function describeServers(
  title: string,
  body: (server: ContractServer) => void,
  only: (server: ContractServer) => boolean = () => true,
): void {
  const all = contractServers();
  const servers = all.filter(only);
  if (all.length === 0) {
    describe.skip(title, () =>
      it("needs .redmine/env.json: run `node scripts/redmine-env.ts up`", () => {}),
    );
    return;
  }
  describe.each(servers)(`[$name] ${title}`, body);
}

export function clientFor(
  server: ContractServer,
  as: "admin" | "user" | "anonymous" = "admin",
  extra: Partial<RedmineConfig> = {},
) {
  const key = as === "admin" ? server.adminKey : as === "user" ? server.userKey : undefined;
  return createRedmine({
    baseUrl: server.baseUrl,
    version: server.version,
    ...(key === undefined ? {} : { auth: { apiKey: key } }),
    ...extra,
  });
}

export type Client = ReturnType<typeof clientFor>;

/** Unique across reruns, valid as a Redmine project identifier and as a login. */
export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * LIFO cleanups that run after the suite. Something the test already deleted counts as cleaned, so a
 * rerun and a test that deletes its own subject both converge. Any other failure is reported after the rest ran.
 */
export function cleanups() {
  const stack: Array<() => Promise<unknown>> = [];
  afterAll(async () => {
    const failures: unknown[] = [];
    for (const undo of stack.reverse()) {
      try {
        await undo();
      } catch (error) {
        if (!RedmineError.is(error, "not_found")) failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "contract cleanup failed");
  });
  return {
    add(undo: () => Promise<unknown>): void {
      stack.push(undo);
    },
  };
}

/** A project private to the calling test, deleted with everything in it afterwards. */
export async function freshProject(
  admin: Client,
  cleanup: ReturnType<typeof cleanups>,
  prefix = "ct",
) {
  const identifier = unique(prefix);
  const project = await admin.projects.create({ name: identifier, identifier });
  cleanup.add(() => admin.projects.delete({ project_id: project.id }));
  return project;
}

/** Records every SDK event, so a test can assert what did or did not go over the wire. */
export function recorder() {
  const events: SdkEvent[] = [];
  return {
    events,
    onEvent: (event: SdkEvent) => void events.push(event),
    requests: () =>
      events.flatMap((e) => (e.type === "request" ? [{ method: e.method, url: e.url }] : [])),
  };
}

/** Today as the server (UTC in the Docker image) reads it, plus an optional day offset. */
export function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export const sorted = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

export function ids(items: readonly { id: number }[]): number[] {
  return items.map((i) => i.id);
}

export type { CallOptions, ContractServer };
