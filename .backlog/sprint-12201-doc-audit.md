# Sprint 12201 — Doc Audit: What's Stale

**Owner:** Kimi (Long-Context Researcher)  
**Status:** Complete  
**Scope:** `docs/*.md` + root `README.md`, cross-checked against current code.

## Outcome
Audited all markdown documentation and the top-of-repo README, identified claims that no longer match the codebase, and published fix-or-delete recommendations.

## Key Findings

1. **Agent roster count is stale.** README.md describes a "14-agent roster", but `src/agent-registry.ts` now contains 22 production agents (14 core + Governor + Pixel + 5 Hermes coordinators + Athena) plus additional tester personas.
2. **LiteLLM model count is stale.** README.md states the gateway registers "13 models", but `deploy/litellm-config.yaml` currently defines 20 `model_name` entries.
3. **Several docs reference removed or renamed services.** Older deployment and capability pages still mention paths and components that have been superseded by newer modules.

## Recommendations

- Update README.md with current agent and model counts.
- Refresh `docs/AGENT-MODEL-ROSTER.md` to reflect the expanded roster and model list.
- Archive or rewrite stale deployment/capability docs that describe removed services.
- Add a lightweight CI check that warns when README/agent/model counts diverge from source-of-truth files.

## Risk / Follow-up
Without a recurring doc-review trigger tied to registry/config changes, documentation drift will recur within one sprint.

## Resolution (2026-06-22)
Recommendations #1, #2, #4 **APPLIED**:
- README agent count 14→22, model count 13→20 (both locations) — commit `a55ac6d5`
- `scripts/check-doc-counts.sh` drift guard added + wired into `npm run check:docs`
  and `validate-system-files.yml` CI — commit `5c4d9de7`
- Guard passes: source-of-truth = 22 production agents (36 − 14 testers), 20 models (11 local + 9 cloud).
- Remaining: #3 (archive/rewrite stale deployment/capability docs) — not yet done (needs per-doc audit of removed services).
