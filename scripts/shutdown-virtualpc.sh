#!/usr/bin/env bash
# Shut down the VirtualPC stack to free CPU/GPU, WITHOUT touching Claude Code.
#
# Stops: the VirtualPC node server (port 3100) and its child agent processes,
#        the local Ollama server (agent inference backend).
# Leaves running: Claude Code (this CLI and its process tree), the lightweight
#        demo static server (serve-demo.sh), and everything not part of the stack.
#
# Usage: bash scripts/shutdown-virtualpc.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== VirtualPC shutdown =="

# Guard: never kill the Claude Code process tree. Walk our own ancestry and
# collect PIDs to spare (this shell, its parents up to claude/node-claude).
SPARE=""
pid=$$
while [ "$pid" -gt 1 ]; do
  SPARE="$SPARE $pid"
  pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  [ -z "$pid" ] && break
done
is_spared(){ case " $SPARE " in *" $1 "*) return 0;; *) return 1;; esac; }

# 1) VirtualPC node server on :3100 (dist/index.js). Kill the listener + children.
VPID=$(ss -tlnpH 'sport = :3100' 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
if [ -z "${VPID:-}" ]; then
  VPID=$(pgrep -f 'node .*dist/index.js' | head -1)
fi
if [ -n "${VPID:-}" ] && ! is_spared "$VPID"; then
  # kill child agent processes first (children of the node server), then the server
  for c in $(pgrep -P "$VPID" 2>/dev/null); do is_spared "$c" || kill "$c" 2>/dev/null; done
  kill "$VPID" 2>/dev/null && echo "  ✓ stopped VirtualPC server (pid $VPID) + children"
  sleep 1
  kill -0 "$VPID" 2>/dev/null && kill -9 "$VPID" 2>/dev/null
else
  echo "  · VirtualPC server not running (or is part of Claude Code — spared)"
fi
rm -f "$ROOT/.service.pid" 2>/dev/null

# 2) Ollama (agent inference backend) — biggest CPU/GPU consumer when idle-loaded.
if systemctl --user is-active --quiet ollama 2>/dev/null; then
  systemctl --user stop ollama && echo "  ✓ stopped Ollama (systemd user service)"
else
  OPID=$(pgrep -x ollama | head -1)
  if [ -n "${OPID:-}" ] && ! is_spared "$OPID"; then
    kill "$OPID" 2>/dev/null && echo "  ✓ stopped Ollama (pid $OPID)"
  else
    echo "  · Ollama not running"
  fi
fi

# 3) Stray agent worker processes spawned by the stack (claude -p / codex exec
#    launched by VirtualPC, NOT the interactive Claude Code session). Match the
#    stack's worker signature and spare our own tree.
for wp in $(pgrep -f 'lmstudio|agent-voice-bridge|warroom' 2>/dev/null); do
  is_spared "$wp" || { kill "$wp" 2>/dev/null && echo "  ✓ stopped stack worker (pid $wp)"; }
done

echo "== done. Claude Code untouched. Demo (if served) stays up. =="
