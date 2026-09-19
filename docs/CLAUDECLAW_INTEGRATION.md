# ClaudeClaw Integration in VirtualPC

## Overview

VirtualPC integrates ClaudeClaw patterns natively via `src/integrations/claudeclaw/` without vendoring upstream code. The upstream ClaudeClaw installation at `/media/knight2/EDS2/repo/claudeclaw_fill/` remains read-only and is consulted for patterns only.

## Architecture Layers

| Layer | Component | Virtualpc-Native | Upstream (claudeclaw_fill) | Notes |
|-------|-----------|------------------|----------------------------|-------|
| **Dominant Core** | `claudeclaw-core.ts` | ✅ Yes | — | Worker + judge + audit; local Ollama tier models (3B/8B/7B/32B) |
| **Inference Metering** | `throughput-governor.ts` | ✅ Yes | — | Admission control; hardware-adaptive concurrency; slot-based; EMA calibration |
| **Inference Gating** | `claudeclaw-core.ts:gatedInfer()` | ✅ Yes | — | Calls `governor.acquireSlot()` before Ollama call; records t/s after |
| **Tier-Aware Models** | `claudeclaw-core.ts:DEFAULT_MODELS` | ✅ Patroon | Upstream unchanged | Light: 3B; Workstation: 8B; GPU: 32B (virtualized per host classification) |
| **Local Inference** | `ollama-client.ts` | ✅ Yes | — | Dynamic thread count (~50% CPU); per-request keep-alive |
| **Cloud Fallback** | `unified-executor.ts` | 🔲 Stubbed | — | Future: route to Anthropic API if Ollama unavailable |
| **Audit Trail** | `claudeclaw-core.ts` | ✅ Yes | — | JSONL append-only; daily rotation; no PII |

## Key Integration Points

### 1. Concurrency Control (Virtualpc-Native)

```typescript
// src/integrations/claudeclaw/claudeclaw-core.ts
private async gatedInfer(req: InferenceRequest): Promise<InferenceResponse> {
  const governor = getGovernor();
  const slot = await governor.acquireSlot(this.ollamaTimeoutMs * 2);
  try {
    const resp = await this.ollama.infer(req);
    // ... record t/s ...
    return resp;
  } finally {
    slot.release();  // frees slot for next inference
  }
}
```

Every inference through ClaudeClaw is metered via the governor. If concurrency is at ceiling, the slot wait will queue or escalate to cloud (future).

### 2. Tier-Aware Model Selection (Virtualpc-Native Patroon)

```typescript
// Upstream: DEFAULT_MODELS is fixed (always 3B/8B/7B/8B)
// Virtualpc: at runtime, based on host tier
const models = tierDefaultModels(getGovernor().getPlan().tier);
// light-desktop:   {light:'hermes3:3b', standard:'hermes3:3b', coder:'qwen2.5-coder:3b', judge:'deepseek-r1:8b'}
// cpu-workstation: {light:'hermes3:3b', standard:'hermes3:8b', coder:'qwen2.5-coder:7b', judge:'deepseek-r1:8b'}
// gpu-workstation: {light:'hermes3:3b', standard:'hermes3:8b', coder:'qwen2.5-coder:32b', judge:'deepseek-r1:8b'}
```

This is a **patroon** (pattern) only — the upstream code structure is preserved; only the tier-aware routing logic is added.

### 3. Hardware Tuning (Virtualpc-Native)

| Component | Virtualpc | Upstream | Purpose |
|-----------|-----------|----------|---------|
| `ollama-client.ts` | Adds `getOptimalThreadCount()` | Hardcoded 16 | Avoids CPU oversubscription on light hosts |
| `ollama-client.ts` | Per-request `keep_alive` field | Fixed global | Light hosts free RAM faster; workstations keep models warm |
| `scripts/ollama-tuned-start.sh` | Dynamic `OLLAMA_NUM_PARALLEL` | Manual tuning | Auto-calibrate based on tier + RAM |

### 4. GPU Hotplug Recovery (Virtualpc-Native)

```typescript
// src/gpu/index.ts (lines 56–65)
if (prev !== state.available || prevGpuCount !== state.gpuCount) {
  try {
    const { getGovernor } = require('../integrations/local-inference/throughput-governor');
    const newPlan = getGovernor().refreshProbe();
    logger.info(`[gpu] replan triggered: ${newPlan.reason}`);
  } catch (e: any) {
    logger.warn(`[gpu] governor replan failed: ${e.message}`);
  }
}
```

When a GPU appears or disappears, the governor re-probes and adjusts `maxConcurrentStreams` automatically.

## Upstream Boundary

**Upstream code location:** `/media/knight2/EDS2/repo/claudeclaw_fill/ClaudeClaw-main`

**Read-only guarantee:** No files in `CLAUDECLAW_HOME` are modified or patched by VirtualPC. If upstream ClaudeClaw is updated, VirtualPC continues to use its own native implementations.

**Pattern borrowing:** VirtualPC's `claudeclaw-core.ts` structure mirrors the dominant-core logic (generate → judge → escalate → audit) but does not import or depend on upstream code.

## Testing & Validation

- **Unit tests:** `tests/unit/throughputGovernor.test.ts` (29 tests, all green)
- **ClaudeClaw core tests:** Verify judge logic, audit trail, tier escalation
- **E2E tests:** API smoke (Fase 6), dashboard chip polling, settings persistence
- **Integration:** ClaudeClaw → governor slot acquisition → Ollama call → record t/s

## Provenance Markers

When committing changes to ClaudeClaw or inference layers, include in the commit message:

```
Virtualpc-native: [layer name] — [brief change]
  Upstream claudeclaw_fill unaffected.
```

Example:
```
Virtualpc-native: claudeclaw-core gatedInfer — add response.tokens_per_sec calculation
  Upstream claudeclaw_fill unaffected.
```

## Future Work

- **Cloud escalation:** When local queue > 2 and t/s < floor, route to Anthropic API
- **Cross-host clustering:** Discover peer agents via Knitweb P2P and load-balance inference
- **Heterogeneous models:** Tier-aware routing to specialized models (e.g., coder-specific on GPU)

## References

- `docs/INFERENCE-THROUGHPUT.md` — Full governor architecture and API
- `docs/kami/INFERENCE-THROUGHPUT-KAMI.md` — Quick reference
- `src/integrations/claudeclaw/claudeclaw-core.ts` — Implementation
- `src/integrations/local-inference/throughput-governor.ts` — Governor logic
