#!/usr/bin/env bash
# Auto-update virtualpc from github.com/virtuanalytica/virtualpc.
#
# Run by systemd timer (deploy/systemd/virtualpc-auto-update.timer). Safe to
# run on demand: bails when there's nothing new, or when the working tree
# is dirty (someone is hand-editing — don't clobber).
#
# Status & history live in /tmp/virtualpc-auto-update.log and
# /tmp/virtualpc-auto-update.state — the vitals dashboard reads the
# latter via /api/vitals/auto-update.

set -u

# Defaults to ~/virtualpc; override via REPO_DIR=/path/to/virtualpc.
REPO="${REPO_DIR:-$HOME/virtualpc}"
REMOTE=virtualpc
BRANCH=master
LOG=/tmp/virtualpc-auto-update.log
STATE=/tmp/virtualpc-auto-update.state

log() {
  echo "$(date '+%F %T') $*" | tee -a "$LOG"
}

# Atomic state write — dashboard always sees a complete JSON blob.
write_state() {
  local status="$1"
  local msg="$2"
  local local_sha="${3:-unknown}"
  local remote_sha="${4:-unknown}"
  local tmp; tmp="$(mktemp)"
  cat > "$tmp" <<JSON
{
  "status": "$status",
  "message": "$msg",
  "local_sha": "$local_sha",
  "remote_sha": "$remote_sha",
  "checked_at": "$(date -u +%FT%TZ)"
}
JSON
  mv "$tmp" "$STATE"
}

cd "$REPO" || { log "repo not found at $REPO"; exit 1; }

# Refuse to touch a dirty tree — someone might be hand-editing.
if ! git diff --quiet HEAD -- 2>/dev/null; then
  log "skip: working tree dirty"
  write_state "dirty" "uncommitted changes — manual intervention" \
    "$(git rev-parse --short HEAD)" "?"
  exit 0
fi

log "fetch $REMOTE/$BRANCH"
if ! git fetch "$REMOTE" "$BRANCH" --quiet 2>>"$LOG"; then
  log "fetch failed"
  write_state "fetch_failed" "git fetch $REMOTE failed — see log" \
    "$(git rev-parse --short HEAD)" "?"
  exit 1
fi

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "$REMOTE/$BRANCH")
LOCAL_SHORT=${LOCAL_SHA:0:7}
REMOTE_SHORT=${REMOTE_SHA:0:7}

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "up-to-date at $LOCAL_SHORT"
  write_state "up_to_date" "no upstream changes" "$LOCAL_SHORT" "$REMOTE_SHORT"
  exit 0
fi

# Confirm we can fast-forward — refuse to merge or rebase divergent histories
# automatically. If local has commits not on remote, that's a developer's
# work-in-progress; don't paper over it.
if ! git merge-base --is-ancestor HEAD "$REMOTE/$BRANCH" 2>/dev/null; then
  log "diverged from $REMOTE/$BRANCH — local has commits not on remote"
  write_state "diverged" "local ahead of remote — push or rebase manually" \
    "$LOCAL_SHORT" "$REMOTE_SHORT"
  exit 0
fi

AHEAD_BY=$(git rev-list --count "HEAD..$REMOTE/$BRANCH")
log "fast-forwarding $AHEAD_BY commit(s): $LOCAL_SHORT → $REMOTE_SHORT"

if ! git merge --ff-only "$REMOTE/$BRANCH" --quiet 2>>"$LOG"; then
  log "fast-forward failed"
  write_state "ff_failed" "git merge --ff-only failed — see log" \
    "$LOCAL_SHORT" "$REMOTE_SHORT"
  exit 1
fi

# Install + build only if dependency or source files changed.
CHANGED=$(git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA")
if echo "$CHANGED" | grep -q "^package\(-lock\)\?\.json$"; then
  log "package.json changed — npm ci"
  if ! npm ci --silent 2>>"$LOG"; then
    log "npm ci failed"
    write_state "deps_failed" "npm ci failed — see log" "$LOCAL_SHORT" "$REMOTE_SHORT"
    exit 1
  fi
fi

if echo "$CHANGED" | grep -qE "^(src/|tsconfig\.json)"; then
  log "src changed — npm run build"
  if ! npm run build --silent 2>>"$LOG"; then
    log "build failed"
    write_state "build_failed" "tsc failed — see log" "$LOCAL_SHORT" "$REMOTE_SHORT"
    exit 1
  fi
fi

# Restart only if anything that affects the running process changed.
if echo "$CHANGED" | grep -qE "^(src/|dist/|deploy/systemd/virtualpc\.service|deploy/litellm-config\.yaml|package\.json)"; then
  log "restarting virtualpc.service"
  if ! systemctl --user restart virtualpc.service 2>>"$LOG"; then
    log "restart failed"
    write_state "restart_failed" "systemctl restart failed — see log" \
      "$LOCAL_SHORT" "$REMOTE_SHORT"
    exit 1
  fi
fi

log "updated → $REMOTE_SHORT"
write_state "updated" "applied $AHEAD_BY commit(s)" "$LOCAL_SHORT" "$REMOTE_SHORT"
