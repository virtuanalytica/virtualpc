# 🧠 Hardware-Adaptive Inference Throughput Control

**Scope:** Feature documentation for VirtualPC's Inference Throughput Governor  
**Audience:** Agents, DevOps, hardware planning  
**Status:** Production (Fase 6 E2E verified)

## What Is It?

A dynamic admission control system that prevents model starvation on lightweight hosts and maximizes throughput on workstations/GPUs. It automatically:
- **Detects** your hardware (CPU cores, RAM, GPU count)
- **Classifies** as light-desktop, cpu-workstation, or gpu-workstation
- **Limits** concurrent model execution to sustainable t/s (tokens/second)
- **Adjusts** Ollama's thread count and keep-alive per tier
- **Learns** measured t/s via EMA to refine future plans

## Why?

Without it: multiple agents starve each other on light hardware → high latency, dropped requests.

With it: predictable tail latency + fair admission + automatic GPU hotplug recovery.

## Quick Start

1. **See current plan:**
   ```bash
   curl http://localhost:3100/api/inference/compute-plan | jq .
   ```

2. **Adjust settings:**
   ```bash
   curl -X PUT http://localhost:3100/api/inference/settings \
     -H "Content-Type: application/json" \
     -d '{"usageMode":"light","activeAgents":["Fill","Kai","Zip","Mira","Luna"]}'
   ```

3. **Force GPU re-detect:**
   ```bash
   curl -X POST http://localhost:3100/api/inference/replan
   ```

4. **Open UI:** http://localhost:3100/inference-settings.html

## Key Files

| File | Role |
|------|------|
| `throughput-governor.ts` | Core logic: probing, tier classification, slot acquisition, EMA calibration |
| `ollama-client.ts` | Dynamic thread tuning + per-request keep-alive |
| `inference-routes.ts` | API: `/api/inference/compute-plan`, `/api/inference/settings`, etc. |
| `inference-settings.html` | Options UI: tier selector, agent roster, live plan display |
| `dashboard.html` | Status chip: tier + streams at a glance |
| `ollama-tuned-start.sh` | Ollama launch script with dynamic concurrency limits |

## Tiers

| Tier | CPU | RAM | Max Streams | Model Defaults | Thread Limit |
|------|-----|-----|-------------|----------------|--------------|
| light-desktop | 0–16 | <128GB | 1 | 3B / 3B / 3B / 8B | 8 |
| cpu-workstation | 16–96 | 128–768GB | 2–4 | 3B / 8B / 7B / 8B | 16 |
| gpu-workstation | any + GPUs | ≥256GB | 4–8 | 3B / 8B / 32B / 8B | 16 |

## Provenance

**Virtualpc-native:** Governor, Ollama tweaks, routes, UI, startup script.  
**Via bridge (upstream read-only):** ClaudeClaw pattern in `claudeclaw-core.ts:gatedInfer()`.

## Testing

All 2091 unit tests pass. E2E verified (Fase 6):
- Endpoint: GET /api/inference/compute-plan responds with valid plan
- Validation: PUT rejects <5 agents with HTTP 400
- Dashboard: chip polls and displays tier + streams
- Persistence: settings and calibration survive restarts

## Further Reading

- `docs/INFERENCE-THROUGHPUT.md` — Full reference (architecture, API, tuning guide)
- `docs/CLAUDECLAW_INTEGRATION.md` — How ClaudeClaw uses the governor
