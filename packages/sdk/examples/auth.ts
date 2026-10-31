import { createRedmine } from "@redmine-ts/sdk";

const withPassword = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: { basic: { login: "jsmith", password: process.env.REDMINE_PASSWORD! } },
});
console.log((await withPassword.users.current()).login);

declare function renewAccessToken(): Promise<string>;
let accessToken = process.env.REDMINE_ACCESS_TOKEN!;

const withOAuth = createRedmine({
  baseUrl: "https://tracker.example.com/redmine",
  auth: {
    bearer: {
      token: () => accessToken,
      refresh: async () => {
        accessToken = await renewAccessToken();
        return accessToken;
      },
    },
  },
});
console.log((await withOAuth.users.current()).login);
