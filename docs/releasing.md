# Releasing

[Changesets](https://changesets.dev) versions and publishes the packages in this repo. Nothing reaches npm until the owner merges the Version Packages pull request.

## Add a changeset to your change

If your change affects what users of a package get, add a changeset in the same pull request:

```sh
vp run changeset
```

Pick the packages and the bump type, and write one or two sentences for the changelog. The command writes a Markdown file under `.changeset/`. Commit it with the change.

Pick the bump from the user's side. While a package is on `0.x`, a breaking change is a `minor` bump and everything else is a `patch` bump. Adding a supported Redmine version is a `minor` bump. Dropping one is breaking.

A change only to tests, CI, or documentation outside the package READMEs needs no changeset. npm shows the README of each package's last release, so a change to `packages/sdk/README.md` or `packages/mcp/README.md` needs a `patch` changeset to reach npm.

Run `vp run changeset status` to see which packages the pending changesets bump.

## How a release happens

`.github/workflows/release.yml` runs on every push to `main`:

1. The `select-mode` job reads `.changeset/`. If it finds changesets, the mode is `version`. If it finds none, it asks npm which package versions are unpublished, and the mode is `publish` when there are some. Otherwise the mode is `none` and the run stops.
2. In `version` mode, the `version` job runs `vp run version-packages` (`changeset version`). That command deletes the changesets, bumps `package.json` versions, and writes each `CHANGELOG.md`. The job then opens a pull request named "Version Packages", or updates it if it is already open.
3. The owner reviews and merges that pull request.
4. The merge is another push to `main`, now with no changesets and an unpublished version, so the mode is `publish`. The `pack` job builds with `vp run -r build`, which runs publint and Are the Types Wrong. Then the job packs the tarballs. At the same time, the `ci` job runs all of `.github/workflows/ci.yml` on that commit. The `publish` job waits for both, then publishes those exact tarballs to npm, pushes a git tag such as `@redmine-ts/sdk@0.1.0`, and creates a GitHub release.

The workflow opens the Version Packages pull request with its own token, so GitHub holds the CI runs of that pull request until someone approves them. The pull request changes only versions and changelogs, so nobody needs to approve them. The `ci` job of the Release run is the check that counts. If it fails, nothing is published.

When the `ci` job fails on a flaky test, rerun the whole Release run with `gh run rerun <run-id>`. The `select-mode` job asks npm again, and the run publishes once CI passes.

The `publish` job is the only job with `id-token: write`. It sets `PNPM_CONFIG_PROVENANCE=true`, so every published version carries an npm provenance statement that links it to the workflow run.

### See what would be published

Run the workflow by hand on any branch:

```sh
gh workflow run release.yml --ref <branch>
```

On a branch other than `main`, only `select-mode` and `pack` run. `pack` applies pending changesets in its own checkout, as the Version Packages pull request would, then builds, packs, and prints the files in each tarball. It never publishes and never opens a pull request.

## One-time owner setup

Do these once, before you merge the first Version Packages pull request.

1. In the repository settings, under **Actions** > **General** > **Workflow permissions**, turn on **Allow GitHub Actions to create and approve pull requests**. Without that setting, the `version` job fails with `GitHub Actions is not permitted to create or approve pull requests`.
2. On npmjs.com, create the organization `redmine-ts`. The packages publish as `@redmine-ts/<name>` with public access.
3. Give the workflow a way to publish. The `publish` job tries npm trusted publishing first and falls back to the `NPM_TOKEN` secret when the exchange fails.

### Publish with trusted publishing

Trusted publishing needs no stored token. npm accepts a short-lived token that GitHub issues to the `publish` job.

In the package settings on npmjs.com, add a trusted publisher of type GitHub Actions with these values:

| Field             | Value         |
| ----------------- | ------------- |
| Organization      | `moddi3`      |
| Repository        | `redmine-ts`  |
| Workflow filename | `release.yml` |
| Environment       | leave empty   |

Repeat this for every new package in the repo. A trusted publisher made with `npm trust github` needs `--allow-publish`, because `--allow-stage-publish` alone allows only `npm stage publish`.

When npm refuses the exchange, pnpm publishes without a token and npm answers with a bare `404 Not Found`. The `publish` job then runs one more step that asks npm directly. That step prints npm's reason, or says that npm accepted the workflow and refused the publish itself.

The trusted publisher form lives in a package's settings, so the package must exist on npm first. Publish the first version of each package in one of the two ways below, then add the trusted publisher. From a terminal, run `npm trust github @redmine-ts/<name> --file release.yml --repo moddi3/redmine-ts --allow-publish` outside this repo, because npm refuses to run inside it under the pnpm `devEngines` setting.

#### npm/cli#9969: trusted publishing and immutable OIDC subjects

GitHub repositories created after 2026-07-15 issue OIDC tokens with [immutable subject claims](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/). This repository is one of them, and `gh api repos/moddi3/redmine-ts/actions/oidc/customization/sub` shows `use_immutable_subject: true`. Through 2026-10-23, npm refused the exchange for `@redmine-ts/sdk` with `404 {"message":"OIDC token exchange error - package not found"}`, although its trusted publisher matched. [npm/cli#9969](https://github.com/npm/cli/issues/9969) reports that refusal and is still open. SDK 0.2.0 through 0.3.0 were therefore published from the owner's machine.

On 2026-10-24, the `publish` job published `@redmine-ts/mcp@0.2.0` through trusted publishing, with provenance. The MCP package's trusted publisher was created on 2026-10-23. The SDK's trusted publisher, created on 2026-10-18, was then recreated with the same settings. After that, the job published `@redmine-ts/sdk@0.3.1` the same way. Both packages now publish from CI.

If a package fails with the same `package not found`, recreate its trusted publisher and rerun the whole Release run. To recreate it, run `npm trust list @redmine-ts/<name>`, `npm trust revoke @redmine-ts/<name> --id=<id>`, and then `npm trust github @redmine-ts/<name> --file release.yml --repo moddi3/redmine-ts --allow-publish`, all outside this repo. [Publish from your machine](#publish-from-your-machine) stays the fallback.

### First publish with a temporary token

This way keeps provenance on the first version.

1. On npmjs.com, create a granular access token with read and write access to the `@redmine-ts` scope and a short expiry.
2. Add it as the repository secret `NPM_TOKEN`:

   ```sh
   gh secret set NPM_TOKEN -R moddi3/redmine-ts
   ```

3. Merge the Version Packages pull request. The `publish` job publishes with the token.
4. Add the trusted publisher as described above.
5. Delete the `NPM_TOKEN` secret and revoke the token on npmjs.com.

If your npm account requires two-factor authentication for publishing, the token needs the option that bypasses it. npm is phasing those tokens out. The phase-out is one more reason to delete the token once trusted publishing works.

### Publish from your machine

This way needs no token in GitHub. It is one of the two ways to publish the first version of a package. It is also the fallback when trusted publishing fails, as in [npm/cli#9969](#npmcli9969-trusted-publishing-and-immutable-oidc-subjects). These versions carry no provenance.

1. Merge the Version Packages pull request. The `publish` job of the Release run fails, because nothing can authenticate.
2. Publish from an up-to-date `main`:

   ```sh
   git switch main && git pull
   vp install
   pnpm whoami || pnpm login
   vp run release
   git push --follow-tags
   ```

   - Use `pnpm login`, not `npm login`. pnpm 12 keeps its own login and uses it instead of `~/.npmrc`. On macOS, that login is in `~/Library/Preferences/pnpm/config.yaml`. An expired pnpm login ends in the same bare `404 Not Found` as a refused exchange, even while `npm whoami` works.
   - `vp run release` builds every package and runs `changeset publish`, which publishes unpublished versions and creates their git tags. npm asks for two-factor authentication in the browser.
   - npm reviews each new version before it is available. The package page shows the version as **Validating** for about a minute, and `npm view` does not list it until then.

3. Create a GitHub release for each new tag, with that version's section of the package's `CHANGELOG.md` as the notes. Run `gh release create <tag> --verify-tag --title <tag> --notes-file <section.md>`.
4. For a package's first version, add the trusted publisher as described above.
5. Rerun the whole failed Release run with `gh run rerun <run-id>`, not only its failed job. `select-mode` must ask npm again. It then finds nothing to publish and ends in `none` mode. `--failed` reruns `publish` with the old plan, which tries the same versions again and fails.

## What CI and the weekly workflow check

`.github/workflows/ci.yml` runs on pushes to `main`, on pull requests, and inside every Release run that publishes:

- `checks` runs on Node 22 and 24. It runs `vp check`, `vp run docs:check`, the unit and generator tests, `vp run -r build`, and `vp run gen:check` in `packages/sdk`.
- `contract` starts the Docker Redmine servers from `docker/compose.yaml`, runs `vp run test:contract` against them, then runs `scripts/runtime-smoke.mjs` on the built package under Node 24 and under Bun.

`.github/workflows/weekly.yml` runs every Monday at 04:23 UTC, and by hand with `gh workflow run weekly.yml`:

- `latest-redmine` runs all of `ci.yml` after `docker compose pull`. The `redmine:6.1` and `redmine:7.0` tags move to each new patch release, so a patch that changes API behavior fails this run within a week, even when nobody pushed.
- `spec-watch` runs `scripts/spec-watch.ts`, which compares the tags of [d-yoshi/redmine-openapi](https://github.com/d-yoshi/redmine-openapi/tags) with the files in `spec/redmine-openapi/`. When a newer tag exists, it opens one issue labeled `spec-watch`, or rewrites the open one. When the vendored specs catch up, it closes the issue.
- `redmine-org-canary` builds the SDK and runs `scripts/redmine-org-canary.mjs`, which sends five read-only `GET` requests to www.redmine.org. They fetch a page of three issues with relations, one issue with journals, two pages of two news items, and the issue statuses. That site is the Redmine project's production server, so the canary never writes to it. The canary also identifies itself with a `User-Agent` that links to this repo.

`.github/dependabot.yml` opens a pull request each week when a pinned action has a new release.
