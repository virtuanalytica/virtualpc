# VirtuAnalytica — Architecture (MVP)

> Data-team-as-a-product inside VirtualPC. Serves five data roles and exposes a
> progressive **capability ladder**: connect a metadata repository (Tier 1),
> add database authorizations (Tier 2), grant tools (Tier 3). MVP ships Tier 1
> fully (per-role knowledge graphs + Collibra/generic catalog import) with
> Tiers 2/3 as visible, demo-safe stubs.

Built collaboratively across three sessions (orchestrator + Codex backend + Kimi
frontend) flowing through the VirtualPC backlog (`sprint:va-mvp`). API contract:
[`VIRTUANALYTICA-API.md`](./VIRTUANALYTICA-API.md) (frozen).

## Capability ladder (homepage staircase)

| Tier | You give | You get | Status |
|---|---|---|---|
| 1 | Your metadata repository (Collibra export / generic catalog JSON) | "Works well" — your data landscape mapped + a knowledge graph per role | **shipped** |
| 2 | Database authorizations (read-only) | "Even better" — profiling, lineage inference, schema-grounded answers | demo-safe stub (`demo` engine profiles repo `data/*.json`) |
| 3 | Tools (SQL/dbt/notebooks/pipelines/BI) | "Best" — actually performs the role's work | demo-safe stub (`dryRun` default; real exec gated by `VIRTUANALYTICA_EXEC_ENABLED`) |

`GET /api/virtuanalytica/state` reports per-tier `unlocked` + counts; the homepage
renders the staircase with locked/unlocked badges so the value of granting more
access is obvious.

## Components

```
src/virtuanalytica/
  role-graph.ts   # ontology + Neo4j ingest (orchestrator-owned)
  index.ts        # registerVirtuAnalyticaRoutes(app) — all /api/virtuanalytica/* routes
  store.ts        # JSON stores (catalog/connections/tools), dirty-flag + 5s save, FieldCrypto at rest
  catalog.ts      # Collibra CSV/JSON + generic JSON → CatalogModel → governance registry
  roles.ts        # role validation + per-role node summary
public/
  virtuanalytica.html   # value-ladder homepage (Tier badges, 5 role tiles, connect panel)
  role-graph.html       # 3D viewer (three.js + 3d-force-graph), ?role=<key> or combined
data/
  virtuanalytica-sample-catalog.json   # labeled DEMO catalog for the Tier-1 demo
  virtuanalytica-{catalog,connections,tools}.json   # runtime stores (auto-seeded)
```

Boot wiring in `src/index.ts`: `registerVirtuAnalyticaRoutes(app)` (route block) and,
next to the Familie-graph block, `ingestRoleGraph(lightrag)` + `ingestCatalogDelta(...)`
(graceful no-op when Neo4j is offline).

## Per-role knowledge graph (role-graph.ts)

Mirrors the proven `integrations/lightrag/family-graph.ts` pattern: a named graph
`:VirtuAnalytica`, a graph-root, ten **category hubs** (groups 30–39: Role,
Responsibility, Tool, Skill, Deliverable, KPI, DataAsset, MetadataConcept,
DataLifecycleStage, Policy), entities linked `IN_CATEGORY`, idempotent `MERGE`,
`assertSafeIdent` guard, verified/inferred edge properties, NL/EN/CN i18n.

- Each entity carries a `roles[]` array → powers the per-role subgraph filter.
- Role→node edges are **auto-generated** from `roles[]` + a category→relation map
  (`PERFORMS`, `USES_TOOL`, `REQUIRES_SKILL`, `PRODUCES`, `MEASURED_BY`,
  `CARES_ABOUT_METADATA`, `OPERATES_AT_STAGE`, `GOVERNS`).
- Explicit edges: cross-role `COLLABORATES_WITH` / `HANDS_OFF_TO` / `DEPENDS_ON`,
  asset `OWNS_ASSET` / `PRODUCES_ASSET` / `CONSUMES`, catalog bindings
  `DESCRIBES` / `CLASSIFIES` / `APPLIES_TO` / `LINEAGE_TO`, lifecycle `PRECEDES`.
- **Real grounding:** the steward graph includes "APG data domains" (`OWNS_ASSET`),
  sourced from the Familie graph's verified edge (Edwin = senior data steward via
  Magnit/APG). Honest-data rule: ontology edges are `confidence:'stated'` with an
  evidence note; the only personal fact is reused, not invented.

### Tier-1 catalog → graph binding
`ingestCatalogModel(client, model, source='collibra')` is idempotent (reconciles by
`source`). Imported assets become `DataAsset` nodes the steward `OWNS_ASSET`, the
engineer `PRODUCES_ASSET`, and the analyst/scientist `CONSUMES`; glossary terms /
classifications / policies attach to the roles that care about them — so connecting
a real catalog visibly enriches every role's graph. Assets + terms are also upserted
into the governance registry (`kind:'schema'` / `'wiki-term'`).

### 3D viewer
`role-graph.html` clones `family-graph.html` (same three.js 0.160 + 3d-force-graph
1.73.4). `?role=<key>` shows a role subgraph; no param → combined. Colors by `group`
(30–39), size by `val`, inferred links dashed/lighter vs verified solid, role picker
from `GET /roles`.

## Verified state (live, 2026-06-15)

- Role graphs (Neo4j-backed): combined **154 nodes / 388 links**; engineer 57/150,
  steward 64/181, scientist 51/132, manager 52/122, analyst 54/152. All 5 Role
  nodes + 12 cross-role edges present; real-grounding node present in steward graph.
- Tier-1 import (demo sample catalog): 5 assets / 4 terms / 2 classifications /
  2 policies / 4 lineage → governance registry + graph; `state.tier1.unlocked=true`.
- Both pages serve HTTP 200; `tsc` clean; 21/21 unit tests pass.
