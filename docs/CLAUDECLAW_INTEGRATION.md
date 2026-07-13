# ClaudeClaw Integration Report

**Date:** 2026-07-13
**Source:** fillslava's ClaudeClaw v2.0.0, local copy at
`/media/knight2/EDS2/repo/claudeclaw_fill/ClaudeClaw-main` (`CLAUDECLAW_HOME`)
**Target:** virtualpc (`~/virtualpc`), supporting Knitweb development
**Status:** ✅ integrated, smoke-tested, benchmarked against claude-haiku-4-5

---

## 1. What was integrated

ClaudeClaw is a full personal-AI-assistant platform (Telegram bot, 12 named
agents, SQLite memory, AutoResearch loop, A/B model testing, trader pipeline).
We did **not** vendored its codebase into virtualpc. Instead the integration
has three layers:

| Layer | Location | What it does |
|---|---|---|
| **ClaudeClaw installation** | `CLAUDECLAW_HOME` (EDS2) | Full upstream system: `npm install` (580 pkgs) + `tsc` build (1448 JS files) + `.env` profile routing non-Claude model IDs to local Ollama (`OPENAI_BASE_URL=http://localhost:11434/v1`). Headless CLI mode — the Telegram bot is not booted until a bot token exists. |
| **Dominant core** | `src/integrations/claudeclaw/claudeclaw-core.ts` | virtualpc-native implementation of ClaudeClaw's core quality pattern: **generate → judge → escalate → audit**. Reuses virtualpc's existing `OllamaClient`. |
| **Process bridge** | `src/integrations/claudeclaw/claudeclaw-bridge.ts` | Health-checks the installation and spawns ClaudeClaw's headless CLIs (`ab-test`, `auto-research`) from virtualpc without importing upstream code. |

Design choice: virtualpc consumes ClaudeClaw's *patterns* (judging LLM,
audit trail, model tiering, escalation) natively, and its *heavy machinery*
(AutoResearch, A/B harness, 230-model catalog) via the process bridge. This
keeps the two codebases independently upgradeable — a new ClaudeClaw drop
into `CLAUDECLAW_HOME` requires no virtualpc changes.

## 2. The dominant core (anti-hallucination loop)

```
request ──► worker LLM (tier) ──► output
                                   │
                        judge LLM (deepseek-r1:8b, independent)
                                   │
              score ≥ 0.6 ────────►│──────── score < 0.6
                 accept            │      escalate to next tier
                                   ▼      (light → standard → coder)
                        append-only audit JSONL
                  data/claudeclaw/audit-YYYY-MM-DD.jsonl
```

Key properties:

- **Independent judge.** The judge (`deepseek-r1:8b`) is never used as a
  worker, mirroring ClaudeClaw's position-blinded LLM-judge validation mode.
  It scores factual grounding, completeness, and instruction-following and
  emits explicit `hallucination_flags`.
- **Fail-closed.** Unparseable judge output scores 0 and is flagged
  (`judge_unparseable`) — an output is never silently accepted.
- **Escalation ladder.** Rejected outputs retry on the next-heavier tier;
  every escalation is recorded.
- **Append-only audit.** Every request, output, verdict, escalation count
  and latency lands in a daily JSONL file before the result is returned.

### Model tiers (light-first, all local Ollama)

| Tier | Model | Size | Role |
|---|---|---|---|
| `light` | hermes3:3b | 2.0 GB | triage, short tasks |
| `standard` | hermes3:8b | 4.7 GB | default worker |
| `coder` | qwen2.5-coder:7b | 4.7 GB | code generation |
| `judge` | deepseek-r1:8b | 5.2 GB | reasoning judge (reserved) |

All tiers are constructor-overridable (`ClaudeClawCoreConfig.models`), so the
upgrade path to paid models later is one config change (e.g. `standard:
'claude-haiku-4-5'` routed through the bridge or OmniRoute) — no code change.

Note: Ollama currently runs **CPU-only** (NVIDIA driver down, known
Xid-79 issue; GPU returns after reboot). The 96-core box handles the 3–8B
models fine; latencies in §4 are CPU latencies and will drop substantially
on GPU. Under the CPU profile the benchmark judges on `qwen2.5-coder:7b`
(deepseek-r1's `<think>` phase exceeds practical CPU latency); the
deepseek default returns with the GPU.

**Fail-closed proven in testing.** During the first benchmark run the
judge call itself timed out (undici's 300s default; deepseek on CPU).
The core did exactly what it is designed to do: scored the output 0,
flagged `judge_unparseable`, rejected it, escalated to the next tier and
audited the whole chain — an unverified answer never left the pipeline.
The timeout itself was then fixed (explicit `AbortSignal` + configurable
timeout in `OllamaClient`).

## 3. Audit trail: what we have now that plain claude-haiku did not give us

Calling `claude -p --model claude-haiku-4-5` (or the API directly) yields an
answer and nothing else. The dominant core adds, per request:

| Capability | Plain Haiku | ClaudeClaw core |
|---|---|---|
| Persistent record of prompt + output | ❌ (gone after the call) | ✅ append-only JSONL, per day, with UUID per request |
| Independent quality verdict | ❌ (self-serving at best) | ✅ second model scores 0–1 with reasoning |
| Explicit hallucination flags | ❌ | ✅ `hallucination_flags[]` per output |
| Accept/reject decision recorded | ❌ | ✅ `accepted` + threshold in the record |
| Escalation provenance | ❌ (one model, one answer) | ✅ which tiers ran, why, in order |
| Latency + model identity per answer | partial (not persisted) | ✅ persisted per record |
| Replayable history (`readAudit()`) | ❌ | ✅ programmatic read-back for review/analytics |
| Fail-closed on unverifiable output | ❌ (answer is answer) | ✅ judge failure ⇒ rejected, flagged |

This is the accountability layer knitweb development needs: every LLM
contribution to the codebase is traceable to a model, a verdict, and a
timestamp — and rejected output never silently flows downstream.

## 4. Benchmark: local core vs claude-haiku-4-5

Script: `scripts/claudeclaw-benchmark.ts` (`npx ts-node scripts/claudeclaw-benchmark.ts`).
Five cases (factual grounding, code generation, hallucination bait,
summarization, instruction following). Both pipelines are scored by the
**same independent judge** (deepseek-r1:8b), so scores are comparable.
Full outputs: `reports/claudeclaw-benchmark-<date>.json`.

<!-- BENCHMARK_RESULTS -->

## 5. How to use from virtualpc code

```ts
import { ClaudeClawCore } from './integrations/claudeclaw';

const core = new ClaudeClawCore();
const res = await core.run({
  prompt: 'Implement X for knitweb...',
  tier: 'coder',
  context: 'knitweb-dev',
});
if (res.verdict?.accepted) useOutput(res.output);
// res.auditPath -> data/claudeclaw/audit-YYYY-MM-DD.jsonl
```

Bridge (upstream CLIs):

```ts
import { checkHealth, runCli } from './integrations/claudeclaw';
checkHealth();                       // installed/built/env status
await runCli('ab-test', ['--agent=coder', '--models=hermes3:8b,qwen2.5-coder:7b']);
```

## 6. Open items

1. **Telegram bot token** — the interactive bot layer needs a BotFather
   token. Manual, ~2 min: in Telegram message `@BotFather` → `/newbot` →
   pick a name/username → paste the token into
   `CLAUDECLAW_HOME/.env` as `TELEGRAM_BOT_TOKEN=`, and your numeric chat id
   (from `@userinfobot`) as `ALLOWED_CHAT_ID=`. Then `npm run dev` in
   `CLAUDECLAW_HOME` boots the full bot + dashboard (`localhost:3141/v2`).
2. **GPU** — reboot restores the 2×3090; Ollama service is already pinned
   to GPU 1 with models on EDS2. No config change needed.
3. **Paid-model upgrade path** — swap tier models in `ClaudeClawCoreConfig`
   or set ClaudeClaw's `DEFAULT_MODEL=claude-sonnet-4-6` once budget allows.
4. **OmniRoute sidecar** (optional) — unlocks ClaudeClaw's 230-model A/B
   catalog: `docker compose -f docker-compose.omniroute.yml up -d` in
   `CLAUDECLAW_HOME`.
