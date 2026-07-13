# Doc audit — sprint-19318 completion artifact

Doc audit completed: README and 36 docs/ files were reviewed against current code; five stale claims were flagged for fix or removal.

- README still advertises a "14-agent roster" and "13 model entries"; `src/agent-registry.ts` now registers 42 agents and `deploy/litellm-config.yaml` lists 20 models — update both counts.
- `docs/VIRTUALPC-ARCHITECTURE.md` claims "31 personas in 8 kinds" but the kinds table only enumerates 7 kinds — correct the count.
- `docs/DEPLOYMENT.md` references `./health-check.sh` for service verification; the script lives at `scripts/health-check.sh` — fix the path.
- `docs/API-ENDPOINTS.md` advertises 70+ endpoints across 73 headings; the live route surface in `src/` is a much smaller subset — reconcile or mark the doc as draft.
- `docs/DEPLOYMENT.md` status banner reads "MVP Complete and Ready for Production Autonomous Operation"; given the unresolved script-path and endpoint gaps, downgrade to "MVP in progress" until verified.

**Follow-up:** `API-ENDPOINTS.md` remains the highest-risk stale doc because downstream agents may invoke phantom endpoints; next sprint should either implement the documented routes or trim the doc to match the actual registered surface.
