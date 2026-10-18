# Releasing

[Changesets](https://changesets.dev) versions and publishes the packages in this repo. Nothing reaches npm until the owner merges the Version Packages pull request.

## Add a changeset to your change

If your change affects what users of a package get, add a changeset in the same pull request:

```sh
vp run changeset
```

Pick the packages, the bump type, and write one or two sentences for the changelog. The command writes a Markdown file under `.changeset/`. Commit it with the change.

Pick the bump from the user's side. While a package is on `0.x`, a breaking change is a `minor` bump and everything else is a `patch` bump. Adding a supported Redmine version is a `minor` bump. Dropping one is breaking.

A change to tests, CI, or docs needs no changeset.

Run `vp run changeset status` to see which packages the pending changesets bump.

## How a release happens

`.github/workflows/release.yml` runs on every push to `main`:

1. The `select-mode` job reads `.changeset/`. If it finds changesets, the mode is `version`. If it finds none, it asks npm which package versions are unpublished, and the mode is `publish` when there are some. Otherwise the mode is `none` and the run stops.
2. In `version` mode, the `version` job runs `vp run version-packages` (`changeset version`). That deletes the changesets, bumps `package.json` versions, and writes each `CHANGELOG.md`. The job then opens a pull request named "Version Packages", or updates it if it is already open.
3. The owner reviews and merges that pull request.
4. The merge is another push to `main`, now with no changesets and an unpublished version, so the mode is `publish`. The `pack` job builds with `vp run -r build`, which runs publint and Are the Types Wrong, and packs the tarballs. The `publish` job publishes those exact tarballs to npm, pushes a git tag such as `@redmine-ts/sdk@0.1.0`, and creates a GitHub release.

The Version Packages pull request is opened with the workflow's own token, so GitHub does not run CI on it. It changes only versions and changelogs, and CI runs on `main` after the merge.

The `publish` job is the only job with `id-token: write`. It sets `PNPM_CONFIG_PROVENANCE=true`, so every published version carries an npm provenance statement that links it to the workflow run.

### See what would be published

Run the workflow by hand on any branch:

```sh
gh workflow run release.yml --ref <branch>
```

On a branch other than `main`, only `select-mode` and `pack` run. `pack` applies pending changesets in its own checkout, as the Version Packages pull request would, then builds, packs, and prints the files in each tarball. It never publishes and never opens a pull request.

## One-time owner setup

Do these once, before you merge the first Version Packages pull request.

1. In the repository settings, under **Actions** > **General** > **Workflow permissions**, turn on **Allow GitHub Actions to create and approve pull requests**. Without it, the `version` job fails with `GitHub Actions is not permitted to create or approve pull requests`.
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

Repeat this for every new package in the repo.

The trusted publisher form lives in a package's settings, so the package must exist on npm first. Publish the first version of each package in one of the two ways below, then add the trusted publisher.

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

If your npm account requires two-factor authentication for publishing, the token needs the option that bypasses it. npm is phasing those tokens out, which is one more reason to delete the token once trusted publishing works.

### First publish from your machine

This way needs no token in GitHub, and the first version has no provenance.

1. Merge the Version Packages pull request. Its `publish` job fails because nothing can authenticate yet.
2. Publish from an up-to-date `main`:

   ```sh
   git switch main && git pull
   vp install
   npm login
   vp run release
   git push --follow-tags
   ```

   `vp run release` builds every package and runs `changeset publish`, which publishes unpublished versions and creates their git tags.

3. Add the trusted publisher as described above.
4. Rerun the failed Release run. It finds nothing to publish and ends in `none` mode.

## What CI and the weekly workflow check

`.github/workflows/ci.yml` runs on every push and pull request:

- `checks` runs on Node 22 and 24. It runs `vp check`, the unit and generator tests, `vp run -r build`, and `vp run gen:check` in `packages/sdk`.
- `contract` starts the Docker Redmine servers from `docker/compose.yaml`, runs `vp run test:contract` against them, then runs `scripts/runtime-smoke.mjs` on the built package under Node 24 and under Bun.

`.github/workflows/weekly.yml` runs every Monday at 04:23 UTC, and by hand with `gh workflow run weekly.yml`:

- `latest-redmine` runs all of `ci.yml` after `docker compose pull`. The `redmine:6.1` and `redmine:7.0` tags move to each new patch release, so a patch that changes API behavior fails this run within a week, even when nobody pushed.
- `spec-watch` compares the tags of [d-yoshi/redmine-openapi](https://github.com/d-yoshi/redmine-openapi/tags) with the files in `spec/redmine-openapi/` (`scripts/spec-watch.ts`). When a newer tag exists, it opens one issue labeled `spec-watch`, or rewrites the open one. When the vendored specs catch up, it closes the issue.
- `redmine-org-canary` builds the SDK and sends five read-only `GET` requests to www.redmine.org (`scripts/redmine-org-canary.mjs`): a page of three issues with relations, one issue with journals, two pages of two news items, and the issue statuses. That site is the Redmine project's production server, so the canary never writes and identifies itself with a `User-Agent` that links to this repo.

`.github/dependabot.yml` opens a pull request each week when a pinned action has a new release.
