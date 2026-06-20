# Deliberation Preflight — ohlcv-reader-redirection

**Verdict:** `approve_for_task_graph`

## Summary

The ohlcv canonical-table migration is feasible but must be split into explicit, validated phases. The biggest risk is redirecting L3 readers before the canonical table is validated and a compatibility view exists. Reader redirection and live-trading timing require Claude/human oversight.

## Top blockers

None. (Original plan had one blocker-level reader-redirection risk that is resolved by explicit phase ordering.)

## Top major risks

1. **L3 reader redirection before canonical table validation** (RISK-002)
2. **Missing backwards-compatible reader strategy** (RISK-003)
3. **Live-trading regime feature timing risk** (RISK-005)
4. **Reader redirection too ambiguous for Codex alone** (RISK-007)

## Contradictions between reviewers

None.

## Task-graph constraints

- T-001 Create canonical ohlcv table must complete before backfill.
- T-002 Backfill canonical table must be idempotent and verified with row-count parity.
- T-003 Compatibility view must exist before any reader redirection task.
- T-004 Writer cutover to canonical table must complete before reader redirection.
- T-005 Redirect L3 readers must depend on validation of canonical table and compatibility view.
- T-005 must be implementation_agent `claude` or `human`.
- T-006 Integration verification must run after all other tasks.

## Dispatch decision

- **Codex-safe:** DDL, backfill, compatibility view, writer cutover, integration tests.
- **Claude-preferred:** Reader redirection orchestration.
- **Human-required:** Live-trading timing approval.

## What must be verified before merge

- Row-count parity between old table, canonical table, and compatibility view.
- Reader query result parity test.
- Regime feature output parity before/after redirection.
- IAM role definition for the backfill job.
