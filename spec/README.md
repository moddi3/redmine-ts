# Vendored Redmine OpenAPI spec

`redmine-openapi/` holds pinned copies of [redmine-openapi](https://github.com/d-yoshi/redmine-openapi) by [d-yoshi](https://github.com/d-yoshi), an unofficial OpenAPI 3.0.3 description of the Redmine REST API. Its MIT license is in [redmine-openapi/LICENSE](redmine-openapi/LICENSE) and applies to the YAML files in that directory.

| File            | Upstream tag | Redmine version it describes |
| --------------- | ------------ | ---------------------------- |
| `6.1.3-r1.yaml` | `6.1.3-r1`   | 6.1                          |
| `7.0.2-r1.yaml` | `7.0.2-r1`   | 7.0                          |

The files are byte-for-byte copies of the upstream tags. The generator in `packages/sdk/generator/` reads every file here, takes the Redmine version from the file name, and merges them into one superset. Edit nothing in `redmine-openapi/` by hand: a fix belongs upstream, and a decision about this SDK's surface belongs in `packages/sdk/generator/overlay.ts`. The one exception is `corrections` in that file. It marks a few fields as required in every vendored spec, because Redmine always sends them and the spec leaves them optional. Each correction goes once upstream fixes its fields.

## Updating

Upstream revisions can contain breaking fixes, so always pin an exact tag, never a branch.

1. Run `spec/fetch.sh <tag>`, for example `spec/fetch.sh 7.1.0-r1`. To replace a revision of a version already vendored, delete the old file in the same change.
2. Refresh the license if upstream changed it: `curl -sfL -o spec/redmine-openapi/LICENSE https://raw.githubusercontent.com/d-yoshi/redmine-openapi/<tag>/LICENSE`.
3. In `packages/sdk`, run `vp run gen` and read the drift report it prints. If generation fails because a correction no longer changes the merged spec, upstream fixed those fields: remove them from the correction in `overlay.ts`.
4. Update the table above.
