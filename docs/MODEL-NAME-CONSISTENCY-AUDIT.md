# Model-Name Consistency Audit

**Date:** 2026-06-22 · **Scope:** cross-file model-name drift (the "Cross-file
inconsistency hunt" high-priority item, model-name dimension).
**Status:** findings + single-source-of-truth proposal. No code changed (cost/tier
values for paid cloud models can't be set without real pricing — flagged below).

## Why this matters

`token-tracker.recordRealEvent()` costs/tiers every real LLM call via
`MODEL_COSTS[input.model]`, falling back to **`{ prompt: 0, completion: 0, tier: 1 }`**
when the model name is unknown. So any model name that doesn't exactly match a
`MODEL_COSTS` key is silently recorded as **tier-1, $0** — i.e. a paid cloud call
shows up as free local usage on the cost dashboard. This is the same class of bug
as the documented "QWEN tokens not updated" regression.

## The four naming schemes (they disagree)

| Concept | `src/agent-registry.ts` (`AgentMeta.models[]`) | `src/token-tracker.ts` (`MODEL_COSTS`) | `deploy/litellm-config.yaml` |
|---|---|---|---|
| DeepSeek-R1 | `deepseek-r1` | `deepseek-r1-8b` | `deepseek-r1-local`, `deepseek-r1-14b` |
| Moonshot/Kimi | `kimi`, `moonshot` | `kimi-k2.6` | `kimi` |
| Hermes-3 | `hermes-3` | *(missing)* | `hermes-3-8b/3b/70b` |
| Qwen-coder | `qwen-coder-32b` | *(missing)* | `qwen-coder-14b/32b` |
| GPT | `gpt-5.5` | *(missing)* | `gpt-4o-mini` *(no gpt-5.5!)* |

### Concrete findings
1. **6 models referenced by agents have no `MODEL_COSTS` entry** — `deepseek-r1`,
   `gpt-5.5`, `hermes-3`, `kimi`, `moonshot`, `qwen-coder-32b` → mis-tiered to free.
2. **`gpt-5.5` is a routing dead-end** — agents list it, but the LiteLLM gateway
   serves `gpt-4o-mini`, not `gpt-5.5`. Either add the model to the gateway or
   stop routing agents to it.
3. **`moonshot` has no match anywhere** — the Moonshot model is served as `kimi`.
   `moonshot` in agent-registry resolves to nothing.
4. **Three different names for one DeepSeek-R1 family** across the three files.

> Note on runtime exactness: the actual string reaching `recordRealEvent` depends
> on `lmstudio.resolveModel()` / `AGENT_MODEL_ROUTES` / the Kimi+Claude CLI tags
> (`kimi-k2.6`, `CLAUDE_MODEL_TAG`) / the `ollama/<id>` prefix. So the *table above
> is the authored-config drift*; a follow-up should log the exact `input.model`
> values seen by `recordRealEvent` over a day to catch any additional runtime
> mismatches (the cheapest way to find the real misses).

## Proposal — one canonical model registry

Introduce `src/models.ts` exporting a single `MODELS` map keyed by **canonical id**,
each entry carrying `{ aliases: string[], tier, promptCost, completionCost, litellmName, lmstudioHint }`.
Then:
- `agent-registry` references canonical ids only.
- `token-tracker.MODEL_COSTS` is *derived* from `MODELS` (incl. aliases → same cost),
  so an unknown name is a build-time/lint error, not a silent $0.
- `deploy/litellm-config.yaml` is generated from `MODELS[*].litellmName` (or a
  CI check asserts every canonical model has a gateway entry).
- Add a `check:models` guard (like `scripts/check-doc-counts.sh`) that fails when
  an agent references a model with no canonical entry / no gateway route.

This collapses four hand-maintained lists into one source of truth and makes the
mis-cost + routing-dead-end classes impossible to reintroduce.

## Safe immediate step (no guessed pricing)
For the **local/flat-fee** misses (`deepseek-r1`, `kimi`, `moonshot`, `hermes-3`,
`qwen-coder-32b`) adding tier-1 `$0` aliases to `MODEL_COSTS` is correct and
non-speculative (local models are genuinely free; matches existing `*-8b`/`k2.6`
entries). The **paid** miss (`gpt-5.5`) must NOT be added with a guessed price —
resolve finding #2 first (add it to the gateway with real pricing, or drop it).
