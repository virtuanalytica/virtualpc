# Doc audit — sprint-20374 completion artifact

Doc audit completed: README and 36 docs/ files were reviewed against current code; nine stale claims were flagged for fix or removal.

- README still advertises a "14-agent roster" and "13 model entries"; `src/agent-registry.ts` now registers 36 agents and `deploy/litellm-config.yaml` lists 20 models.
- `docs/VIRTUALPC-ARCHITECTURE.md` claims "31 personas in 8 kinds" but the kinds table enumerates 7 kinds and the live roster is 36 agents.
- `docs/PRODUCTS.md` repeats stale counts: "35-agent registry" and "13 model entries".
- README links to four root-level docs that no longer exist (`DETAILED_TASK_BRIEFS.md`, `AGENT_ORG_ARCHITECTURE.md`, `CUSTOM_PAPERCLIP_FORK.md`, `AGENT_EXECUTION_SYSTEM.md`).
- `docs/GIT_WORKFLOW.md` points to `/home/knight2/DETAILED_TASK_BRIEFS.md`, which is also missing.
- `docs/DEPLOYMENT.md` status banner reads "MVP Complete and Ready for Production Autonomous Operation" and references `./health-check.sh`; the script lives at `scripts/health-check.sh` and several documented endpoints are not implemented.
- `docs/API-ENDPOINTS.md` advertises 70+ endpoints; many (e.g., `/api/tasks/schedule`, `/api/events/*`, `/api/deployments/*`, `/api/collaboration/*`, `/api/analytics/*`, `/api/backups/*`, `/api/openclaw/*`, `/api/issues/*`) are not registered in `src/`.

**Follow-up:** `API-ENDPOINTS.md` remains the highest-risk stale doc because downstream agents may invoke phantom endpoints; next sprint should either implement the documented routes or trim the doc to match the actual registered surface.
