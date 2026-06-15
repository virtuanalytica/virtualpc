# VirtuAnalytica — MVP backlog & acceptance log (sprint: va-mvp)

Orchestrated by the Claude Coordinator (VirtuAnalytica Delivery Lead) across three
sessions: **orchestrator** (ontology + integration + docs), **Codex** (backend
routes), **Kimi** (frontend). Coordination lanes: `virtualpc/va-{coordination,backend,frontend}`.

## Backlog items (live API `sprint:va-mvp`)

| # | Item | Seat (session) | Status |
|---|---|---|---|
| VA-1 | Module scaffold + Tier-0 routes | Kai (Codex) | ✅ done |
| VA-2 | Role-graph API (frozen `{nodes,links}` contract) | Kai (Codex) | ✅ done |
| VA-3 | Tier-1 catalog import (Collibra/generic) | Kai (Codex) | ✅ done |
| VA-4 | Homepage value-ladder | Mira (Kimi) | ✅ done |
| VA-5 | Role pages + 3D viewer | Pixel (Kimi) | ✅ done |
| VA-6 | Integration: routes + boot ingest + nav | Fill (orchestrator) | ✅ done |
| VA-7 | Docs + P4 + acceptance | Fill (orchestrator) | ✅ done |

## Acceptance (live verification, 2026-06-15)

- **Build/tests:** `npx tsc` exit 0; `jest tests/unit/virtuanalytica` 21/21 pass.
- **Role graphs (Neo4j-backed, all `success:true`):** combined 154n/388l; engineer
  57/150; steward 64/181; scientist 51/132; manager 52/122; analyst 54/152. All 5
  Role nodes + 12 cross-role edges; real Magnit/APG steward grounding present.
- **Tier-1 import (demo catalog):** 5 assets / 4 terms / 2 classifications / 2
  policies / 4 lineage → governance registry + graph; `state.tier1.unlocked=true`.
- **Pages:** `/virtuanalytica.html` + `/role-graph.html` → HTTP 200; dashboard nav
  item added (Knowledge section).
- **Tiers 2/3:** demo-safe stubs (demo connection profiles repo data; tool runs
  default to `status:'simulated'`).

## Reconciliation notes (concurrent-session convergence)

The live **Codex session** independently implemented the same plan (it wired routes
in `src/index.ts`, fixed the `/roles/graph` vs `/roles/:role` ordering, imported the
sample catalog, and restarted the server). Convergence was clean because the API
contract was frozen first (`docs/VIRTUANALYTICA-API.md`). Open cleanups for the team:

1. **`src/virtuanalytica/index.ts`** has a duplicate `/roles/graph` route block
   (harmless — first registration wins). Remove the second one.
2. **`docs/PRODUCTS.md` P4** lists 3 role lenses (Steward/Analyst/Engineer) and a
   different PO; the shipped MVP delivers **5 roles** (engineer, steward, scientist,
   manager, analyst) and is no longer "(none yet)". Update P4 "Shipped" + role count.
3. Confirm a single role-graph boot-ingest block remains in `src/index.ts` after the
   sessions settle (verified one block at time of writing).

## Athena review gate

Per `docs/ATHENA-REVIEW-GATE.md`: this branch (`feature/task-va-mvp`) is ready for
the Codex-first review pass (build green + suite green + standards). PO accepts on
Athena approval; runner prints the release command (no auto-push to shared master).
