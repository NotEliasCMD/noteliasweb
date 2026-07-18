#!/usr/bin/env bash
# Boots the GitHub-Pages-mimic server on the working tree, runs the smoke suite
# against it, and tears the server down. Exit code = the suite's result, so this
# script can gate a push. Pass a URL to test something else (e.g. the live site):
#   ./run.sh https://saile.codes
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PORT="${SMOKE_PORT:-8137}"
PY="$(command -v python3)"

# If a base URL is passed, test that directly (no local server).
if [ "${1:-}" != "" ]; then
  exec "$PY" "$HERE/smoke_test.py" "$1"
fi

if ! "$PY" -c "import playwright" >/dev/null 2>&1; then
  echo "[smoke] Playwright not installed for $PY."
  echo "        Install with:  $PY -m pip install playwright"
  echo "        (uses your system Google Chrome — no browser download needed)"
  exit 2
fi

"$PY" "$HERE/gh_pages_server.py" "$ROOT" "$PORT" >/dev/null 2>&1 &
SRV=$!
cleanup() { kill "$SRV" 2>/dev/null || true; }
trap cleanup EXIT

# wait for the server to answer
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$PORT/index.html" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

"$PY" "$HERE/smoke_test.py" "http://127.0.0.1:$PORT"
