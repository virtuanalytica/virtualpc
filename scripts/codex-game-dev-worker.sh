#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${VPC_CODEX_STATE_DIR:-$ROOT_DIR/data/codex-game-dev}"
WORKER_ID="${1:?worker id required}"
WORKSPACE="${2:?workspace path required}"
ROLE="${3:?worker role required}"
MODEL="${VPC_CODEX_MODEL:-}"
COOLDOWN_SEC="${VPC_CODEX_COOLDOWN_SEC:-90}"
LOG_DIR="$STATE_DIR/logs"
STATUS_DIR="$STATE_DIR/status"
STOP_FILE="$STATE_DIR/stop"

mkdir -p "$LOG_DIR" "$STATUS_DIR"

status_file="$STATUS_DIR/$WORKER_ID.json"
last_message="$STATUS_DIR/$WORKER_ID.last.md"

write_status() {
  local state="$1"
  local detail="${2:-}"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"worker":"%s","role":"%s","pid":%s,"state":"%s","detail":"%s","workspace":"%s","model":"%s","updated_at":"%s"}\n' \
    "$WORKER_ID" "$ROLE" "$$" "$state" "${detail//\"/\\\"}" "$WORKSPACE" "${MODEL:-default}" "$now" > "$status_file"
}

prompt_for_round() {
  cat <<PROMPT
You are VirtualPC Codex game developer $WORKER_ID.

Role: $ROLE
Workspace: $WORKSPACE

Mission:
- Improve the MOLGANG / VirtualPC game-development stack with one concrete, shippable change per run.
- Prefer real game work over dashboard simulation: gameplay, 3D/4D asset pipeline, WebGL/Three.js, Roblox/Rojo, playtesting, build tooling, performance, QA, or docs that unblock developers.
- Inspect the repository first and choose a small task that fits your role.
- Work only in this worker workspace and branch.
- Do not modify secrets, credentials, host system settings, or files outside the workspace.
- Avoid destructive git commands. Do not merge to main. Leave your branch ready for coordinator review.
- Run the narrowest useful verification you can. If verification cannot run, explain exactly why.

Output:
- A concise summary of what changed.
- Files touched.
- Verification run.
- Any follow-up needed from the coordinator.
PROMPT
}

write_status "starting" "worker boot"

while [ ! -f "$STOP_FILE" ]; do
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  run_log="$LOG_DIR/$WORKER_ID.$ts.log"
  write_status "running" "codex exec started"

  codex_args=(--ask-for-approval never exec --cd "$WORKSPACE" --sandbox workspace-write --output-last-message "$last_message")
  if [ -n "$MODEL" ]; then
    codex_args=(--model "$MODEL" "${codex_args[@]}")
  fi

  if prompt_for_round | nice -n "${VPC_CODEX_NICE:-10}" ionice -c 3 codex "${codex_args[@]}" - > "$run_log" 2>&1; then
    write_status "cooldown" "last run completed"
  else
    rc=$?
    write_status "cooldown" "last run failed exit=$rc"
  fi

  sleep "$COOLDOWN_SEC"
done

write_status "stopped" "stop file observed"
