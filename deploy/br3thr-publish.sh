#!/bin/bash
#
# Rebuilds the shop after "Publish to store" in the admin Theme Editor.
# Installed as /usr/local/bin/br3thr-publish and run as root by
# br3thr-publish.service, which br3thr-publish.path starts whenever the
# app writes /var/www/br3thr-publish/request.
#
# The build runs in a separate copy (/var/www/br3thr-build), so the live shop
# keeps serving the whole time and a failed build never touches it. Only a
# successful build is swapped in, and if the restarted shop does not answer,
# the previous build is put back.
set -uo pipefail

LIVE=/var/www/br3thr
BUILD=/var/www/br3thr-build
STATE=/var/www/br3thr-publish
LOG="$STATE/publish.log"

exec 9>/run/br3thr-publish.lock
flock -n 9 || exit 0

BY=$(sed -n 's/.*"by":"\([^"]*\)".*/\1/p' "$STATE/request" 2>/dev/null | tr -cd 'A-Za-z0-9@._+-')
rm -f "$STATE/request"
START=$(date -u +%FT%TZ)

status() { # state message [finishedAt]
  local msg=${2//\"/\'}
  printf '{"state":"%s","startedAt":"%s","finishedAt":"%s","message":"%s","by":"%s"}\n' \
    "$1" "$START" "${3:-}" "$msg" "$BY" > "$STATE/status.json.tmp"
  chown br3thr:br3thr "$STATE/status.json.tmp"
  mv "$STATE/status.json.tmp" "$STATE/status.json"
}
fail() {
  echo "== FAILED: $1"
  status failed "$1" "$(date -u +%FT%TZ)"
  exit 1
}

: > "$LOG"
chown br3thr:br3thr "$LOG"
exec >>"$LOG" 2>&1
status running ""
echo "== Publish started $START${BY:+ by $BY}"

echo "== Copying the shop into the build folder"
mkdir -p "$BUILD"
chown br3thr:br3thr "$BUILD"
sudo -u br3thr rsync -a --delete \
  --exclude=/.next --exclude=/.next.prev --exclude=/.next.new \
  --exclude=/public/uploads --exclude=/.git --exclude=/.npm-cache \
  "$LIVE/" "$BUILD/" || fail "could not copy the shop files"

echo "== Building (this takes a few minutes)"
cd "$BUILD" || fail "build folder missing"
# npm caches in $HOME, which for this user is the live shop folder; keep it in the build folder instead.
sudo -u br3thr npm_config_cache="$BUILD/.npm-cache" npm run build || fail "the build failed. Fix the error shown in the log and publish again"

echo "== Switching the shop to the new build"
rm -rf "$LIVE/.next.new"
sudo -u br3thr rsync -a --exclude=/cache "$BUILD/.next/" "$LIVE/.next.new/" || fail "could not copy the new build"
rm -rf "$LIVE/.next.prev"
mv "$LIVE/.next" "$LIVE/.next.prev"
mv "$LIVE/.next.new" "$LIVE/.next"
systemctl restart br3thr

healthy() {
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
    if [ -n "$code" ] && [ "$code" != "000" ] && [ "$code" -lt 500 ]; then return 0; fi
    sleep 2
  done
  return 1
}

if ! healthy; then
  echo "== The shop did not come back on the new build, restoring the previous one"
  rm -rf "$LIVE/.next"
  mv "$LIVE/.next.prev" "$LIVE/.next"
  systemctl restart br3thr
  fail "the new build did not start, so the previous version was restored"
fi

# Healthy: the rollback copy has done its job and would only take up space
# (and end up in backups).
rm -rf "$LIVE/.next.prev"

echo "== Done. The shop is running the new build."
status success "" "$(date -u +%FT%TZ)"
