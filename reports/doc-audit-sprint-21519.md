# Doc Audit: What's Stale — Sprint 21519

**Scope:** `README.md` + all `.md` files under `docs/`.  
**Goal:** Flag claims no longer supported by the current codebase.

## Outcome
Audited 39 markdown files. Found multiple stale claims concentrated in `README.md` and `docs/DEPLOYMENT.md`, mostly around LiteLLM model counts, task statuses, and architecture readiness.

## Verified stale claims

| # | Location | Stale claim | Current reality | Recommendation |
|---|----------|-------------|-----------------|----------------|
| 1 | `README.md:12,76` | LiteLLM gateway routes **13 models** (5 local + 8 cloud) | `deploy/litellm-config.yaml` contains **20 `model_name` entries**: 11 local (LM Studio/Ollama) + 9 cloud | Update count; list representative entries |
| 2 | `README.md:108-122` | Implementation Tasks table lists Tasks #16-#25 as In Progress / Pending | `src/integrations/lightrag/` and `src/integrations/kafka/` already contain working modules; task statuses are out of sync with code | Refresh task table from current `src/` state |
| 3 | `README.md:169-179` | Architecture feature table marks LightRAG, Kafka, Cache, Model Router, Nginx, Containerized as tied to pending tasks | Directories and configs for several of these exist; readiness is overstated as "not started" | Re-evaluate each feature against `src/integrations/` and `deploy/` |
| 4 | `docs/DEPLOYMENT.md:323-325` | Checklist still shows Task #19, #23, #25 unchecked | Cannot verify completion from docs alone; needs cross-check with `src/` and `tests/` | Audit task completion before next doc refresh |
| 5 | `docs/GIT_WORKFLOW.md:10-12,37` | Branch examples still tied to Tasks #16-#25 | Fine as historical examples, but may mislead if tasks are closed | Add note that examples are illustrative |

## Files in good shape
- `docs/CODING-STANDARDS.md` — current, no stale references.
- `docs/ALEXANDER-PRINCIPLES.md`, `docs/CLEOPATRA-AUTHORITY.md`, `docs/MONEYGOD-AUTHORITY.md` — governance docs align with `.governance/`.
- `docs/SECURITY_TOOLKIT.md` — references map to existing `src/security/` modules.

## Fix-or-delete recommendations
1. **Fix `README.md`** — update LiteLLM model count (20), local/cloud split (11/9), and refresh task/feature status table.
2. **Fix `docs/DEPLOYMENT.md`** — remove or verify unchecked task list; align with actual deploy configs.
3. **Keep `docs/GIT_WORKFLOW.md`** — add illustrative-note disclaimer.
4. **Delete or archive** `docs/WEBGAME_REALITY_AUDIT_2026-05-03.md` if the Roblox webgame scope has been retired; otherwise update date and findings.

## Risk / Follow-up
The README is the primary onboarding surface; stale task and model counts create false expectations for new contributors. Next sprint should do a **code-grounded task-status reconciliation** (map every README/DEPLOYMENT task claim to `src/` and `tests/`) before editing prose, to avoid flipping claims from stale to wrong.

---
*Published: 2026-06-18 | Sprint: 21519 | Auditor: Kimi (Long-Context Researcher)*
