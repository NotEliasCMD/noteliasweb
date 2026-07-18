#!/usr/bin/env bash
# Post-deploy check: wait for GitHub Pages to publish the commit you just pushed,
# then run the full smoke suite against the LIVE site.
#
# Run it right after a push to main:
#     git push && dev/tests/postdeploy.sh
#
# Why this exists: the pre-push hook validates your working tree locally, but some
# things only manifest in production (Pages CDN caching, custom-domain HTTPS, the
# real 404-based deep-link routing). This closes that gap.
#
# Detection strategy:
#   - If `gh` is installed & authed, poll the Pages build API until the LATEST
#     build is "built" AND its commit == the SHA you just pushed (exact match).
#   - Otherwise, fall back to polling the live URL for 200 + a fixed grace period
#     (can't confirm the exact commit, so it just waits for Pages to settle).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE_URL="${LIVE_URL:-https://saile.codes}"
REPO_SLUG="${REPO_SLUG:-NotEliasCMD/noteliasweb}"
EXPECTED_SHA="$(git rev-parse HEAD)"
TIMEOUT="${DEPLOY_TIMEOUT:-360}"   # seconds to wait for the deploy
PY="$(command -v python3)"

echo "[postdeploy] Target: $LIVE_URL"
echo "[postdeploy] Waiting for GitHub Pages to publish commit ${EXPECTED_SHA:0:8} (timeout ${TIMEOUT}s)…"

deadline=$(( $(date +%s) + TIMEOUT ))

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  # --- exact-commit detection via the Pages build API ---
  while :; do
    read -r status commit < <(gh api "repos/$REPO_SLUG/pages/builds/latest" \
        --jq '"\(.status) \(.commit)"' 2>/dev/null || echo "unknown none")
    echo "[postdeploy]   build status=$status commit=${commit:0:8}"
    if [ "$status" = "built" ] && [ "$commit" = "$EXPECTED_SHA" ]; then
      echo "[postdeploy] ✅ pushed commit is live."
      break
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "[postdeploy] ⚠️  timed out waiting for the exact commit; testing whatever is live now."
      break
    fi
    sleep 10
  done
  # small settle for the CDN edge after the build reports built
  sleep 5
else
  # --- fallback: no gh; poll for 200 then a fixed grace period ---
  echo "[postdeploy] (gh not available/authed — using URL polling + grace period)"
  until curl -sfI "$LIVE_URL/index.html" >/dev/null 2>&1; do
    [ "$(date +%s)" -ge "$deadline" ] && { echo "[postdeploy] ⚠️ site not reachable before timeout."; break; }
    sleep 5
  done
  echo "[postdeploy]   site reachable — waiting 45s for Pages to swap in the new build…"
  sleep 45
fi

echo "[postdeploy] Running smoke suite against $LIVE_URL …"
if "$PY" "$HERE/smoke_test.py" "$LIVE_URL"; then
  echo "[postdeploy] ✅ LIVE smoke suite passed."
  exit 0
else
  echo "[postdeploy] ❌ LIVE smoke suite FAILED — the deployed site has a problem."
  exit 1
fi
