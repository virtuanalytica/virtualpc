#!/usr/bin/env bash
# System vitals sampler.
#
# Produces two outputs:
#   logs/vitals.jsonl       — append-only time series (one JSON line per sample)
#   logs/gpu-overview.json  — latest snapshot (overwritten each tick)
#
# Per sample we capture:
#   - Host: load, CPU%, memory, disk (root + EDS2)
#   - GPUs: util, mem_used, mem_total, temp, power (per card)
#   - GPU compute processes: pid, gpu_index, name, memory, mapped agent
#   - Service liveness: virtualpc (3100), ollama (11434)
#
# Agent mapping lets you see "who's holding VRAM right now." Extend the
# classify() function when you add more workloads.
#
# Usage: vitals-monitor.sh [interval_seconds]   (default 30)
#        vitals-monitor.sh --once               (one sample, then exit)

set -u

INTERVAL="${1:-30}"
LOG_DIR="/home/knight2/virtualpc/logs"
JSONL="$LOG_DIR/vitals.jsonl"
SNAP="$LOG_DIR/gpu-overview.json"
SETTINGS="/home/knight2/virtualpc/data/settings.json"
mkdir -p "$LOG_DIR"

# Map a process cmdline pattern to a human-readable agent name.
classify() {
  local cmd="$1"
  case "$cmd" in
    *"ollama serve"*|*"ollama-serve"*|*"/ollama-install/bin/ollama"*) echo "ollama-server" ;;
    *"ollama runner"*|*"runner "*) echo "ollama-runner" ;;  # per-model child
    *"node dist/index.js"*)                                  echo "virtualpc" ;;
    *"obs --multi"*|*"obs-browser-page"*)                    echo "OBS" ;;
    *"type=gpu-process"*|*"chromium"*|*"chrome"*)            echo "chromium" ;;
    *"Xorg"*)                                                echo "xorg" ;;
    *"gnome-shell"*)                                         echo "gnome-shell" ;;
    *"blender"*)                                             echo "blender" ;;
    *"claude"*)                                              echo "claude-code" ;;
    *"python"*)                                              echo "python" ;;
    *)                                                       echo "other" ;;
  esac
}

# Resolve PID → full cmdline (null-safe)
pid_cmd() {
  local pid="$1"
  [[ -r "/proc/$pid/cmdline" ]] || { echo ""; return; }
  tr '\0' ' ' < "/proc/$pid/cmdline" | sed 's/ $//'
}

ceil_pct_of() {
  local total="$1" pct="$2"
  python3 - "$total" "$pct" <<'PY'
import math, sys
total = float(sys.argv[1])
pct = float(sys.argv[2])
print(max(1, int(math.ceil(total * pct / 100.0))))
PY
}

cpu_temp_max_c() {
  sensors 2>/dev/null | awk '
    /Package id [0-9]+:/ {
      gsub(/\+|°C/, "", $4)
      if ($4 + 0 > max) max = $4 + 0
    }
    END { if (max == "") print 0; else printf "%.1f\n", max }
  '
}

load_resource_settings() {
  python3 - "$SETTINGS" <<'PY' 2>/dev/null || true
import json, shlex, sys
defaults = {
  "enabled": True,
  "cpuTemperatureLimitC": 60,
  "gpuTemperatureLimitC": 60,
  "totalThreadPct": 25,
  "perAgentThreadPct": 25,
  "ramUtilizationPct": 75,
  "gpuClockPctWhenHot": 50,
  "gpuMemoryPctPerSystem": 50,
  "targets": ["virtualpc", "alexander"],
}
try:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
    rc = {**defaults, **(data.get("resourceControls") or {})}
except Exception:
    rc = defaults

def num(name, lo, hi):
    try:
        n = float(rc.get(name, defaults[name]))
    except Exception:
        n = defaults[name]
    return max(lo, min(hi, n))

targets = rc.get("targets") if isinstance(rc.get("targets"), list) else defaults["targets"]
targets = [str(t).strip().lower() for t in targets if str(t).strip()]
values = {
    "RC_ENABLED": "1" if rc.get("enabled", True) else "0",
    "RC_CPU_TEMP_LIMIT": num("cpuTemperatureLimitC", 30, 100),
    "RC_GPU_TEMP_LIMIT": num("gpuTemperatureLimitC", 30, 100),
    "RC_TOTAL_THREAD_PCT": num("totalThreadPct", 1, 100),
    "RC_PER_AGENT_THREAD_PCT": num("perAgentThreadPct", 1, 100),
    "RC_RAM_PCT": num("ramUtilizationPct", 1, 100),
    "RC_GPU_CLOCK_PCT": num("gpuClockPctWhenHot", 1, 100),
    "RC_GPU_MEM_PCT": num("gpuMemoryPctPerSystem", 1, 100),
    "RC_TARGETS": " ".join(targets or defaults["targets"]),
}
for k, v in values.items():
    print(f"{k}={shlex.quote(str(v))}")
PY
}

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

docker_names_for_target() {
  local target="$1"
  command -v docker >/dev/null 2>&1 || return 0
  docker ps --format '{{.Names}}' 2>/dev/null | awk -v t="$target" 'index(tolower($0), t) == 1 {print}'
}

agent_pids_for_target() {
  local target="$1"
  case "$target" in
    alexander)
      pgrep -f '/home/knight2/alexander|/media/knight2/EDS2/projects/alexander|[[:<:]]alexander[[:>:]]' 2>/dev/null || true
      ;;
    virtualpc)
      pgrep -f '/home/knight2/virtualpc|/media/knight2/EDS2/.*/virtualpc|node dist/index.js' 2>/dev/null || true
      ;;
  esac
}

nearest_supported_gpu_clock() {
  local gpu="$1" pct="$2" column="$3"
  nvidia-smi -i "$gpu" --query-supported-clocks=memory,graphics --format=csv,noheader,nounits 2>/dev/null \
    | python3 - "$pct" "$column" <<'PY' 2>/dev/null
import sys
pct = float(sys.argv[1])
column = int(sys.argv[2])
vals = []
for line in sys.stdin:
    parts = [p.strip() for p in line.split(",")]
    if len(parts) > column:
        try:
            vals.append(int(float(parts[column])))
        except ValueError:
            pass
if not vals:
    sys.exit(1)
mx = max(vals)
target = mx * pct / 100.0
eligible = [v for v in vals if v <= target]
print(max(eligible) if eligible else min(vals))
PY
}

apply_gpu_clock_limit() {
  local hot="$1" gpu_count="$2" clock_pct="$3"
  command -v nvidia-smi >/dev/null 2>&1 || return 0
  [[ "$hot" == "1" && "$gpu_count" -gt 0 ]] || return 0

  local i mem_clock gfx_clock
  for ((i = 0; i < gpu_count; i++)); do
    mem_clock="$(nearest_supported_gpu_clock "$i" "$clock_pct" 0 || true)"
    gfx_clock="$(nearest_supported_gpu_clock "$i" "$clock_pct" 1 || true)"
    [[ -n "$gfx_clock" ]] && nvidia-smi -i "$i" -lgc "$gfx_clock,$gfx_clock" >/dev/null 2>&1 || true
    [[ -n "$mem_clock" ]] && nvidia-smi -i "$i" -lmc "$mem_clock,$mem_clock" >/dev/null 2>&1 || true
  done
}

apply_resource_guard() {
  local cpu_temp="$1" gpu_max_temp="$2" gpu_count="$3" mem_total="$4"
  local settings_vars
  settings_vars="$(load_resource_settings)"
  eval "$settings_vars"

  if [[ "${RC_ENABLED:-1}" != "1" ]]; then
    printf '{"enabled":false}'
    return
  fi

  local hot=0 cpu_hot=0 gpu_hot=0
  awk "BEGIN{exit !($cpu_temp >= ${RC_CPU_TEMP_LIMIT:-60})}" && cpu_hot=1 || true
  awk "BEGIN{exit !($gpu_max_temp >= ${RC_GPU_TEMP_LIMIT:-60} && $gpu_count > 0)}" && gpu_hot=1 || true
  [[ "$cpu_hot" == "1" || "$gpu_hot" == "1" ]] && hot=1

  local total_threads per_agent_threads
  if [[ "$cpu_hot" == "1" ]]; then
    total_threads="$(ceil_pct_of "$(nproc)" "$(awk "BEGIN{print ${RC_TOTAL_THREAD_PCT:-25} / 2}")")"
    per_agent_threads="$(ceil_pct_of "$(nproc)" "$(awk "BEGIN{print ${RC_PER_AGENT_THREAD_PCT:-25} / 2}")")"
  else
    total_threads="$(ceil_pct_of "$(nproc)" "${RC_TOTAL_THREAD_PCT:-25}")"
    per_agent_threads="$(ceil_pct_of "$(nproc)" "${RC_PER_AGENT_THREAD_PCT:-25}")"
  fi

  local target docker_targets=() pids=()
  for target in ${RC_TARGETS:-virtualpc alexander}; do
    while IFS= read -r name; do [[ -n "$name" ]] && docker_targets+=("$name"); done < <(docker_names_for_target "$target")
    while IFS= read -r pid; do
      [[ -n "$pid" && "$pid" != "$$" ]] && pids+=("$pid")
    done < <(agent_pids_for_target "$target")
  done

  local containers_count="${#docker_targets[@]}"
  local cpus_each="$per_agent_threads"
  if [[ "$containers_count" -gt 0 ]]; then
    cpus_each=$(( total_threads / containers_count ))
    [[ "$cpus_each" -lt 1 ]] && cpus_each=1
    [[ "$cpus_each" -gt "$per_agent_threads" ]] && cpus_each="$per_agent_threads"
  fi

  local ram_limit_mb mem_each_mb
  ram_limit_mb="$(ceil_pct_of "$mem_total" "${RC_RAM_PCT:-75}")"
  mem_each_mb="$ram_limit_mb"
  if [[ "$containers_count" -gt 0 ]]; then
    mem_each_mb=$(( ram_limit_mb / containers_count ))
    [[ "$mem_each_mb" -lt 256 ]] && mem_each_mb=256
  fi

  if command -v docker >/dev/null 2>&1; then
    for target in "${docker_targets[@]}"; do
      docker update --cpus="$cpus_each" --memory="${mem_each_mb}m" --memory-swap="${mem_each_mb}m" "$target" >/dev/null 2>&1 || true
    done
  fi

  if command -v taskset >/dev/null 2>&1; then
    local cpu_list
    if [[ "$per_agent_threads" -le 1 ]]; then cpu_list="0"; else cpu_list="0-$((per_agent_threads - 1))"; fi
    local pid
    for pid in "${pids[@]}"; do
      [[ -d "/proc/$pid" ]] && taskset -pc "$cpu_list" "$pid" >/dev/null 2>&1 || true
    done
  fi

  apply_gpu_clock_limit "$gpu_hot" "$gpu_count" "${RC_GPU_CLOCK_PCT:-50}"

  local targets_json
  targets_json="$(printf '%s\n' "${docker_targets[@]}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')"
  printf '{"enabled":true,"hot":%s,"cpu_hot":%s,"gpu_hot":%s,"cpu_temp_limit_c":%s,"gpu_temp_limit_c":%s,"total_thread_pct":%s,"per_agent_thread_pct":%s,"effective_total_threads":%s,"effective_per_agent_threads":%s,"container_cpu_limit_threads":%s,"ram_utilization_pct":%s,"ram_limit_mb":%s,"container_memory_limit_mb":%s,"gpu_clock_pct_when_hot":%s,"gpu_memory_pct_per_system":%s,"docker_targets":%s,"host_pids":%s}' \
    "$hot" "$cpu_hot" "$gpu_hot" "${RC_CPU_TEMP_LIMIT:-60}" "${RC_GPU_TEMP_LIMIT:-60}" \
    "${RC_TOTAL_THREAD_PCT:-25}" "${RC_PER_AGENT_THREAD_PCT:-25}" "$total_threads" "$per_agent_threads" \
    "$cpus_each" "${RC_RAM_PCT:-75}" "$ram_limit_mb" "$mem_each_mb" "${RC_GPU_CLOCK_PCT:-50}" "${RC_GPU_MEM_PCT:-50}" \
    "$targets_json" "${#pids[@]}"
}

sample() {
  local ts load1 load5 load15 mem_total mem_used mem_avail cpu_pct
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  read -r load1 load5 load15 _ < /proc/loadavg
  read -r _ mem_total mem_used _ _ _ mem_avail < <(free -m | awk 'NR==2')

  local root_used root_free eds2_used eds2_free
  read -r root_used root_free < <(df -BG / | awk 'NR==2 {gsub("%","",$5); gsub("G","",$4); print $5, $4}')
  read -r eds2_used eds2_free < <(df -BG /media/knight2/EDS2 2>/dev/null | awk 'NR==2 {gsub("%","",$5); gsub("G","",$4); print $5, $4}')
  eds2_used="${eds2_used:-0}"
  eds2_free="${eds2_free:-0}"

  cpu_pct=$(top -bn1 | awk '/Cpu\(s\)/ {print 100 - $8; exit}')
  local cpu_temp_c
  cpu_temp_c="$(cpu_temp_max_c)"

  # Per-GPU summary
  local gpus
  gpus=$(nvidia-smi --query-gpu=index,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw \
                    --format=csv,noheader,nounits 2>/dev/null \
         | awk -F', *' 'BEGIN{printf "["} {if(NR>1)printf ","; printf "{\"i\":%d,\"util\":%d,\"mem_used\":%d,\"mem_total\":%d,\"temp\":%d,\"power\":%.1f}",$1,$2,$3,$4,$5,$6} END{printf "]"}')
  gpus="${gpus:-[]}"
  local gpu_max_temp gpu_count
  read -r gpu_max_temp gpu_count < <(python3 <<PY
import json
gpus = json.loads('''$gpus''')
temps = [g.get("temp", 0) for g in gpus]
print((max(temps) if temps else 0), len(gpus))
PY
)

  # Per-process GPU attribution. Python handles the JSON escaping — bash
  # string mangling breaks on cmdlines with nested quotes (LM Studio's
  # `node -e '...require("...");...'` is a notorious offender).
  local procs_json
  procs_json=$(python3 <<'PY'
import json, os, re, subprocess
r = subprocess.run(["nvidia-smi", "pmon", "-c", "1", "-s", "m"],
                   capture_output=True, text=True)
rows = []
for line in r.stdout.splitlines():
    if not line or line.startswith("#"):
        continue
    parts = line.split()
    if len(parts) < 4 or not parts[1].isdigit():
        continue
    gpu, pid, _proc_type, mem = parts[0], int(parts[1]), parts[2], parts[3]
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            cmd = f.read().replace(b"\x00", b" ").decode("utf-8", "replace").strip()
    except FileNotFoundError:
        cmd = ""
    name = re.sub(r".*/", "", cmd.split()[0] if cmd else "")
    # Agent classifier mirrors the bash classify() function.
    lc = cmd.lower()
    if "ollama serve" in cmd or "/ollama-install/bin/ollama" in cmd:
        agent = "ollama-server"
    elif "ollama runner" in cmd or "ollama runner" in lc:
        agent = "ollama-runner"
    elif "node dist/index.js" in cmd:
        agent = "virtualpc"
    elif "lmstudio" in cmd or "llmworker" in cmd or "llmster" in cmd:
        agent = "lm-studio"
    elif "obs --multi" in cmd or "obs-browser-page" in cmd:
        agent = "OBS"
    elif "type=gpu-process" in cmd or "chromium" in cmd or "chrome" in cmd:
        agent = "chromium"
    elif "Xorg" in cmd:
        agent = "xorg"
    elif "gnome-shell" in cmd:
        agent = "gnome-shell"
    elif "blender" in cmd:
        agent = "blender"
    elif "claude" in cmd:
        agent = "claude-code"
    elif "python" in cmd:
        agent = "python"
    else:
        agent = "other"
    rows.append({
        "pid": pid, "gpu": int(gpu), "mem_mb": int(mem) if mem != "-" else 0,
        "name": name, "agent": agent, "cmd": cmd[:160],
    })
print(json.dumps(rows))
PY
)
  [[ -z "$procs_json" ]] && procs_json="[]"

  # Ollama loaded-models summary (which model lives in VRAM right now)
  local ollama_ps
  ollama_ps=$(curl -s --max-time 1 http://localhost:11434/api/ps 2>/dev/null)
  [[ -z "$ollama_ps" ]] && ollama_ps='{"models":[]}'

  # Service liveness
  local vpc_up=0 ollama_up=0
  ss -tln 2>/dev/null | grep -q ':3100 '  && vpc_up=1
  ss -tln 2>/dev/null | grep -q ':11434 ' && ollama_up=1

  local resource_guard
  resource_guard="$(apply_resource_guard "${cpu_temp_c:-0}" "${gpu_max_temp:-0}" "${gpu_count:-0}" "$mem_total")"

  # Assemble sample line
  local line
  line=$(printf '{"ts":"%s","load":{"1":%s,"5":%s,"15":%s},"cpu_pct":%.1f,"cpu_temp_c":%.1f,"mem_mb":{"total":%s,"used":%s,"avail":%s},"disk":{"root_used_pct":%s,"root_free_gb":%s,"eds2_used_pct":%s,"eds2_free_gb":%s},"gpus":%s,"gpu_procs":%s,"ollama":%s,"services":{"virtualpc_3100":%d,"ollama_11434":%d},"resource_guard":%s}' \
    "$ts" "$load1" "$load5" "$load15" "${cpu_pct:-0}" "${cpu_temp_c:-0}" "$mem_total" "$mem_used" "$mem_avail" \
    "$root_used" "$root_free" "$eds2_used" "$eds2_free" "$gpus" "$procs_json" "$ollama_ps" "$vpc_up" "$ollama_up" "$resource_guard")

  echo "$line" >> "$JSONL"
  echo "$line" > "$SNAP.tmp" && mv "$SNAP.tmp" "$SNAP"
}

if [[ "${1:-}" == "--once" ]]; then
  sample
  exit 0
fi

echo "vitals-monitor: interval=${INTERVAL}s jsonl=$JSONL snap=$SNAP"
while true; do
  sample
  sleep "$INTERVAL"
done
