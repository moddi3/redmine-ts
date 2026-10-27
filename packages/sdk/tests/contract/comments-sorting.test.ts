import { expect, it } from "vite-plus/test";
import { createRedmine } from "../../src/index.ts";
import { clientFor, cleanups, describeServers, freshProject, unique } from "./helpers.ts";

/** A Redmine web session. Redmine takes news comments only from its HTML form, which accepts no API key. */
async function signIn(baseUrl: string, username: string, password: string) {
  const cookies = new Map<string, string>();
  async function send(path: string, form?: Record<string, string>): Promise<Response> {
    const response = await fetch(new URL(path, `${baseUrl}/`), {
      method: form === undefined ? "GET" : "POST",
      headers: {
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        ...(form === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" }),
      },
      ...(form === undefined ? {} : { body: new URLSearchParams(form) }),
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair = ""] = line.split(";");
      const at = pair.indexOf("=");
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return response;
  }
  async function post(page: string, path: string, form: Record<string, string>): Promise<void> {
    const html = await (await send(page)).text();
    const token = /<meta name="csrf-token" content="([^"]+)"/.exec(html)?.[1];
    expect(token, `csrf-token on ${page}`).toBeDefined();
    const response = await send(path, { ...form, authenticity_token: token! });
    expect(response.status, `POST ${path}`).toBe(302);
  }
  await post("login", "login", { username, password });
  return {
    comment: (news_id: number, comments: string) =>
      post(`news/${news_id}`, `news/${news_id}/comments`, { "comment[comments]": comments }),
  };
}

describeServers("lists for a user who reads comments newest first", (server) => {
  const admin = clientFor(server);
  const cleanup = cleanups();

  it("returns a news item's comments oldest first, and normalize: false keeps Redmine's order", async () => {
    const login = unique("desc");
    const password = "contract-pass-1";
    const reader = await admin.users.create({
      login,
      firstname: "Desc",
      lastname: login,
      mail: `${login}@example.net`,
      password,
      admin: true,
      pref: { comments_sorting: "desc" },
    });
    cleanup.add(() => admin.users.delete({ user_id: reader.id }));
    const { api_key: apiKey } = await admin.users.get({ user_id: reader.id });
    const project = await freshProject(admin, cleanup, "news");
    await admin.news.create({ project_id: project.id, title: login, description: "Comment order" });
    const [news] = await admin.news.listByProject({ project_id: project.id }).all();
    const session = await signIn(server.baseUrl, login, password);
    const written = ["Comment 1", "Comment 2", "Comment 3"];
    for (const text of written) await session.comment(news!.id, text);

    const read = async (normalize: boolean) => {
      const rm = createRedmine({ baseUrl: server.baseUrl, auth: { apiKey: apiKey! }, normalize });
      const { comments } = await rm.news.get({ news_id: news!.id, include: ["comments"] });
      return comments?.map((comment) => comment.content);
    };
    expect(await read(false)).toEqual(written.toReversed());
    expect(await read(true)).toEqual(written);
  });
});
