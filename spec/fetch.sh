#!/usr/bin/env bash
# Vendors pinned tags of the community Redmine OpenAPI spec (MIT, d-yoshi/redmine-openapi).
# Tags carry revisions that may contain breaking fixes, so pin exact tags.
set -euo pipefail
cd "$(dirname "$0")/redmine-openapi"
for tag in "$@"; do
  curl -sfL -o "$tag.yaml" "https://raw.githubusercontent.com/d-yoshi/redmine-openapi/$tag/openapi.yaml"
  echo "vendored $tag"
done
