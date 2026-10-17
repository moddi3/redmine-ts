import { expect, it } from "vite-plus/test";
import { cleanups, clientFor, describeServers, recorder, unique } from "./helpers.ts";

describeServers(
  "baseUrl with a subpath",
  (server) => {
    const seen = recorder();
    const admin = clientFor(server, "admin", { onEvent: seen.onEvent });
    const cleanup = cleanups();

    it("every typed, paged, binary and raw request keeps the /redmine prefix", async () => {
      const issue = await admin.issues.create({
        project_id: server.projectIdentifier,
        subject: unique("subpath"),
      });
      cleanup.add(() => admin.issues.delete({ issue_id: issue.id }));
      const upload = await admin.attachments.upload({ file: new Blob(["sub"]), filename: "s.txt" });
      await admin.issues.update({ issue_id: issue.id, uploads: [upload] });
      const read = await admin.issues.get({ issue_id: issue.id, include: ["attachments"] });
      const download = await admin.attachments.download(read.attachments[0]!);
      await admin.issues
        .list({ where: { project_id: server.projectIdentifier }, pageSize: 2 })
        .page();
      await admin.request({ method: "GET", path: "issue_statuses.json" });

      expect(new TextDecoder().decode(await download.bytes())).toBe("sub");
      const urls = seen.requests().map((r) => new URL(r.url));
      expect(urls.length).toBeGreaterThanOrEqual(7);
      expect(urls.every((u) => u.pathname.startsWith("/redmine/"))).toBe(true);
      expect(urls.some((u) => u.pathname.startsWith("/redmine/attachments/download/"))).toBe(true);
    });
  },
  (s) => s.name === "7.0-subpath",
);
