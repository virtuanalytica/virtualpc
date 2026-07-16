# Inference Throughput Governor

## Overview

The **Throughput Governor** is a hardware-adaptive concurrency control mechanism that prevents model starvation on lightweight hosts while maximizing utilization on workstations and GPU boxes. It meters concurrent model execution based on measured tokens/second (t/s) to keep all agents responsive.

## Problem

VirtualPC was originally sized for 2×3090 GPUs with unlimited concurrent streams. On a light desktop or CPU-only workstation:
- Multiple agents requesting inference simultaneously starves each other
- Latency becomes unpredictable
- Smaller models can't complete before being kicked out of memory

## Solution

The governor:
1. **Probes the host** (CPU cores, RAM, GPU count)
2. **Classifies into a tier** (light-desktop, cpu-workstation, gpu-workstation)
3. **Estimates sustainable concurrency** based on measured t/s and RAM
4. **Dynamically tunes** Ollama's thread count and keep-alive based on tier
5. **Admits, downgrades, queues, or clouds** each inference request

## Architecture

### Components

- **`src/integrations/local-inference/throughput-governor.ts`** (334 lines)
  - Singleton governor with host probing, tier classification, settings management
  - EMA-based calibration of measured t/s per model
  - Slot acquisition (metering), active stream tracking
  - Persistence to `data/inference-settings.json` and `data/inference-calibration.json`

- **`src/integrations/local-inference/ollama-client.ts`** (310 lines)
  - Dynamic thread count: `max(4, min(floor(cores/2), 16))` — targets ~50% CPU
  - Per-request keep-alive: `2m` on light-desktop (fast RAM free), `30m` on workstation

- **`src/integrations/local-inference/inference-routes.ts`** (75 lines)
  - GET `/api/inference/compute-plan`: live capacity + queue depth
  - GET `/api/inference/settings`: current settings + selectable agents
  - PUT `/api/inference/settings`: update (with roster ≥5 agents gate)
  - POST `/api/inference/replan`: force GPU hotplug re-probe

- **`src/integrations/claudeclaw/claudeclaw-core.ts`** (318 lines)
  - `gatedInfer()`: acquires slot before Ollama call, records t/s after
  - Tier-aware model selection: light-desktop prefers 3B, workstation uses full 32B
  - Virtualpc-native patroon (upstream claudeclaw_fill unmodified)

- **`public/inference-settings.html`** (271 lines)
  - Options page: usage-bias chips (light/balanced/heavy/custom)
  - Agent selection with min-5 diversity enforcement
  - Real-time compute-plan polling + calibration table

- **`public/dashboard.html`** (nav + chip)
  - 🧠 Inference link → `/inference-settings.html`
  - Status chip: tier · max streams, polls every 10s

- **`scripts/ollama-tuned-start.sh`** (60 lines)
  - Calculates `OLLAMA_MAX_LOADED_MODELS` and `OLLAMA_NUM_PARALLEL` dynamically
  - Sets `OLLAMA_KEEP_ALIVE=30m`

### Data Flow

```
probeHost()
  ├─ CPU cores via os.cpus()
  ├─ RAM via os.totalmem()
  └─ GPU count via nvidia-smi
       ↓
classifyHostTier() → {light-desktop, cpu-workstation, gpu-workstation}
       ↓
estimateComputePlan()
  ├─ baseStreams from tier + RAM
  ├─ usageFactor from settings
  ├─ referenceT/s from EMA calibration
  └─ → ComputePlan {maxConcurrentStreams, minTokensPerSec, reason}
       ↓
admission control (acquireSlot)
  ├─ if active ≥ max → queue or cloud
  ├─ else → run locally
  └─ measure t/s → update EMA
```

## Tiers & Defaults

### Light-Desktop (0–16 cores, <128GB RAM)
- **Max streams**: 1
- **Min t/s floor**: 5 t/s
- **Model defaults**: 3B (light), 3B (standard), 3B (coder), 8B (judge)
- **Keep-alive**: 2m (RAM pressure)
- **Thread count**: `max(4, cores/2)` (capped 8)

### CPU-Workstation (16–96 cores, 128–768GB RAM)
- **Max streams**: 2–4 (based on RAM)
- **Min t/s floor**: 5 t/s
- **Model defaults**: 3B, 8B, 7B (coder), 8B (judge)
- **Keep-alive**: 30m
- **Thread count**: `max(4, cores/2)` (capped 16)

### GPU-Workstation (1–4 GPUs, ≥256GB RAM)
- **Max streams**: 4–8 (GPU offload capacity)
- **Min t/s floor**: 15 t/s (GPU baseline)
- **Model defaults**: 3B, 8B, 32B (coder), 8B (judge)
- **Keep-alive**: 30m
- **Thread count**: 16 (full utilization)

## API Reference

### GET /api/inference/compute-plan

Returns the current hardware tier, estimated concurrency, and live queue state.

**Response:**
```json
{
  "success": true,
  "plan": {
    "tier": "cpu-workstation",
    "probe": {
      "gpuCount": 0,
      "cpuCores": 96,
      "totalRamGB": 676
    },
    "baseStreams": 1,
    "usageFactor": 1,
    "maxConcurrentStreams": 1,
    "minTokensPerSec": 5,
    "maxModelGB": 405.6,
    "reason": "cpu-workstation: solo≈10.2 t/s → 1 stream(s) at ≥5 t/s, RAM caps 77, factor 1 → 1"
  },
  "calibration_tps": {
    "hermes3:8b": 10.2,
    "__reference__": 10.2
  },
  "active_streams": 0,
  "queue_depth": 0
}
```

### GET /api/inference/settings

Returns current settings + selectable roster.

**Response:**
```json
{
  "success": true,
  "settings": {
    "usageMode": "balanced",
    "customFactor": 1,
    "minTokensPerSec": 5,
    "activeAgents": [],
    "maxConcurrentOverride": null,
    "keepAlive": "30m"
  },
  "min_active_agents": 5,
  "usage_modes": ["light", "balanced", "heavy", "custom"],
  "agents": [
    {
      "name": "Fill",
      "role": "CEO · Scrum-of-Scrums chair",
      "avatar": "👑",
      "kind": "core",
      "active": true
    },
    // ... 39 more agents
  ]
}
```

### PUT /api/inference/settings

Update inference settings. All fields optional.

**Request:**
```json
{
  "usageMode": "light",
  "customFactor": 0.5,
  "minTokensPerSec": 3,
  "activeAgents": ["Fill", "Kai", "Zip", "Mira", "Luna"],
  "maxConcurrentOverride": 2
}
```

**Validation:**
- `usageMode` must be one of `["light", "balanced", "heavy", "custom"]`
- `minTokensPerSec` must be in (0, 200]
- `activeAgents` if specified, must have ≥5 agents (returns HTTP 400 if not)
- All agents must be known (from AGENT_META)

**Response:** Updated settings + new plan (same as GET /api/inference/compute-plan).

### POST /api/inference/replan

Force re-probe of the host (e.g., after GPU hotplug). Automatically called on GPU state change.

**Response:** Updated plan.

## Tuning Guide

### For Light-Desktop Users
1. Open `/inference-settings.html`
2. Select "Light" usage mode
3. Choose 5 preferred agents (diversity floor for resilience)
4. Submit
5. Watch the Inference dashboard chip: should show `light-desktop · 1 streams`

### For CPU-Workstation Users
1. Open `/inference-settings.html`
2. Select "Balanced" (default) or "Heavy" if RAM permits
3. Keep all agents active (more diversity = better fault tolerance)
4. Submit
5. Expected: `cpu-workstation · 1–4 streams` depending on RAM

### For GPU Users
1. Ensure both 3090s are detected: `nvidia-smi -L | wc -l` should show 2
2. Open `/inference-settings.html`
3. Select "Heavy" or "Custom"
4. Keep all agents active
5. Expected: `gpu-workstation · 4–8 streams`

### Custom Tuning
- If `t/s` measurements drop below the floor, the governor will queue or cloud excess requests
- Increase `customFactor` (>1) to boost `maxConcurrentStreams` but risk CPU saturation
- Decrease `customFactor` (<1) for conservative behavior on shared machines

## Provenance

### Virtualpc-Native
- `src/integrations/local-inference/throughput-governor.ts` — entire module
- `src/integrations/local-inference/ollama-client.ts` — dynamic thread count + keep-alive
- `src/integrations/local-inference/inference-routes.ts` — API endpoints
- `src/gpu/index.ts` (lines 56–65) — GPU hotplug → refreshProbe call
- `public/inference-settings.html` — settings UI
- `public/dashboard.html` — nav link + status chip
- `scripts/ollama-tuned-start.sh` — environment tuning

### Via Bridge Pattern (Upstream Untouched)
- `src/integrations/claudeclaw/claudeclaw-core.ts` (line 122–134) — `gatedInfer()` method
  - Calls `getGovernor().acquireSlot()` to meter concurrency
  - Tier-aware model selection (patroon only; upstream DefaultModels unchanged)
  - **Upstream `/media/knight2/EDS2/repo/claudeclaw_fill/` remains read-only**

### Tests
- `tests/unit/throughputGovernor.test.ts` — 29 unit tests (host classification, admission, roster validation, EMA)
- All tests pass; E2E verified via API smoke tests (Fase 6)

## Performance Expectations

### Baseline (single inference)
- **Light-Desktop (4c)**: ~2–5 t/s (Hermes3:3b)
- **Workstation (96c)**: ~10 t/s (Hermes3:8b)
- **GPU (2×3090)**: ~30–50 t/s (Qwen2.5:32b)

### Under Concurrency
- Throughput remains stable (latency rises predictably, not catastrophic)
- At `maxConcurrentStreams`, new requests queue until a slot frees
- Measuring t/s feeds EMA → future plans adjust automatically

## Known Limits

1. **No horizontal scaling** — single machine only; cloud fallback is stubbed (future work)
2. **Ollama pool size** — capped by `OLLAMA_MAX_LOADED_MODELS`; larger models evict smaller ones
3. **Keep-alive timer** — Ollama's default 5m can be overridden per request; 30m assumes idle time between requests
4. **GPU hotplug** — detected every 3h (GPU check interval); manual `POST /api/inference/replan` for immediate re-detection

## Integration Points

- **ClaudeClaw**: `gatedInfer()` admits every inference through the governor
- **Dashboard**: status chip shows tier and active streams in real-time
- **Ollama**: startup via `scripts/ollama-tuned-start.sh` configures concurrency limits
- **Agents**: higher-tier agents (Kai, Athena) skip judge for fast paths when t/s is good

## Debugging

Enable debug logging:
```bash
DEBUG=inference:* npm start
```

Check live state:
```bash
curl http://localhost:3100/api/inference/compute-plan | jq .
```

View persisted settings:
```bash
cat data/inference-settings.json
cat data/inference-calibration.json
```

Force GPU re-probe:
```bash
curl -X POST http://localhost:3100/api/inference/replan | jq .
```
