# Task-Graph Audit — ohlcv-reader-redirection

**Verdict:** `dispatch_ok`

## Blocked tasks

None.

## Unsafe parallel groups

None. All tasks are sequential because ordering matters (table → backfill/view → writer → reader → integration).

## Missing owned files / tests

None. Tests are included where verification commands mention them.

## Weak verification

None.

## Bad agent routes

None. T-005 (reader redirection) is correctly routed to `claude`.

## Dispatch order

1. T-001 Create canonical ohlcv table
2. T-002 Backfill canonical ohlcv table
3. T-003 Create compatibility view
4. T-004 Update ingestion writer
5. T-005 Redirect L3 readers
6. T-006 Integration verification

## Agent routing

- **Codex-safe:** T-001, T-002, T-003, T-004, T-006
- **Claude-preferred:** T-005
- **Human-required:** none

## Note

If T-005 were moved before T-003 or T-004, or if any reader-redirection task were placed in a parallel group with schema migration, this audit would return `revise_tasks`.
