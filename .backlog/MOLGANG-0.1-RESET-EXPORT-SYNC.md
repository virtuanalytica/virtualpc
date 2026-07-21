# MOLGANG 0.1 — VirtualPC reset, export en GitHub-sync

**Status:** ACTIVE · baseline reset uitgevoerd op 2026-07-21

## Baseline

- Version: `0.1`
- Completed tasks: `0`
- Daily updates: `0`
- Qwen tokens used: `0`
- Uptime: process counter from the latest VirtualPC start
- Historical task state: archived under `/media/knight2/EDS2/virtualpc-state/archive/`

## Delivered

- `GET /api/export/backlog?format=json`
- `GET /api/export/backlog?format=csv`
- `GET /api/export/backlog?format=markdown`
- Export includes current game stats, visible backlog, last 1000 work-log entries and token summary.
- GitHub `virtuanalytica/virtualpc` master synchronized with local source.
- Hive Mind, bot utility and Agent Notes Vault features merged from GitHub.
- Broken upstream orchestrator/OpenClaw compatibility restored so TypeScript builds.

## Parity audit 2026-07-21

- Local `HEAD`: `ba0f9fbb`; `knitweb/master`: `ba0f9fbb`.
- No open GitHub PRs remain.
- Merged PRs 25, 26 and 27 are present locally and live on port 3100.
- Closed/unmerged branches such as `feat/virtuanalytica-demo` remain review-only;
  they are not copied into production runtime without a validated diff.

## Acceptance checks

- [x] `npm run build`
- [x] `GET /api/health` returns version `0.1`.
- [x] `GET /api/metrics` returns zeroed new-baseline counters and reports
  whether autonomous synthetic ticks are explicitly enabled.
- [x] JSON, CSV and Markdown export routes return successfully.
- [x] One-shot reset flag removed after the reset; subsequent restarts preserve the new state.
- [x] Autonomous synthetic ticks are disabled by default; fresh 0.1 tasks remain
  reviewable without fabricated completions.
- [x] Add automated API tests for export schema and content-disposition headers
  (`tests/unit/exportRoute.test.ts`).
- [ ] Add a scheduled GitHub/local parity audit and report drift in VirtualPC.
- [x] Implement four-tier polyglot contract tests before adding gRPC,
  PostgreSQL, Redis or vector persistence to the 0.1 runtime
  (`tests/unit/fourTierContracts.test.ts`).
