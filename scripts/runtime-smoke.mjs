// Plain JS so `node` and `bun` run the built packages unchanged. Run `vp run -r build` and
// `node scripts/redmine-env.ts up` first.
import { readFileSync } from "node:fs";
import { createRedmineMcpHandler } from "../packages/mcp/dist/index.mjs";
import { createRedmine, RedmineError } from "../packages/sdk/dist/index.mjs";

const runtime = globalThis.Bun ? `bun ${Bun.version}` : `node ${process.versions.node}`;
const env = JSON.parse(readFileSync(new URL("../.redmine/env.json", import.meta.url), "utf8"));

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function errorKind(promise) {
  try {
    await promise;
    return "no error";
  } catch (error) {
    if (!(error instanceof RedmineError)) throw error;
    return error.kind;
  }
}

async function smoke(name, server) {
  const version = name.startsWith("6.1") ? "6.1" : "7.0";
  const rm = createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: server.adminKey }, version });
  const severity = `cf_${server.customFields.Severity}`;
  const passed = [];
  let current;
  const check = async (label, fn) => {
    current = label;
    await fn();
    passed.push(label);
  };

  let issueId;
  try {
    await check("users.current", async () => {
      const me = await rm.users.current();
      expect(me.login === "admin", `login ${me.login}`);
    });

    await check("mcp http handler", async () => {
      const handle = createRedmineMcpHandler({ baseUrl: server.baseUrl, version });
      // A 2025-era tools/call, which a stateless server answers without a handshake.
      const call = (headers) =>
        handle(
          new Request("http://localhost/mcp", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json, text/event-stream",
              ...headers,
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: "users_current", arguments: {} },
            }),
          }),
        );
      const refused = await call({});
      expect(refused.status === 401, `no key answered ${refused.status}`);
      const body = await (await call({ "X-Redmine-API-Key": server.adminKey })).text();
      const message = JSON.parse(/^data: (.*)$/m.exec(body)?.[1] ?? body);
      expect(message.result?.structuredContent?.login === "admin", body.slice(0, 200));
    });

    await check("issues.create", async () => {
      const created = await rm.issues.create({
        project_id: server.projectIdentifier,
        subject: `runtime smoke ${runtime} ${Date.now()}`,
        custom_fields: [{ id: server.customFields.Severity, value: "S3" }],
      });
      issueId = created.id;
    });

    await check("issues.update", () =>
      rm.issues.update({ issue_id: issueId, notes: `noted by ${runtime}` }),
    );

    await check("issues.get include", async () => {
      const issue = await rm.issues.get({
        issue_id: issueId,
        include: ["journals", "allowed_statuses"],
      });
      expect(
        issue.journals.some((journal) => journal.notes === `noted by ${runtime}`),
        "note missing from journals",
      );
      expect(issue.allowed_statuses.length > 0, "no allowed_statuses");
    });

    await check("issues.list where", async () => {
      const where = { project_id: server.projectIdentifier, status_id: "open", [severity]: "S3" };
      const ids = [];
      for await (const issue of rm.issues.list({ where, pageSize: 2 })) ids.push(issue.id);
      expect(ids.includes(issueId), `#${issueId} not in filtered list`);
      const count = await rm.issues.list({ where }).count();
      expect(count === ids.length, `count ${count}, iterated ${ids.length}`);
    });

    await check("attachments round-trip", async () => {
      const bytes = Uint8Array.from({ length: 4096 }, (_, i) => (i * 7 + 3) % 256);
      const upload = await rm.attachments.upload({
        file: new Blob([bytes]),
        filename: "smoke.bin",
      });
      await rm.issues.update({ issue_id: issueId, uploads: [upload] });
      const issue = await rm.issues.get({ issue_id: issueId, include: ["attachments"] });
      const download = await rm.attachments.download(issue.attachments[0]);
      const received = await download.bytes();
      expect(
        received.length === bytes.length && received.every((byte, i) => byte === bytes[i]),
        `downloaded ${received.length} bytes that differ from the upload`,
      );
    });

    await check("422 validation", async () => {
      const kind = await errorKind(rm.issues.update({ issue_id: issueId, subject: "" }));
      expect(kind === "validation", `got ${kind}`);
    });

    await check("412 switch_user_rejected", async () => {
      const kind = await errorKind(rm.with({ as: "no-such-user" }).users.current());
      expect(kind === "switch_user_rejected", `got ${kind}`);
    });

    if (version === "6.1") {
      await check("version gate", async () => {
        const kind = await errorKind(rm.groups.removeUsers({ group_id: 1, user_ids: [1] }));
        expect(kind === "unsupported_version", `got ${kind}`);
      });
    }

    await check("issues.delete", async () => {
      await rm.issues.delete({ issue_id: issueId });
      const kind = await errorKind(rm.issues.get({ issue_id: issueId }));
      issueId = undefined;
      expect(kind === "not_found", `deleted issue answered ${kind}`);
    });

    console.log(`PASS ${name} ${runtime}: ${passed.join(", ")}`);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`FAIL ${name} ${runtime} ${current}: ${reason}`);
    if (issueId) await rm.issues.delete({ issue_id: issueId }).catch(() => {});
    return false;
  }
}

let ok = true;
for (const [name, server] of Object.entries(env)) ok = (await smoke(name, server)) && ok;
if (!ok) process.exitCode = 1;
