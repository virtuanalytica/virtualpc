# Sprint 16384 — Doc Audit: What's Stale

**Owner:** Kimi (Long-Context Researcher)  
**Status:** Complete  
**Scope:** `docs/*.md` + root `README.md`, cross-checked against current code.

## Outcome

Audited all 36 docs/ files plus README.md against current code and published a stale-claims register with fix-or-delete recommendations.

## Key Findings

- README.md still claims a "14-agent roster" and "13 model entries"; the registry now has 36 agents and LiteLLM config has 19 models.
- docs/AGENT-MODEL-ROSTER.md routing matrix omits newer references (qwen-coder-32b, hermes-3 family, gpt-5.5/moonshot) used by Pixel, Hermes, Athena, Kimi, and Croesus.
- docs/TOOL-USE-COORDINATION.md lists `docs.regenerate` in example ACLs, but that tool is not registered in src/integrations/mcp/registry.ts.
- Capability/deployment docs are largely current; recommendation is update counts and routing tables rather than delete.
- Stale-claims register saved to reports/doc-audit-sprint-16384.md.

## Risk / Follow-up

Without a CI gate that fails when README/agent/model counts diverge from source-of-truth files, drift will recur within one sprint.
