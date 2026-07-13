#!/usr/bin/env bash
# Verify that MOLGANG/SmartSlag software can be operated by VirtualPC agents.
# This script is intentionally read-only except for transient logs. It is safe
# for OpenClaw/agent automation to run repeatedly.

set -u

JSON=false
if [[ "${1:-}" == "--json" ]]; then
  JSON=true
fi

VPC_ROOT="${VIRTUALPC_ROOT:-/home/knight2/virtualpc}"
MOLGANG_ROOT="${MOLGANG_ROOT:-/home/knight2/molgang-roblox}"
LOG_DIR="$VPC_ROOT/logs"
mkdir -p "$LOG_DIR" 2>/dev/null || true

PASS=0
WARN=0
FAIL=0
RESULTS=()

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n'
}

record() {
  local status="$1" key="$2" detail="$3"
  case "$status" in
    pass) PASS=$((PASS + 1)) ;;
    warn) WARN=$((WARN + 1)) ;;
    fail) FAIL=$((FAIL + 1)) ;;
  esac
  RESULTS+=("$status|$key|$detail")
  if [[ "$JSON" != true ]]; then
    printf '%-5s %-34s %s\n' "[$status]" "$key" "$detail"
  fi
}

exists_file() {
  local key="$1" path="$2"
  if [[ -f "$path" ]]; then record pass "$key" "$path"; else record fail "$key" "missing: $path"; fi
}

exists_dir() {
  local key="$1" path="$2"
  if [[ -d "$path" ]]; then record pass "$key" "$path"; else record fail "$key" "missing: $path"; fi
}

command_ok() {
  local key="$1" cmd="$2"
  if command -v "$cmd" >/dev/null 2>&1; then record pass "$key" "$(command -v "$cmd")"; else record warn "$key" "not on PATH: $cmd"; fi
}

exists_dir "virtualpc.root" "$VPC_ROOT"
exists_file "virtualpc.package" "$VPC_ROOT/package.json"
exists_file "virtualpc.agent_registry" "$VPC_ROOT/src/agent-registry.ts"
exists_file "virtualpc.openclaw_handler" "$VPC_ROOT/src/openclaw/openclaw-handler.ts"
exists_file "virtualpc.delegate_molgang" "$VPC_ROOT/scripts/delegate-molgang-roadmap.js"
exists_file "virtualpc.blender_wrapper" "$VPC_ROOT/scripts/blender-render.sh"
exists_dir "molgang.root" "$MOLGANG_ROOT"
exists_file "molgang.readme" "$MOLGANG_ROOT/README.md"
exists_file "molgang.smartslag_spec" "$MOLGANG_ROOT/docs/SMARTSLAG_RESEARCH_NETWORK.md"
exists_file "molgang.quality_backlog" "$MOLGANG_ROOT/docs/GTA6_QUALITY_BACKLOG.md"
exists_file "molgang.asset_registry" "$MOLGANG_ROOT/assets/MESH_REGISTRY.json"
exists_dir "molgang.gltf_assets" "$MOLGANG_ROOT/assets/gltf"
exists_dir "molgang.blender_scripts" "$MOLGANG_ROOT/assets/blender"
exists_file "molgang.slag_generator" "$MOLGANG_ROOT/assets/blender/generate_slag_models.py"
exists_file "molgang.render_scheduler" "$MOLGANG_ROOT/assets/pipeline/gpu_scheduler.py"

command_ok "runtime.node" node
command_ok "runtime.npm" npm
command_ok "runtime.git" git
command_ok "runtime.flatpak" flatpak
command_ok "runtime.curl" curl

if command -v flatpak >/dev/null 2>&1; then
  if flatpak list --app --columns=application 2>/dev/null | grep -qx 'org.blender.Blender'; then
    record pass "tool.blender_flatpak" "org.blender.Blender installed"
  else
    record fail "tool.blender_flatpak" "org.blender.Blender not installed"
  fi
else
  record fail "tool.blender_flatpak" "flatpak unavailable"
fi

if command -v godot >/dev/null 2>&1; then
  record pass "tool.godot" "$(command -v godot)"
elif [[ -d /home/knight2/.config/godot || -d /home/knight2/.local/share/godot ]]; then
  record warn "tool.godot" "config exists, binary not on PATH"
else
  record warn "tool.godot" "not installed / not on PATH"
fi

if command -v unreal-editor >/dev/null 2>&1; then
  record pass "tool.unreal" "$(command -v unreal-editor)"
else
  record warn "tool.unreal" "not installed / not on PATH"
fi

if [[ -x "$VPC_ROOT/scripts/blender-render.sh" ]]; then
  record pass "ops.blender_wrapper_executable" "executable"
else
  record fail "ops.blender_wrapper_executable" "run chmod +x scripts/blender-render.sh"
fi

if [[ -x "$VPC_ROOT/scripts/delegate-molgang-roadmap.js" ]]; then
  record pass "ops.delegate_molgang_executable" "executable"
else
  record warn "ops.delegate_molgang_executable" "node can still run it, chmod optional"
fi

if [[ -f "$VPC_ROOT/dist/index.js" ]]; then
  record pass "build.virtualpc_dist" "dist/index.js exists"
else
  record warn "build.virtualpc_dist" "run npm run build before service start"
fi

if curl -fsS --max-time 2 http://127.0.0.1:3100/api/health >/dev/null 2>&1 || curl -fsS --max-time 2 http://127.0.0.1:3100/health >/dev/null 2>&1; then
  record pass "service.virtualpc_api" "reachable on :3100"
else
  record warn "service.virtualpc_api" "not reachable; start with npm run start or systemd"
fi

if curl -fsS --max-time 2 http://127.0.0.1:4000/health/liveliness >/dev/null 2>&1; then
  record pass "service.litellm" "reachable on :4000"
else
  record warn "service.litellm" "not reachable; local/cloud model routing may be unavailable"
fi

READY=false
if [[ "$FAIL" -eq 0 ]]; then READY=true; fi

if [[ "$JSON" == true ]]; then
  printf '{"ready":%s,"pass":%d,"warn":%d,"fail":%d,"checks":[' "$READY" "$PASS" "$WARN" "$FAIL"
  first=true
  for row in "${RESULTS[@]}"; do
    IFS='|' read -r status key detail <<< "$row"
    if [[ "$first" == true ]]; then first=false; else printf ','; fi
    printf '{"status":"%s","key":"%s","detail":"%s"}' "$(json_escape "$status")" "$(json_escape "$key")" "$(json_escape "$detail")"
  done
  printf ']}\n'
else
  echo
  echo "Summary: pass=$PASS warn=$WARN fail=$FAIL ready=$READY"
fi

if [[ "$FAIL" -eq 0 ]]; then exit 0; else exit 1; fi
