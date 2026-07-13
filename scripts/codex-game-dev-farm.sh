#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${VPC_CODEX_STATE_DIR:-$ROOT_DIR/data/codex-game-dev}"
PID_DIR="$STATE_DIR/pids"
STATUS_DIR="$STATE_DIR/status"
WORKSPACE_ROOT="${VPC_CODEX_WORKSPACE_ROOT:-$STATE_DIR/workspaces}"
LOG_DIR="$STATE_DIR/logs"
STOP_FILE="$STATE_DIR/stop"
WORKER_SCRIPT="$ROOT_DIR/scripts/codex-game-dev-worker.sh"

ROLES=(
  "gameplay systems developer"
  "3D asset pipeline developer"
  "4D simulation and temporal-effects developer"
  "Three.js / WebGL developer"
  "Roblox / Rojo developer"
  "physics and interaction developer"
  "game UI and HUD developer"
  "build and release engineer"
  "playtest automation engineer"
  "performance and profiling engineer"
  "NPC AI and dialogue developer"
  "economy and progression systems developer"
  "audio and voice pipeline developer"
  "shader and VFX developer"
  "tooling and editor workflow developer"
  "accessibility and input systems developer"
)

usage() {
  cat <<'USAGE'
Usage: scripts/codex-game-dev-farm.sh <start|stop|restart|status> [--count N|--auto]

Starts real Codex game developers as detached worker loops.

Environment:
  VPC_CODEX_MODEL=gpt-5.5
  VPC_CODEX_MAX_WORKERS=<cap, default cpu cores>
  VPC_CODEX_RESERVE_CORES=<reserve, default 1>
  VPC_CODEX_COOLDOWN_SEC=<seconds between worker runs, default 90>
  VPC_CODEX_WORKSPACE_ROOT=<worktree root>
USAGE
}

cpu_cores() {
  if command -v nproc >/dev/null 2>&1; then
    nproc
  else
    grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1
  fi
}

ceil_load1() {
  awk '{ n=int($1); if ($1 > n) n++; print n }' /proc/loadavg
}

auto_count() {
  local cores load reserve max spare
  cores="$(cpu_cores)"
  load="$(ceil_load1)"
  reserve="${VPC_CODEX_RESERVE_CORES:-1}"
  max="${VPC_CODEX_MAX_WORKERS:-$cores}"
  spare=$((cores - load - reserve))
  if [ "$spare" -lt 1 ]; then spare=1; fi
  if [ "$spare" -gt "$max" ]; then spare="$max"; fi
  echo "$spare"
}

worker_id() {
  printf "codex-game-dev-%03d" "$1"
}

worker_role() {
  local idx=$(( ($1 - 1) % ${#ROLES[@]} ))
  echo "${ROLES[$idx]}"
}

ensure_workspace() {
  local id="$1"
  local workspace="$2"
  local branch="codex/game-dev/$id"

  mkdir -p "$WORKSPACE_ROOT"
  if [ -d "$workspace/.git" ] || [ -f "$workspace/.git" ]; then
    return 0
  fi

  if git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$ROOT_DIR" worktree add -b "$branch" "$workspace" HEAD >/dev/null 2>&1 \
      || git -C "$ROOT_DIR" worktree add "$workspace" "$branch" >/dev/null
  else
    mkdir -p "$workspace"
  fi
}

is_pid_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start_one() {
  local n="$1"
  local id workspace role pid_file
  id="$(worker_id "$n")"
  workspace="$WORKSPACE_ROOT/$id"
  role="$(worker_role "$n")"
  pid_file="$PID_DIR/$id.pid"

  if [ -f "$pid_file" ] && is_pid_alive "$(cat "$pid_file")"; then
    echo "$id already running pid=$(cat "$pid_file")"
    return 0
  fi

  ensure_workspace "$id" "$workspace"
  nohup "$WORKER_SCRIPT" "$id" "$workspace" "$role" >> "$LOG_DIR/$id.supervisor.log" 2>&1 &
  echo "$!" > "$pid_file"
  echo "started $id pid=$! role=$role workspace=$workspace"
}

cmd_start() {
  local count="auto"
  while [ $# -gt 0 ]; do
    case "$1" in
      --count) count="${2:?missing count}"; shift 2 ;;
      --auto) count="auto"; shift ;;
      *) echo "unknown option: $1" >&2; usage; exit 2 ;;
    esac
  done
  mkdir -p "$PID_DIR" "$STATUS_DIR" "$WORKSPACE_ROOT" "$LOG_DIR"
  rm -f "$STOP_FILE"
  if [ "$count" = "auto" ]; then count="$(auto_count)"; fi
  for n in $(seq 1 "$count"); do
    start_one "$n"
  done
  echo "target_workers=$count"
}

cmd_stop() {
  mkdir -p "$PID_DIR" "$STATUS_DIR"
  touch "$STOP_FILE"
  local pid_file pid id
  for pid_file in "$PID_DIR"/*.pid; do
    [ -e "$pid_file" ] || continue
    id="$(basename "$pid_file" .pid)"
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if is_pid_alive "$pid"; then
      kill -TERM "$pid" 2>/dev/null || true
      echo "stopping $id pid=$pid"
    fi
  done
}

cmd_status() {
  local cores load auto running pid_file pid
  cores="$(cpu_cores)"
  load="$(awk '{print $1}' /proc/loadavg)"
  auto="$(auto_count)"
  running=0
  mkdir -p "$PID_DIR" "$STATUS_DIR"
  for pid_file in "$PID_DIR"/*.pid; do
    [ -e "$pid_file" ] || continue
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if is_pid_alive "$pid"; then running=$((running + 1)); fi
  done
  echo "cores=$cores load1=$load auto_target=$auto running=$running state_dir=$STATE_DIR"
  for f in "$STATUS_DIR"/*.json; do
    [ -e "$f" ] || continue
    cat "$f"
  done
}

cmd="${1:-}"
shift || true
case "$cmd" in
  start) cmd_start "$@" ;;
  stop) cmd_stop "$@" ;;
  restart) cmd_stop; sleep 2; cmd_start "$@" ;;
  status) cmd_status ;;
  -h|--help|help|"") usage ;;
  *) echo "unknown command: $cmd" >&2; usage; exit 2 ;;
esac
