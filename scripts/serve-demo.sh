#!/usr/bin/env bash
# Serve ONLY the Molgang play-demo statically, with no VirtualPC server, no
# agents, no Ollama. Pure static files (public/) via python http.server — a few
# MB of RAM, no CPU load. Lets the demo stay playable after shutdown-virtualpc.sh.
#
# Usage: bash scripts/serve-demo.sh [PORT]   (default 8123)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8123}"
PIDFILE="/tmp/molgang_demo_server.pid"

# already up on this port?
if ss -tlnH "sport = :$PORT" 2>/dev/null | grep -q ":$PORT"; then
  echo "demo server already listening on :$PORT"
  echo "URL: http://localhost:$PORT/play-demo.html"
  exit 0
fi

# self-heal: vendored three.js is gitignored (derivable). Regenerate if missing
# so a fresh checkout's demo works without the CDN.
if [ ! -f "$ROOT/public/vendor/three/three.module.js" ]; then
  echo "vendoring three.js locally (one-time)…"
  if [ ! -f "$ROOT/node_modules/three/build/three.module.js" ]; then
    (cd "$ROOT" && npm install three@0.160.0 --no-audit --no-fund >/dev/null 2>&1)
  fi
  mkdir -p "$ROOT/public/vendor/three"
  cp "$ROOT/node_modules/three/build/three.module.js" "$ROOT/public/vendor/three/three.module.js"
  cp -r "$ROOT/node_modules/three/examples/jsm" "$ROOT/public/vendor/three/addons"
  echo "  ✓ vendored into public/vendor/three"
fi

cd "$ROOT/public" || { echo "no public/ dir"; exit 1; }
nohup python3 -m http.server "$PORT" --bind 127.0.0.1 > /tmp/molgang_demo_server.log 2>&1 &
echo $! > "$PIDFILE"
sleep 1
if ss -tlnH "sport = :$PORT" 2>/dev/null | grep -q ":$PORT"; then
  echo "✓ demo server up (pid $(cat "$PIDFILE")) — CPU-free static files only"
  echo "URL: http://localhost:$PORT/play-demo.html"
else
  echo "✗ failed to start; see /tmp/molgang_demo_server.log"
  exit 1
fi
