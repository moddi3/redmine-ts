#!/usr/bin/env bash
# Records the OAuth walkthrough in docs/mcp/http-and-oauth.md: MCP Inspector signs in to the Docker Redmine 7.0
# through the MCP server, and the animation and screenshots are written to packages/mcp/docs/oauth/.
#
# Needs the Docker Redmines (`node scripts/redmine-env.ts up`), a build (`vp run -r build`), agent-browser,
# ffmpeg, and cwebp and img2webp from libwebp. Ports 3737 and 6274 must be free. The Inspector keeps its
# servers and state in a temporary directory and its secrets in memory, so nothing else on the machine
# changes, and the Redmine application the run creates is deleted at the end.
set -euo pipefail
set -m # background jobs get their own process group, so cleanup stops their children too
# Each job is disowned once started, so bash does not report it as Terminated when cleanup kills it.

root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/packages/mcp/docs/oauth"
tmp=$(mktemp -d)
export AGENT_BROWSER_SESSION=redmine-oauth-walkthrough
inspector_version=2.10.1 # the steps below follow this version's UI
mcp_url=http://localhost:3737/mcp
redmine_url=http://localhost:3070
client_id=redmine-mcp-walkthrough
client_secret=$(openssl rand -hex 24)
jobs_started=()

rails() {
  docker compose -f "$root/docker/compose.yaml" exec -T -u redmine redmine70 \
    bin/rails runner -e production "$1" >/dev/null
}

cleanup() {
  agent-browser close >/dev/null 2>&1 || true
  for pid in "${jobs_started[@]}"; do kill -- "-$pid" 2>/dev/null || true; done
  rails "Doorkeeper::Application.find_by(uid: '$client_id')&.destroy!" || true
  rm -rf "$tmp"
}
trap cleanup EXIT

pause() { perl -e "select(undef, undef, undef, $1)"; }
until_ok() {
  for _ in $(seq 1 120); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    pause 0.5
  done
  echo "timed out: $*" >&2
  exit 1
}

# The application an admin creates in "Set up Redmine": every permission, no Administration.
rails "
app = Doorkeeper::Application.find_by(uid: '$client_id') || Doorkeeper::Application.new(uid: '$client_id')
app.name = 'MCP'
app.redirect_uri = '$mcp_url/oauth/redmine/callback'
app.scopes = Redmine::AccessControl.permissions.map(&:name).join(' ')
app.confidential = true
Doorkeeper::Application.secret_strategy.store_secret(app, :secret, '$client_secret')
app.save!
"

REDMINE_URL=$redmine_url REDMINE_MCP_PUBLIC_URL=$mcp_url REDMINE_MCP_AUTH_SECRET=$(openssl rand -base64 32) \
  REDMINE_OAUTH_CLIENT_ID=$client_id REDMINE_OAUTH_CLIENT_SECRET=$client_secret \
  node "$root/packages/mcp/dist/cli.mjs" --http --no-delete \
  --allow-origin http://localhost:6274 --allow-origin http://127.0.0.1:6274 >"$tmp/server.log" 2>&1 &
jobs_started+=($!)
disown
until_ok curl -sf "$mcp_url/.well-known/oauth-protected-resource"

echo '{ "mcpServers": {} }' >"$tmp/mcp.json"
(cd "$tmp" && MCP_CATALOG_PATH="$tmp/mcp.json" MCP_STORAGE_DIR="$tmp/storage" \
  MCP_INSPECTOR_SECRET_STORE=memory MCP_AUTO_OPEN_ENABLED=false \
  vp dlx "@modelcontextprotocol/inspector@$inspector_version" >"$tmp/inspector.log" 2>&1) &
jobs_started+=($!)
disown
until_ok grep -qE 'MCP_INSPECTOR_API_TOKEN=' "$tmp/inspector.log"
inspector=$(grep -oE 'http://[^ ]*:6274[^ ]*MCP_INSPECTOR_API_TOKEN=[0-9a-f]+' "$tmp/inspector.log" | tail -1)

# Clicks or types into the first element whose snapshot line contains the pattern.
act() {
  local verb=$1 pattern=$2 ref
  shift 2
  ref=$(agent-browser snapshot -i | grep -F -- "$pattern" | head -1 | grep -oE 'ref=e[0-9]+' | cut -d= -f2) || true
  if [ -z "$ref" ]; then
    echo "no element matches: $pattern" >&2
    exit 1
  fi
  agent-browser "$verb" "@$ref" "$@" >/dev/null
}
at() { agent-browser get url | grep -q -- "$1"; }
shot() { agent-browser screenshot "$tmp/$1.png" >/dev/null; }

agent-browser open "$inspector" >/dev/null
agent-browser set viewport 1280 800 1 >/dev/null
node "$root/scripts/oauth-walkthrough/bypass-csp.mjs" "$(agent-browser get cdp-url)" &
jobs_started+=($!)
disown
pause 1.5
agent-browser record start "$tmp/sign-in.mp4" --cursor >/dev/null
pause 2

act click 'button "Add Servers"'
pause 0.9
act click 'menuitem "+ Add manually"'
pause 1.2
act type 'textbox "Server ID"' redmine
pause 0.7
act click 'textbox "Transport"'
pause 0.9
act click 'option "streamable-http"'
pause 0.9
act type 'textbox "URL"' "$mcp_url"
pause 1.5
shot 1-add-server
act click 'button "Add" ['
pause 2
act click 'switch "Connect or disconnect \"redmine\""'

until_ok at "$mcp_url/oauth/authorize"
pause 2.5
shot 2-consent
act click 'button "Allow"'

until_ok at "$redmine_url/login"
pause 1.5
act type 'textbox "Login"' jsmith
pause 0.5
act type 'textbox "Password' sdk-user-pass-1
pause 1.2
shot 3-redmine-login
act click 'button "Login"'

until_ok at "$redmine_url/oauth/authorize"
pause 2.5
shot 4-redmine-authorize
act scrollintoview 'button "Authorize"'
pause 1.5
act click 'button "Authorize"'

until_ok at 127.0.0.1:6274
pause 3
shot 5-connected
act click 'LabelText "Tools"'
pause 2
act type 'textbox "Search tools..."' current
pause 1.2
act click 'button "Show current user users_current"'
pause 1.5
act click 'button "Execute Tool"'
pause 3
shot 6-tool-call
pause 2.5
agent-browser record stop >/dev/null

mkdir -p "$out"
for png in "$tmp"/[0-9]-*.png; do
  cwebp -quiet -lossless -z 9 "$png" -o "$out/$(basename "$png" .png).webp"
done
mkdir "$tmp/frames"
ffmpeg -v error -i "$tmp/sign-in.mp4" -vf "fps=10,scale=960:-1:flags=lanczos" "$tmp/frames/%04d.png"
img2webp -loop 0 -lossy -q 70 -m 4 -d 100 "$tmp"/frames/*.png -o "$out/sign-in.webp" >/dev/null
ls -l "$out"
