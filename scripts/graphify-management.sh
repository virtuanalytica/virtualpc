#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRAPHIFY_BIN="${GRAPHIFY_BIN:-graphify}"
GRAPHIFY_OUT="${GRAPHIFY_OUT:-$ROOT/graphify-out}"
GRAPHIFY_STATE_FILE="${GRAPHIFY_STATE_FILE:-$ROOT/data/graphify-management-state.json}"
GRAPHIFY_LOG_DIR="${GRAPHIFY_LOG_DIR:-$ROOT/reports}"
GRAPHIFY_LOG_FILE="${GRAPHIFY_LOG_FILE:-$GRAPHIFY_LOG_DIR/graphify-last-run.log}"

mkdir -p "$(dirname "$GRAPHIFY_STATE_FILE")" "$GRAPHIFY_LOG_DIR"

write_state() {
  local status="$1"
  local command="$2"
  local message="${3:-}"
  node - "$GRAPHIFY_STATE_FILE" "$status" "$command" "$message" "$GRAPHIFY_LOG_FILE" "$GRAPHIFY_OUT" <<'NODE'
const fs = require('fs');
const [file, status, command, message, logFile, outputDir] = process.argv.slice(2);
const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const next = {
  ...previous,
  status,
  command,
  message,
  logFile,
  outputDir,
  updatedAt: new Date().toISOString(),
};
if (status === 'running') next.startedAt = next.updatedAt;
if (status === 'completed' || status === 'failed') next.finishedAt = next.updatedAt;
fs.writeFileSync(file, JSON.stringify(next, null, 2));
NODE
}

require_graphify() {
  if ! command -v "$GRAPHIFY_BIN" >/dev/null 2>&1; then
    echo "Graphify is not installed. Install with: uv tool install graphifyy" >&2
    exit 127
  fi
}

common_excludes=(
  --exclude node_modules
  --exclude dist
  --exclude build
  --exclude .git
  --exclude data
  --exclude reports
  --exclude logs
  --exclude graphify-out
  --exclude test-results
)

semantic_excludes=(
  "${common_excludes[@]}"
)

code_excludes=(
  "${common_excludes[@]}"
  --exclude docs
  --exclude public
  --exclude images
)

run_extract_and_report() {
  local command="$1"
  local target="$2"
  shift 2
  require_graphify
  write_state running "$command" "Graphify build started"
  {
    echo "[$(date -Is)] $command"
    echo "root=$ROOT"
    echo "target=$target"
    echo "out=$GRAPHIFY_OUT"
    echo
    "$GRAPHIFY_BIN" extract "$target" --out "$ROOT" "$@"
    if [[ ! -s "$GRAPHIFY_OUT/graph.json" ]]; then
      echo "Graphify did not create $GRAPHIFY_OUT/graph.json" >&2
      exit 1
    fi
    echo
    "$GRAPHIFY_BIN" cluster-only "$ROOT" --no-label
    echo
    echo "[$(date -Is)] complete"
  } >"$GRAPHIFY_LOG_FILE" 2>&1 || {
    local rc=$?
    write_state failed "$command" "Graphify build failed with exit code $rc"
    exit "$rc"
  }
  write_state completed "$command" "Graphify build completed"
}

cmd="${1:-status}"
case "$cmd" in
  status)
    if command -v "$GRAPHIFY_BIN" >/dev/null 2>&1; then
      echo "graphify: $("$GRAPHIFY_BIN" --version 2>&1 || true)"
    else
      echo "graphify: not installed"
      echo "install: uv tool install graphifyy"
    fi
    echo "output: $GRAPHIFY_OUT"
    test -f "$GRAPHIFY_OUT/graph.json" && ls -lh "$GRAPHIFY_OUT/graph.json" || true
    test -f "$GRAPHIFY_OUT/GRAPH_REPORT.md" && ls -lh "$GRAPHIFY_OUT/GRAPH_REPORT.md" || true
    test -f "$GRAPHIFY_OUT/graph.html" && ls -lh "$GRAPHIFY_OUT/graph.html" || true
    ;;
  build-code)
    run_extract_and_report build-code "$ROOT/src" "${code_excludes[@]}"
    ;;
  build-semantic)
    args=("${semantic_excludes[@]}")
    if [[ -n "${GRAPHIFY_BACKEND:-}" ]]; then args+=(--backend "$GRAPHIFY_BACKEND"); fi
    if [[ -n "${GRAPHIFY_MODEL:-}" ]]; then args+=(--model "$GRAPHIFY_MODEL"); fi
    run_extract_and_report build-semantic "$ROOT" "${args[@]}"
    ;;
  install-claude-project)
    require_graphify
    write_state running "$cmd" "Installing Graphify Claude Code project integration"
    "$GRAPHIFY_BIN" claude install --project >"$GRAPHIFY_LOG_FILE" 2>&1
    write_state completed "$cmd" "Graphify Claude Code project integration installed"
    ;;
  install-codex-project)
    require_graphify
    write_state running "$cmd" "Installing Graphify Codex project integration"
    "$GRAPHIFY_BIN" codex install --project >"$GRAPHIFY_LOG_FILE" 2>&1
    write_state completed "$cmd" "Graphify Codex project integration installed"
    ;;
  install-claw-project)
    require_graphify
    write_state running "$cmd" "Installing Graphify OpenClaw project integration"
    "$GRAPHIFY_BIN" claw install --project >"$GRAPHIFY_LOG_FILE" 2>&1
    write_state completed "$cmd" "Graphify OpenClaw project integration installed"
    ;;
  *)
    cat >&2 <<EOF
Usage: scripts/graphify-management.sh <command>

Commands:
  status
  build-code              Build a local code-only graph without semantic docs.
  build-semantic          Build code + docs; set GRAPHIFY_BACKEND/GRAPHIFY_MODEL.
  install-claude-project  Install project-scoped Claude Code Graphify hooks.
  install-codex-project   Install project-scoped Codex Graphify hooks.
  install-claw-project    Install project-scoped OpenClaw Graphify instructions.
EOF
    exit 2
    ;;
esac
