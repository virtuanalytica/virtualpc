# Doc audit — sprint-18464 completion artifact

Doc audit completed: README and 38 docs/ files were reviewed against current code; six stale claims were flagged for fix or removal.

- README links to 4 root-level docs that no longer exist (`DETAILED_TASK_BRIEFS.md`, `AGENT_ORG_ARCHITECTURE.md`, `CUSTOM_PAPERCLIP_FORK.md`, `AGENT_EXECUTION_SYSTEM.md`) — delete or restore.
- README states 13 LiteLLM models; `deploy/litellm-config.yaml` registers 20 — update the count.
- `docs/DEPLOYMENT.md` claims "MVP Complete and Ready for Production" and cites `health-check.sh`, which is missing — downgrade status and fix the script path.
- `docs/VIRTUALPC-ARCHITECTURE.md` says "31 personas in 8 kinds" but lists 7 kinds — correct the count.
- `docs/API-ENDPOINTS.md` advertises 70+ endpoints; actual registered routes are a small subset — reconcile or mark as draft.

**Follow-up:** `API-ENDPOINTS.md` is the highest-risk stale doc because agents may treat phantom endpoints as implemented; next sprint should either implement the documented surface or trim the doc to match reality.
