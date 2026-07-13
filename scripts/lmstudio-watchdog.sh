#!/usr/bin/env bash
# LM Studio watchdog — keeps the local inference backend alive for VirtualPC agents.
#
# Runs every 60s. Ensures:
#   1. The LM Studio HTTP server on port 1234 is listening.
#   2. At least ONE chat-capable model is loaded (Phi-4 by default — smallest/fastest).
#   3. Logs to /tmp/lmstudio-watchdog.log.
#
# Install as a user systemd timer:
#   systemctl --user enable --now lmstudio-watchdog.timer
#
# Or run in background for dev:
#   nohup scripts/lmstudio-watchdog.sh --daemon > /tmp/lmstudio-watchdog.log 2>&1 &

set -u

export PATH="$HOME/.lmstudio/bin:$PATH"
LOG=/tmp/lmstudio-watchdog.log
PORT=1234
# Pick small/fast model as the baseline (Vice's Gemma 26B failures showed big
# models are a fragility risk). Override via LMSTUDIO_BASELINE_MODEL.
BASELINE_MODEL="${LMSTUDIO_BASELINE_MODEL:-microsoft/phi-4}"
TTL_MINUTES="${LMSTUDIO_TTL_MIN:-120}"

log() {
  echo "$(date '+%F %T') $*" | tee -a "$LOG"
}

start_server() {
  if command -v systemd-run >/dev/null 2>&1; then
    systemd-run --user --scope --quiet --collect \
      --property=KillMode=process \
      --setenv=ELECTRON_DISABLE_GPU=1 \
      --setenv=LIBGL_ALWAYS_SOFTWARE=1 \
      lms server start >> "$LOG" 2>&1
  else
    ELECTRON_DISABLE_GPU=1 LIBGL_ALWAYS_SOFTWARE=1 lms server start >> "$LOG" 2>&1
  fi
}

load_model() {
  local ttl_seconds="$((TTL_MINUTES * 60))"

  if command -v systemd-run >/dev/null 2>&1; then
    systemd-run --user --quiet --collect \
      --unit="lmstudio-load-$(date +%s)-$$" \
      --property=KillMode=process \
      --property="StandardOutput=append:$LOG" \
      --property="StandardError=append:$LOG" \
      --setenv=ELECTRON_DISABLE_GPU=1 \
      --setenv=LIBGL_ALWAYS_SOFTWARE=1 \
      lms load "$BASELINE_MODEL" --ttl "$ttl_seconds"
  else
    ELECTRON_DISABLE_GPU=1 LIBGL_ALWAYS_SOFTWARE=1 \
      lms load "$BASELINE_MODEL" --ttl "$ttl_seconds" >> "$LOG" 2>&1 &
  fi
}

check_and_heal() {
  # Step 1: is the server listening?
  if ! ss -lnt 2>/dev/null | grep -q ":$PORT "; then
    log "server not listening on $PORT — starting"
    start_server || log "  lms server start FAILED"
    sleep 2
  fi

  # Step 2: can we hit /v1/models?
  if ! curl -sS -m 3 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/v1/models" | grep -q "^200$"; then
    log "server unhealthy (no 200 from /v1/models) — restarting"
    lms server stop >> "$LOG" 2>&1 || true
    sleep 1
    start_server
    sleep 3
  fi

  # Step 3: is at least one chat-capable model loaded?
  # `lms ps` prints a header + rows; count non-empty non-header rows mentioning IDLE/LOADED
  LOADED_COUNT=$(lms ps 2>/dev/null | tail -n +2 | grep -cE 'IDLE|LOADED|LOADING' || true)
  if [ "${LOADED_COUNT:-0}" -eq 0 ]; then
    log "no models loaded — loading baseline $BASELINE_MODEL"
    load_model || log "  lms load FAILED"
  fi
}

if [ "${1:-}" = "--daemon" ]; then
  log "watchdog started (baseline=$BASELINE_MODEL, ttl=${TTL_MINUTES}m)"
  while true; do
    check_and_heal
    sleep 60
  done
else
  check_and_heal
fi
