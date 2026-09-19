#!/usr/bin/env bash
# One-shot install for virtualpc + LiteLLM gateway + auto-updater on a fresh
# machine. Idempotent — safe to re-run.
#
# Prereqs: node 18+, docker, git. Optional: LM Studio (lms CLI) for local models.
#
# Usage:
#   git clone https://github.com/virtuanalytica/virtualpc.git ~/virtualpc
#   cd ~/virtualpc
#   ./scripts/install.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED="$HOME/virtualpc"

cd "$REPO_DIR"

echo "==> virtualpc install"
echo "    repo : $REPO_DIR"
echo "    user : $(whoami)"
echo "    home : $HOME"

if [ "$REPO_DIR" != "$EXPECTED" ]; then
  echo
  echo "    Note: this checkout is at $REPO_DIR, not $EXPECTED."
  echo "    The systemd units use %h/virtualpc, so either:"
  echo "      - move/symlink this checkout to $EXPECTED, or"
  echo "      - hand-edit deploy/systemd/*.service WorkingDirectory + ExecStart paths"
  echo
fi

# 1. Check tools
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1 — please install"; exit 1; }; }
need node
need npm
need git
need docker

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "node $NODE_MAJOR detected; need >= 18"
  exit 1
fi

# 2. Deps + build
echo "==> npm ci"
npm ci --silent

echo "==> npm run build"
npm run build --silent

# 3. Bring up LiteLLM gateway (idempotent)
echo "==> LiteLLM gateway via docker compose"
docker compose -f deploy/docker-compose.litellm.yml up -d 2>&1 | tail -3 || {
  echo "    docker compose failed — see output above. Continuing without gateway."
}

# 4. Install git post-commit hook so the audit trail keeps growing on every commit.
echo "==> git post-commit hook"
HOOK_SRC="$REPO_DIR/scripts/git-hooks/post-commit"
HOOK_DST="$REPO_DIR/.git/hooks/post-commit"
if [ -d "$REPO_DIR/.git/hooks" ]; then
  chmod +x "$HOOK_SRC"
  if [ -e "$HOOK_DST" ] && [ "$(readlink -f "$HOOK_DST" || echo)" != "$(readlink -f "$HOOK_SRC")" ]; then
    echo "    note: existing hook at $HOOK_DST — preserving as .pre-virtualpc"
    mv "$HOOK_DST" "$HOOK_DST.pre-virtualpc"
  fi
  ln -sf "$HOOK_SRC" "$HOOK_DST"
  echo "    linked $HOOK_DST → scripts/git-hooks/post-commit"
fi

# 5. Install systemd user units (only if systemd --user works)
if systemctl --user --version >/dev/null 2>&1; then
  echo "==> systemd user units"
  USER_UNITS="$HOME/.config/systemd/user"
  mkdir -p "$USER_UNITS"
  cp deploy/systemd/virtualpc.service              "$USER_UNITS/"
  cp deploy/systemd/virtualpc-litellm.service      "$USER_UNITS/"
  cp deploy/systemd/virtualpc-auto-update.service  "$USER_UNITS/"
  cp deploy/systemd/virtualpc-auto-update.timer    "$USER_UNITS/"
  systemctl --user daemon-reload
  systemctl --user enable --now virtualpc-litellm.service     2>&1 | tail -1
  systemctl --user enable --now virtualpc.service             2>&1 | tail -1
  systemctl --user enable --now virtualpc-auto-update.timer   2>&1 | tail -1

  # Linger so the units survive logout (one-time setup; ignored if already on).
  if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$(whoami)" 2>/dev/null || true
  fi

  echo
  echo "    health: curl -fsS http://localhost:3100/api/health"
  echo "    update state: curl -fsS http://localhost:3100/api/vitals/auto-update"
  echo "    LiteLLM models: curl -fsS -H 'Authorization: Bearer sk-virtualpc-dev' http://localhost:4000/v1/models"
else
  echo "==> systemd --user not available; start manually:"
  echo "    docker compose -f deploy/docker-compose.litellm.yml up -d"
  echo "    node dist/index.js"
fi

echo
echo "==> install complete"
