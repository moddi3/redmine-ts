import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = resolve(root, "docker/compose.yaml");
const envFile = resolve(root, ".redmine/env.json");

const servers = {
  "7.0": { service: "redmine70", baseUrl: "http://localhost:3070" },
  "6.1": { service: "redmine61", baseUrl: "http://localhost:3061" },
  "7.0-subpath": { service: "redmine70-subpath", baseUrl: "http://localhost:3071/redmine" },
} as const;

type ServerKey = keyof typeof servers;

interface ServerEnv {
  baseUrl: string;
  adminKey: string;
  userKey: string;
  projectIdentifier: string;
  customFields: { Severity: number; Tags: number };
}

const adminPassword = "sdk-admin-pass-1";
const userPassword = "sdk-user-pass-1";
const seedMarker = "REDMINE_ENV_JSON ";
const bootTimeoutMs = 10 * 60_000;

// Runs inside the container via `rails runner`. Every statement converges on the target state, so reruns change nothing.
const seedRuby = `
Setting.rest_api_enabled = '1'

Redmine::DefaultData::Loader.load('en') if Redmine::DefaultData::Loader.no_data?

def seed_user(login, attrs, password)
  user = User.find_by(login: login) || User.new(login: login)
  user.assign_attributes(attrs.merge(status: User::STATUS_ACTIVE, language: 'en'))
  user.password = user.password_confirmation = password
  user.must_change_passwd = false
  user.save!
  user
end

admin = seed_user('admin', { admin: true, firstname: 'Redmine', lastname: 'Admin', mail: 'admin@example.net' }, '${adminPassword}')
jsmith = seed_user('jsmith', { admin: false, firstname: 'John', lastname: 'Smith', mail: 'jsmith@example.net' }, '${userPassword}')

project = Project.find_by(identifier: 'sdk-test') || Project.new(identifier: 'sdk-test')
project.name = 'SDK Test'
project.is_public = true
project.tracker_ids = Tracker.pluck(:id)
project.enabled_module_names = %w[issue_tracking time_tracking wiki news files documents]
project.save!

developer = Role.find_by!(name: 'Developer')
member = Member.find_by(project_id: project.id, user_id: jsmith.id) || Member.new(project: project, user: jsmith)
member.role_ids = [developer.id]
member.save!

def seed_issue_field(name, multiple)
  field = IssueCustomField.find_by(name: name) || IssueCustomField.new(name: name)
  field.field_format = 'list'
  field.possible_values = %w[a b c] if multiple
  field.possible_values = %w[S1 S2 S3] unless multiple
  field.multiple = multiple
  field.is_for_all = true
  field.is_required = false
  field.tracker_ids = Tracker.pluck(:id)
  field.save!
  field
end

severity = seed_issue_field('Severity', false)
tags = seed_issue_field('Tags', true)

raise 'no time entry activities' unless TimeEntryActivity.active.exists?

puts '${seedMarker}' + JSON.generate(
  adminKey: admin.api_key,
  userKey: jsmith.api_key,
  projectIdentifier: project.identifier,
  customFields: { Severity: severity.id, Tags: tags.id }
)
`;

const serverKeys = Object.keys(servers) as ServerKey[];

async function compose(...args: string[]) {
  return run("docker", ["compose", "-f", composeFile, ...args], { maxBuffer: 64 * 1024 * 1024 });
}

async function waitForHttp(key: ServerKey) {
  const url = `${servers[key].baseUrl}/`;
  const deadline = Date.now() + bootTimeoutMs;
  for (;;) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
    } catch {}
    if (Date.now() > deadline)
      throw new Error(`${key}: no HTTP answer from ${url} within boot timeout`);
    await new Promise((done) => setTimeout(done, 2_000));
  }
}

async function seed(key: ServerKey): Promise<ServerEnv> {
  const { service, baseUrl } = servers[key];
  const { stdout } = await compose(
    "exec",
    "-T",
    "-u",
    "redmine",
    service,
    "bin/rails",
    "runner",
    "-e",
    "production",
    seedRuby,
  );
  const line = stdout.split("\n").find((l) => l.startsWith(seedMarker));
  if (!line) throw new Error(`${key}: seed printed no result:\n${stdout}`);
  return { baseUrl, ...JSON.parse(line.slice(seedMarker.length)) };
}

async function up() {
  await compose("up", "-d");
  const started = Date.now();
  const results = await Promise.all(
    serverKeys.map(async (key) => {
      await waitForHttp(key);
      const env = await seed(key);
      console.log(
        `${key}: ready and seeded (${Math.round((Date.now() - started) / 1000)}s after start)`,
      );
      return [key, env] as const;
    }),
  );
  await mkdir(dirname(envFile), { recursive: true });
  await writeFile(envFile, JSON.stringify(Object.fromEntries(results), null, 2) + "\n");
  console.log(`wrote ${envFile}`);
}

async function readEnv(): Promise<Record<ServerKey, ServerEnv>> {
  try {
    return JSON.parse(await readFile(envFile, "utf8"));
  } catch {
    throw new Error(`${envFile} missing or unreadable, run \`up\` first`);
  }
}

async function down() {
  await compose("down", "--volumes", "--remove-orphans");
}

async function smoke() {
  const env = await readEnv();
  let failed = false;

  for (const key of serverKeys) {
    const { baseUrl, adminKey, projectIdentifier, customFields } = env[key];

    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "X-Redmine-API-Key": adminKey,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, json: text ? JSON.parse(text) : undefined };
    };

    const check = async (name: string, fn: () => Promise<string>) => {
      try {
        console.log(`PASS ${key} ${name}: ${await fn()}`);
      } catch (error) {
        failed = true;
        console.log(
          `FAIL ${key} ${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const expect = (condition: unknown, message: string) => {
      if (!condition) throw new Error(message);
    };

    let issueId = 0;

    await check("GET /users/current.json", async () => {
      const { status, json } = await call("GET", "/users/current.json");
      expect(status === 200, `status ${status}`);
      expect(json.user.login === "admin", `login ${json.user.login}`);
      return `login=${json.user.login}`;
    });

    await check("POST /issues.json with Severity", async () => {
      const { status, json } = await call("POST", "/issues.json", {
        issue: {
          project_id: projectIdentifier,
          subject: `smoke ${new Date().toISOString()}`,
          custom_fields: [{ id: customFields.Severity, value: "S2" }],
        },
      });
      expect(status === 201, `status ${status} ${JSON.stringify(json)}`);
      issueId = json.issue.id;
      return `id=${issueId}`;
    });

    await check("GET /issues/:id.json round-trip", async () => {
      const { status, json } = await call("GET", `/issues/${issueId}.json`);
      expect(status === 200, `status ${status}`);
      const severity = json.issue.custom_fields.find(
        (f: { id: number }) => f.id === customFields.Severity,
      );
      expect(severity?.value === "S2", `Severity ${JSON.stringify(severity)}`);
      return `Severity=${severity.value}`;
    });

    await check("GET /issues.json?limit=1", async () => {
      const { status, json } = await call("GET", "/issues.json?limit=1");
      expect(status === 200, `status ${status}`);
      expect(json.issues.length === 1 && json.limit === 1, `got ${json.issues.length} issues`);
      return `total_count=${json.total_count}`;
    });

    if (issueId) {
      await check("DELETE /issues/:id.json cleanup", async () => {
        const { status } = await call("DELETE", `/issues/${issueId}.json`);
        expect(status === 204, `status ${status}`);
        return `id=${issueId}`;
      });
    }
  }

  if (failed) process.exitCode = 1;
}

const commands = {
  up,
  down,
  env: async () => process.stdout.write(JSON.stringify(await readEnv(), null, 2) + "\n"),
  smoke,
};

const command = process.argv[2];
if (!(command in commands)) {
  console.error(`usage: node scripts/redmine-env.ts <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}
await commands[command as keyof typeof commands]();
