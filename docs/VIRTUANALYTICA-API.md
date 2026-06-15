# VirtuAnalytica — API Contract (FROZEN)

> This is the handoff interface between the backend module (`src/virtuanalytica/`)
> and the frontend (`public/virtuanalytica.html`, `public/role-graph.html`).
> Shapes below are frozen for the MVP; change only by updating this doc first.
> All responses use the platform envelope `{ "success": boolean, ... }`; errors
> are `{ "success": false, "error": string }` with an appropriate status code.

Base path: `/api/virtuanalytica`

## Tier 0 — product & state (no access required)

### GET /health
`{ success, ok: true, service: "virtuanalytica" }`

### GET /state
Drives the homepage tier badges.
```json
{ "success": true, "demoMode": true,
  "tiers": {
    "tier1": { "unlocked": false, "assets": 0, "terms": 0 },
    "tier2": { "unlocked": false, "connections": 0, "demo": true },
    "tier3": { "unlocked": false, "tools": 0 } } }
```
- tier1.unlocked → ≥1 imported catalog asset.
- tier2.unlocked → ≥1 **non-demo** connection (a seeded `demo` connection sets `demo:true` but not `unlocked`).
- tier3.unlocked → ≥1 enabled tool.

### GET /roles
`{ success, roles: [ { key, name, mission } ] }` — keys: `engineer|steward|scientist|manager|analyst`.

### GET /roles/:role
`{ success, role: { key, name, mission }, summary: { nodes: number, byCategory: { <catKey>: count } } }`
- 400 if `:role` not one of the five keys.

### GET /categories
`{ success, categories: [ { key, label, group } ] }` (groups 30–39).

### GET /i18n
`{ success, categories: {...}, relations: {...}, ui: { nl, en, cn } }`

## Tier 1 — knowledge graph + catalog

### GET /roles/:role/graph  &  GET /roles/graph (combined)
The 3D-viewer payload (identical shape to `/api/family/graph`):
```json
{ "success": true, "graph": "VirtuAnalytica", "role": "engineer|null", "hidden": false,
  "nodes": [ { "id": "Data Engineer", "name": "Data Engineer", "type": "Role",
               "category": "Roles", "group": 30, "kind": "entity",
               "roles": ["engineer"], "note": "…", "source": "seed", "val": 9 } ],
  "links": [ { "source": "Data Engineer", "target": "dbt", "type": "USES_TOOL",
               "inferred": false, "verified": true, "confidence": "stated",
               "evidence": "…" } ] }
```
- `node.group` → color cluster (30=Role,31=Responsibility,32=Tool,33=Skill,34=Deliverable,35=KPI,36=DataAsset,37=MetadataConcept,38=Stage,39=Policy).
- `node.val` → size (root 14, category 7, role 9, stage 5, asset 4, else 3).
- `link.inferred` vs `link.verified` → style (dashed/lighter vs solid) exactly like family-graph.html.
- The backend resolves these by calling `getRoleGraph3D(lightrag, role)` from `role-graph.ts`.

### POST /catalog/import
Request: `{ source?: "collibra"|"generic", format?: "collibra-json"|"collibra-csv"|"generic-json", payload?: string|object, demo?: boolean }`
- `demo:true` (or empty body) imports the bundled `data/virtuanalytica-sample-catalog.json`.
Response: `{ success, imported: { assets, columns, terms, classifications, owners, lineage, policies }, governanceEntriesUpserted, graph: { assets, terms, classifications, policies, lineage, edges } }`
- Side effects: normalize → `data/virtuanalytica-catalog.json`; upsert each asset/term into the governance registry (`governance.registerEntry` + `notifyGovernanceWrite`); call `ingestCatalogModel(lightrag, model)` from `role-graph.ts`.

### GET /catalog
`{ success, model: { source, importedAt, counts: {assets,columns,terms,classifications,owners,lineage,policies} }, sampleAssets: [ {id,name,type} ] }`

### GET /catalog/asset/:id
`{ success, asset, columns, terms, classifications, owners, lineageIn, lineageOut }` (404 if unknown).

## Tier 2 — database authorizations (locked stub, demo-safe)

### GET /connections → `{ success, connections: [ { id, name, engine, readOnly, demo, lastProfiledAt, secretMasked } ] }`
### POST /connections → body `{ name, engine, host?, port?, database?, user?, secret?, readOnly? }` → `{ success, connectionId, masked }` (secret encrypted via FieldCrypto, never returned).
### POST /connections/:id/profile → `{ success, profile }` (demo engine profiles repo `data/*.json` via `src/data-quality/profiler.ts`).

## Tier 3 — tools / execution (locked stub, demo-safe)

### GET /tools → `{ success, tools: [ { id, name, kind, enabled, lastRunAt } ] }`
### POST /tools → body `{ name, kind, config?, requiresConnectionId? }` → `{ success, toolId }`
### POST /tools/:id/run → body `{ params?, dryRun? }` → `{ success, runId, status: "simulated"|"queued"|"done", output }`
- Default `dryRun:true` → `status:"simulated"`. Real execution requires `dryRun:false` + non-demo connection + env `VIRTUANALYTICA_EXEC_ENABLED=true`.

## Module boundary (who owns what)

- `role-graph.ts` (orchestrator-owned, already merged): `ingestRoleGraph`, `ingestCatalogModel`, `ingestCatalogDelta`, `getRoleGraph3D`, `listRoles`, `getCategories`, `getI18n`, plus the `CatalogModel` types. **Backend imports these — do not re-implement the graph.**
- `index.ts` / `store.ts` / `catalog.ts` / `roles.ts` (backend): routes, JSON stores, catalog normalization (Collibra CSV/JSON + generic JSON → `CatalogModel`), governance-registry mapping, Tier-2/3 stubs.
- `public/*.html` (frontend): consumes the routes above; never calls Neo4j directly.
