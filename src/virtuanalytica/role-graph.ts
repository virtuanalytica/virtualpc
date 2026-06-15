/**
 * VirtuAnalytica — per-role knowledge graph.
 *
 * A separate named knowledge graph ("VirtuAnalytica") in the same
 * gitnexus/LightRAG/Neo4j family as Familie/Asset/Governance/Wiki/Corpus/
 * Codegraph. It models the five data-team roles (data engineer, data steward,
 * data scientist, data manager, data analyst) and everything around them:
 * responsibilities, tools, skills, deliverables, KPIs, the data assets they
 * touch, the metadata/catalog concepts they care about, the data-lifecycle
 * stages they operate at, and the policies they govern — plus the
 * collaboration / hand-off edges that connect the roles.
 *
 * This is the product's Tier-1 payload: when a customer connects a metadata
 * repository (Collibra-style), the imported catalog objects (assets, glossary
 * terms, classifications, lineage, policies) attach to the role(s) that care
 * about them, so the value of granting catalog access is *visible* in the graph.
 *
 * Separation from the other graphs
 * --------------------------------
 *   - Every node carries the label `:VirtuAnalytica` *plus* a type label
 *     (`:Role`, `:Responsibility`, `:Tool`, ...). The graph therefore never
 *     collides with Familie/Asset/Codegraph and can be queried/wiped on its own.
 *   - Every node also has `graph: 'VirtuAnalytica'`, a numeric `group` (color
 *     cluster for the 3D viewer), a `cat` (category key) and a `roles` array
 *     (which of the five roles the node belongs to). The `roles` array is what
 *     powers the per-role subgraph filter.
 *
 * Honesty about data (house rule "no synthetic data")
 * ---------------------------------------------------
 * The seed ontology encodes *definitional* facts about the data professions —
 * e.g. "a data engineer uses dbt", "a data steward governs the business
 * glossary" — synthesised from public role descriptions (DAMA-DMBOK, Collibra
 * role docs, role JDs). They are marked `confidence:'stated'` with an evidence
 * note pointing at the ontology source. The single piece of *real* grounding
 * (Edwin contracts as a senior data steward via Magnit/APG) is taken verbatim
 * from the Familie graph's verified edges, not invented here. Imported catalog
 * objects are real customer metadata, tagged `source:'collibra'` so they stay
 * separately reconcilable from the seed ontology.
 *
 * Idempotent: MERGE on every node/edge, safe to repeat. When LightRAG/Neo4j is
 * offline everything noops gracefully — same degradation as the rest of the
 * LightRAG integration.
 */

import * as fs from 'fs';
import logger from '../utils/logger';
import type { LightRAGClient } from '../integrations/lightrag/client';

export const VIRTUANALYTICA_GRAPH_NAME = 'VirtuAnalytica';

/** The five data-team role keys. Used for `:role` route validation. */
export const ROLE_KEYS = ['engineer', 'steward', 'scientist', 'manager', 'analyst'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

// ---------------------------------------------------------------------------
// Category taxonomy → Neo4j type-label + 3D group id.
// Groups start at 30 so they never collide with the Familie graph (groups 1-22).
// ---------------------------------------------------------------------------
interface Category {
  /** English display name of the category (hub node). */
  label: string;
  /** Neo4j label every node in this category receives. */
  nodeLabel: string;
  /** Numeric group for color clustering in the 3D viewer. */
  group: number;
}

const CATEGORIES: Record<string, Category> = {
  role:           { label: 'Roles',                nodeLabel: 'Role',               group: 30 },
  responsibility: { label: 'Responsibilities',     nodeLabel: 'Responsibility',     group: 31 },
  tool:           { label: 'Tools & Tech',         nodeLabel: 'Tool',               group: 32 },
  skill:          { label: 'Skills',               nodeLabel: 'Skill',              group: 33 },
  deliverable:    { label: 'Deliverables',         nodeLabel: 'Deliverable',        group: 34 },
  kpi:            { label: 'KPIs',                  nodeLabel: 'KPI',                group: 35 },
  dataAsset:      { label: 'Data Assets',          nodeLabel: 'DataAsset',          group: 36 },
  metadata:       { label: 'Metadata Concepts',    nodeLabel: 'MetadataConcept',    group: 37 },
  stage:          { label: 'Lifecycle Stages',     nodeLabel: 'DataLifecycleStage', group: 38 },
  policy:         { label: 'Policies & Standards', nodeLabel: 'Policy',             group: 39 },
};
type CatKey = keyof typeof CATEGORIES;

/**
 * Default relation from a Role to a node of a given category. Role→node edges
 * are auto-generated from each node's `roles` array using this map, so the seed
 * stays declarative (we list which roles a node belongs to, not every edge).
 * `dataAsset` is intentionally absent — asset edges (OWNS_ASSET / PRODUCES_ASSET
 * / CONSUMES) vary per role and are listed explicitly below.
 */
const CATEGORY_REL: Partial<Record<CatKey, string>> = {
  responsibility: 'PERFORMS',
  tool:           'USES_TOOL',
  skill:          'REQUIRES_SKILL',
  deliverable:    'PRODUCES',
  kpi:            'MEASURED_BY',
  metadata:       'CARES_ABOUT_METADATA',
  stage:          'OPERATES_AT_STAGE',
  policy:         'GOVERNS',
};

// ---------------------------------------------------------------------------
// The five roles.
// ---------------------------------------------------------------------------
interface RoleSeed {
  key: RoleKey;
  name: string;
  mission: string;
  i18n: { nl: string; en: string; cn: string };
}
const ROLES: RoleSeed[] = [
  { key: 'engineer',  name: 'Data Engineer',  mission: 'Build and operate the pipelines and platforms that move data from source to analytics-ready store.', i18n: { nl: 'Data Engineer', en: 'Data Engineer', cn: '數據工程師' } },
  { key: 'steward',   name: 'Data Steward',   mission: 'Bridge business and technical sides; guarantee data is accurate, well-defined, classified and compliant.', i18n: { nl: 'Data Steward', en: 'Data Steward', cn: '數據管家' } },
  { key: 'scientist', name: 'Data Scientist', mission: 'Turn prepared data into predictive/ML models and experiments that power features and decisions.', i18n: { nl: 'Data Scientist', en: 'Data Scientist', cn: '數據科學家' } },
  { key: 'manager',   name: 'Data Manager',   mission: 'Own data strategy, roadmap, governance council and team alignment; translate policy into execution.', i18n: { nl: 'Data Manager', en: 'Data Manager', cn: '數據經理' } },
  { key: 'analyst',   name: 'Data Analyst',   mission: 'Translate business questions into queries, dashboards and insights that drive decisions.', i18n: { nl: 'Data Analyst', en: 'Data Analyst', cn: '數據分析師' } },
];
const ROLE_BY_KEY: Record<string, RoleSeed> = Object.fromEntries(ROLES.map((r) => [r.key, r]));

// ---------------------------------------------------------------------------
// Seed nodes (excluding the Role nodes, which are derived from ROLES above).
// `roles` = which of the five roles this node belongs to (drives the subgraph
// filter AND the auto-generated Role→node edges via CATEGORY_REL).
// ---------------------------------------------------------------------------
interface NodeSeed {
  name: string;
  cat: CatKey;
  roles: RoleKey[];
  note?: string;
}
const NODES: NodeSeed[] = [
  // --- Lifecycle stages (shared scaffold; chained via PRECEDES below) --------
  { name: 'Ingest',  cat: 'stage', roles: ['engineer'], note: 'Acquire data from source systems (batch & streaming).' },
  { name: 'Store',   cat: 'stage', roles: ['engineer', 'scientist'], note: 'Persist into warehouse/lake; model for analytics.' },
  { name: 'Govern',  cat: 'stage', roles: ['steward', 'manager'], note: 'Catalog, classify, define quality & policy.' },
  { name: 'Model',   cat: 'stage', roles: ['scientist'], note: 'Engineer features; train, evaluate & deploy models.' },
  { name: 'Analyze', cat: 'stage', roles: ['analyst'], note: 'Query, visualise, surface insight.' },
  { name: 'Decide',  cat: 'stage', roles: ['analyst', 'manager'], note: 'Turn insight into business decisions.' },

  // --- Responsibilities ------------------------------------------------------
  { name: 'Build ETL/ELT pipelines', cat: 'responsibility', roles: ['engineer'] },
  { name: 'Ingest batch & streaming sources', cat: 'responsibility', roles: ['engineer'] },
  { name: 'Data modeling & warehouse design', cat: 'responsibility', roles: ['engineer'] },
  { name: 'Orchestrate & schedule workflows', cat: 'responsibility', roles: ['engineer'] },
  { name: 'Implement data validation & monitoring', cat: 'responsibility', roles: ['engineer'] },
  { name: 'Optimize compute & storage cost', cat: 'responsibility', roles: ['engineer'] },
  { name: 'Define & monitor data quality rules', cat: 'responsibility', roles: ['steward'] },
  { name: 'Maintain the business glossary', cat: 'responsibility', roles: ['steward'] },
  { name: 'Apply data classifications', cat: 'responsibility', roles: ['steward'] },
  { name: 'Document data lineage', cat: 'responsibility', roles: ['steward'] },
  { name: 'Assign & track data ownership', cat: 'responsibility', roles: ['steward'] },
  { name: 'Enforce policy & regulatory compliance', cat: 'responsibility', roles: ['steward'] },
  { name: 'Explore & clean datasets', cat: 'responsibility', roles: ['scientist'] },
  { name: 'Feature engineering', cat: 'responsibility', roles: ['scientist'] },
  { name: 'Design experiments & A/B tests', cat: 'responsibility', roles: ['scientist'] },
  { name: 'Build & train ML models', cat: 'responsibility', roles: ['scientist'] },
  { name: 'Deploy & monitor models', cat: 'responsibility', roles: ['scientist'] },
  { name: 'Develop data strategy', cat: 'responsibility', roles: ['manager'] },
  { name: 'Define & track OKRs', cat: 'responsibility', roles: ['manager'] },
  { name: 'Lead the governance council', cat: 'responsibility', roles: ['manager'] },
  { name: 'Allocate resources & roadmap', cat: 'responsibility', roles: ['manager'] },
  { name: 'Coordinate cross-functional teams', cat: 'responsibility', roles: ['manager'] },
  { name: 'Translate business questions to analysis', cat: 'responsibility', roles: ['analyst'] },
  { name: 'Write SQL queries', cat: 'responsibility', roles: ['analyst'] },
  { name: 'Build & maintain dashboards', cat: 'responsibility', roles: ['analyst'] },
  { name: 'Produce reports & ad-hoc analyses', cat: 'responsibility', roles: ['analyst'] },
  { name: 'Monitor KPIs & flag anomalies', cat: 'responsibility', roles: ['analyst'] },
  { name: 'Communicate insights to stakeholders', cat: 'responsibility', roles: ['scientist', 'analyst'] },

  // --- Tools & tech ----------------------------------------------------------
  { name: 'SQL', cat: 'tool', roles: ['engineer', 'scientist', 'analyst'] },
  { name: 'Python', cat: 'tool', roles: ['engineer', 'scientist'] },
  { name: 'dbt', cat: 'tool', roles: ['engineer'] },
  { name: 'Apache Airflow', cat: 'tool', roles: ['engineer'] },
  { name: 'Apache Spark', cat: 'tool', roles: ['engineer'] },
  { name: 'Apache Kafka', cat: 'tool', roles: ['engineer'] },
  { name: 'Snowflake', cat: 'tool', roles: ['engineer'] },
  { name: 'Collibra', cat: 'tool', roles: ['steward', 'manager'], note: 'Data catalog, business glossary, data quality & governance.' },
  { name: 'Data quality tooling', cat: 'tool', roles: ['steward'] },
  { name: 'Jupyter notebooks', cat: 'tool', roles: ['scientist'] },
  { name: 'scikit-learn', cat: 'tool', roles: ['scientist'] },
  { name: 'PyTorch', cat: 'tool', roles: ['scientist'] },
  { name: 'MLflow', cat: 'tool', roles: ['scientist'] },
  { name: 'Feature store', cat: 'tool', roles: ['scientist', 'engineer'] },
  { name: 'OKR & roadmap tools', cat: 'tool', roles: ['manager'] },
  { name: 'BI dashboards', cat: 'tool', roles: ['analyst', 'manager'] },
  { name: 'Tableau', cat: 'tool', roles: ['analyst'] },
  { name: 'Power BI', cat: 'tool', roles: ['analyst'] },
  { name: 'Looker', cat: 'tool', roles: ['analyst'] },

  // --- Skills ----------------------------------------------------------------
  { name: 'Communication', cat: 'skill', roles: ['engineer', 'steward', 'scientist', 'manager', 'analyst'] },
  { name: 'Advanced SQL', cat: 'skill', roles: ['engineer', 'analyst'] },
  { name: 'Distributed compute', cat: 'skill', roles: ['engineer'] },
  { name: 'Data modeling', cat: 'skill', roles: ['engineer'] },
  { name: 'IaC / DevOps', cat: 'skill', roles: ['engineer'] },
  { name: 'Data governance frameworks (DAMA-DMBOK)', cat: 'skill', roles: ['steward', 'manager'] },
  { name: 'Regulatory & compliance knowledge', cat: 'skill', roles: ['steward', 'manager'] },
  { name: 'Metadata management', cat: 'skill', roles: ['steward'] },
  { name: 'Statistics & probability', cat: 'skill', roles: ['scientist', 'analyst'] },
  { name: 'Machine learning', cat: 'skill', roles: ['scientist'] },
  { name: 'Experiment design', cat: 'skill', roles: ['scientist'] },
  { name: 'MLOps', cat: 'skill', roles: ['scientist'] },
  { name: 'Data strategy', cat: 'skill', roles: ['manager'] },
  { name: 'Leadership & people management', cat: 'skill', roles: ['manager'] },
  { name: 'Stakeholder management', cat: 'skill', roles: ['manager', 'steward'] },
  { name: 'Data visualization', cat: 'skill', roles: ['analyst'] },
  { name: 'Business acumen', cat: 'skill', roles: ['analyst', 'manager'] },
  { name: 'Insight storytelling', cat: 'skill', roles: ['analyst'] },

  // --- Deliverables ----------------------------------------------------------
  { name: 'Production data pipelines', cat: 'deliverable', roles: ['engineer'] },
  { name: 'Curated warehouse tables', cat: 'deliverable', roles: ['engineer'] },
  { name: 'Data contracts', cat: 'deliverable', roles: ['engineer'] },
  { name: 'Pipeline SLAs & runbooks', cat: 'deliverable', roles: ['engineer'] },
  { name: 'Business glossary', cat: 'deliverable', roles: ['steward'] },
  { name: 'Data quality scorecards', cat: 'deliverable', roles: ['steward'] },
  { name: 'Classification scheme', cat: 'deliverable', roles: ['steward'] },
  { name: 'Compliance reports', cat: 'deliverable', roles: ['steward', 'manager'] },
  { name: 'Trained ML models', cat: 'deliverable', roles: ['scientist'] },
  { name: 'Feature sets', cat: 'deliverable', roles: ['scientist'] },
  { name: 'Experiment reports', cat: 'deliverable', roles: ['scientist'] },
  { name: 'Model cards', cat: 'deliverable', roles: ['scientist'] },
  { name: 'Data strategy & roadmap', cat: 'deliverable', roles: ['manager'] },
  { name: 'OKRs', cat: 'deliverable', roles: ['manager'] },
  { name: 'Governance policies', cat: 'deliverable', roles: ['manager', 'steward'] },
  { name: 'Governance dashboards', cat: 'deliverable', roles: ['manager'] },
  { name: 'Dashboards', cat: 'deliverable', roles: ['analyst'] },
  { name: 'KPI reports', cat: 'deliverable', roles: ['analyst'] },
  { name: 'Insight memos', cat: 'deliverable', roles: ['analyst'] },
  { name: 'Metric definitions', cat: 'deliverable', roles: ['analyst', 'steward'] },

  // --- KPIs ------------------------------------------------------------------
  { name: 'Pipeline uptime / SLA adherence', cat: 'kpi', roles: ['engineer'] },
  { name: 'Data freshness / latency', cat: 'kpi', roles: ['engineer'] },
  { name: 'Pipeline failure rate', cat: 'kpi', roles: ['engineer'] },
  { name: 'Cost per TB processed', cat: 'kpi', roles: ['engineer'] },
  { name: 'Data quality score', cat: 'kpi', roles: ['steward'] },
  { name: 'Metadata completeness %', cat: 'kpi', roles: ['steward'] },
  { name: 'Time to resolve data issues', cat: 'kpi', roles: ['steward'] },
  { name: 'Policy compliance rate', cat: 'kpi', roles: ['steward', 'manager'] },
  { name: 'Model accuracy / AUC', cat: 'kpi', roles: ['scientist'] },
  { name: 'Model drift', cat: 'kpi', roles: ['scientist'] },
  { name: 'Experiment velocity', cat: 'kpi', roles: ['scientist'] },
  { name: 'Time-to-production', cat: 'kpi', roles: ['scientist'] },
  { name: 'OKR attainment', cat: 'kpi', roles: ['manager'] },
  { name: 'Governance maturity score', cat: 'kpi', roles: ['manager'] },
  { name: 'Data initiative ROI', cat: 'kpi', roles: ['manager'] },
  { name: 'Stakeholder satisfaction', cat: 'kpi', roles: ['manager', 'analyst'] },
  { name: 'Dashboard adoption', cat: 'kpi', roles: ['analyst'] },
  { name: 'Report turnaround time', cat: 'kpi', roles: ['analyst'] },
  { name: 'Insight-to-decision rate', cat: 'kpi', roles: ['analyst'] },

  // --- Metadata / catalog concepts (the Collibra objects each role cares about)
  { name: 'Business Glossary Term', cat: 'metadata', roles: ['steward', 'analyst'] },
  { name: 'Data Classification', cat: 'metadata', roles: ['steward', 'manager'] },
  { name: 'Data Lineage', cat: 'metadata', roles: ['engineer', 'analyst', 'steward'] },
  { name: 'Data Quality Rule', cat: 'metadata', roles: ['steward', 'engineer'] },
  { name: 'Ownership / Stewardship', cat: 'metadata', roles: ['steward', 'manager'] },
  { name: 'Schema / Table / Column metadata', cat: 'metadata', roles: ['engineer', 'scientist'] },
  { name: 'Data Domain', cat: 'metadata', roles: ['steward', 'manager'] },

  // --- Policies & standards --------------------------------------------------
  { name: 'Data Governance Policy', cat: 'policy', roles: ['manager', 'steward'] },
  { name: 'Data Quality Standard', cat: 'policy', roles: ['steward', 'engineer'] },
  { name: 'Data Access Policy', cat: 'policy', roles: ['manager', 'steward'] },
  { name: 'Data Retention Policy', cat: 'policy', roles: ['steward', 'manager'] },

  // --- Data assets (the shared things roles produce/own/consume) -------------
  { name: 'Raw ingestion tables', cat: 'dataAsset', roles: ['engineer'] },
  { name: 'Curated marts', cat: 'dataAsset', roles: ['engineer', 'analyst', 'scientist'] },
  { name: 'Feature store tables', cat: 'dataAsset', roles: ['scientist', 'engineer'] },
  // Real grounding: taken from the Familie graph's verified edge
  // "Edwin -DETACHERING_VIA-> Magnit (senior data steward)".
  { name: 'APG data domains', cat: 'dataAsset', roles: ['steward'], note: 'Real engagement: senior data steward at APG via Magnit (VirtuAnalytica VOF).' },
];

// ---------------------------------------------------------------------------
// Explicit edges that are NOT a simple Role→node default:
//   - cross-role collaboration / hand-off / dependency
//   - data-asset ownership/production/consumption (relation varies per role)
//   - catalog bindings (term DESCRIBES asset, classification CLASSIFIES asset,
//     DQ rule / policy APPLIES_TO asset)
//   - the lifecycle PRECEDES chain
//   - the single real-grounding edge
// ---------------------------------------------------------------------------
interface EdgeSeed {
  from: string;
  to: string;
  rel: string;
  confidence: 'stated' | 'inferred';
  evidence: string;
}
const E = ROLE_BY_KEY; // shorthand for readable role names below
const EXPLICIT_EDGES: EdgeSeed[] = [
  // Cross-role collaboration / hand-offs (grounded in the DAMA wheel: governance
  // is the hub, so the steward collaborates with everyone).
  { from: E.engineer.name,  to: E.analyst.name,   rel: 'HANDS_OFF_TO',     confidence: 'stated', evidence: 'Curated marts built by the engineer feed the analyst’s BI.' },
  { from: E.engineer.name,  to: E.scientist.name, rel: 'HANDS_OFF_TO',     confidence: 'stated', evidence: 'Engineer provides curated/feature data the scientist models on.' },
  { from: E.scientist.name, to: E.engineer.name,  rel: 'HANDS_OFF_TO',     confidence: 'stated', evidence: 'Scientist hands models back to the engineer to productionize.' },
  { from: E.steward.name,   to: E.engineer.name,  rel: 'COLLABORATES_WITH', confidence: 'stated', evidence: 'Steward governs the data the engineer produces (DAMA governance hub).' },
  { from: E.steward.name,   to: E.scientist.name, rel: 'COLLABORATES_WITH', confidence: 'stated', evidence: 'Steward governs the data the scientist consumes.' },
  { from: E.steward.name,   to: E.analyst.name,   rel: 'COLLABORATES_WITH', confidence: 'stated', evidence: 'Steward certifies the assets and terms the analyst trusts.' },
  { from: E.steward.name,   to: E.manager.name,   rel: 'COLLABORATES_WITH', confidence: 'stated', evidence: 'Steward executes the policy the manager sets.' },
  { from: E.analyst.name,   to: E.manager.name,   rel: 'HANDS_OFF_TO',     confidence: 'stated', evidence: 'Analyst insights feed the manager’s decisions.' },
  { from: E.manager.name,   to: E.engineer.name,  rel: 'DEPENDS_ON',       confidence: 'stated', evidence: 'Manager oversees and depends on the engineering team.' },
  { from: E.manager.name,   to: E.steward.name,   rel: 'DEPENDS_ON',       confidence: 'stated', evidence: 'Manager oversees and depends on stewardship.' },
  { from: E.manager.name,   to: E.scientist.name, rel: 'DEPENDS_ON',       confidence: 'stated', evidence: 'Manager oversees and depends on data science.' },
  { from: E.manager.name,   to: E.analyst.name,   rel: 'DEPENDS_ON',       confidence: 'stated', evidence: 'Manager oversees and depends on analytics.' },

  // Data-asset ownership / production / consumption.
  { from: E.engineer.name,  to: 'Raw ingestion tables', rel: 'PRODUCES_ASSET', confidence: 'stated', evidence: 'Engineer lands raw source data.' },
  { from: E.engineer.name,  to: 'Curated marts',        rel: 'PRODUCES_ASSET', confidence: 'stated', evidence: 'Engineer builds curated marts.' },
  { from: E.analyst.name,   to: 'Curated marts',        rel: 'CONSUMES',       confidence: 'stated', evidence: 'Analyst queries curated marts.' },
  { from: E.scientist.name, to: 'Curated marts',        rel: 'CONSUMES',       confidence: 'stated', evidence: 'Scientist trains on curated marts.' },
  { from: E.scientist.name, to: 'Feature store tables', rel: 'PRODUCES_ASSET', confidence: 'stated', evidence: 'Scientist publishes features to the feature store.' },
  { from: E.steward.name,   to: 'APG data domains',     rel: 'OWNS_ASSET',     confidence: 'stated', evidence: 'Edwin contracts as a senior data steward at APG via Magnit (Familie graph verified edge).' },

  // Catalog bindings — show what a connected metadata repo enriches.
  { from: 'Business Glossary Term', to: 'Curated marts', rel: 'DESCRIBES',  confidence: 'stated', evidence: 'Glossary terms define the meaning of curated columns.' },
  { from: 'Data Classification',    to: 'Curated marts', rel: 'CLASSIFIES', confidence: 'stated', evidence: 'Classifications tag sensitivity (e.g. PII) on assets.' },
  { from: 'Data Quality Rule',      to: 'Curated marts', rel: 'APPLIES_TO', confidence: 'stated', evidence: 'DQ rules are evaluated against curated marts.' },
  { from: 'Data Governance Policy', to: 'Curated marts', rel: 'APPLIES_TO', confidence: 'stated', evidence: 'Governance policy applies to certified assets.' },
  { from: 'Data Lineage',           to: 'Curated marts', rel: 'DESCRIBES',  confidence: 'inferred', evidence: 'Lineage describes how curated marts are derived.' },

  // Lifecycle chain (DAMA-style: ingest → store → govern → model → analyze → decide).
  { from: 'Ingest',  to: 'Store',   rel: 'PRECEDES', confidence: 'stated', evidence: 'Data lifecycle ordering.' },
  { from: 'Store',   to: 'Govern',  rel: 'PRECEDES', confidence: 'stated', evidence: 'Data lifecycle ordering.' },
  { from: 'Govern',  to: 'Model',   rel: 'PRECEDES', confidence: 'stated', evidence: 'Data lifecycle ordering.' },
  { from: 'Model',   to: 'Analyze', rel: 'PRECEDES', confidence: 'stated', evidence: 'Data lifecycle ordering.' },
  { from: 'Analyze', to: 'Decide',  rel: 'PRECEDES', confidence: 'stated', evidence: 'Data lifecycle ordering.' },

  // Asset lineage between the shared assets.
  { from: 'Raw ingestion tables', to: 'Curated marts',        rel: 'LINEAGE_TO', confidence: 'stated', evidence: 'Curated marts are derived from raw ingestion tables.' },
  { from: 'Curated marts',        to: 'Feature store tables', rel: 'LINEAGE_TO', confidence: 'stated', evidence: 'Feature tables are derived from curated marts.' },
];

// Defense-in-depth: any dynamically interpolated Neo4j label/relation-type must
// be a safe identifier. Values come only from the hardcoded whitelists above;
// this guard stops a future edit from silently introducing an injectable value.
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function assertSafeIdent(v: string): string {
  if (!SAFE_IDENT.test(v)) throw new Error(`role-graph: unsafe label/relation '${v}'`);
  return v;
}

// ---------------------------------------------------------------------------
// i18n — NL / EN / CN
// ---------------------------------------------------------------------------
export const CATEGORY_I18N: Record<string, { nl: string; en: string; cn: string }> = {
  'Roles': { nl: 'Rollen', en: 'Roles', cn: '角色' },
  'Responsibilities': { nl: 'Verantwoordelijkheden', en: 'Responsibilities', cn: '職責' },
  'Tools & Tech': { nl: 'Tools & techniek', en: 'Tools & Tech', cn: '工具與技術' },
  'Skills': { nl: 'Vaardigheden', en: 'Skills', cn: '技能' },
  'Deliverables': { nl: 'Opleveringen', en: 'Deliverables', cn: '交付物' },
  'KPIs': { nl: 'KPIs', en: 'KPIs', cn: '關鍵指標' },
  'Data Assets': { nl: 'Data-assets', en: 'Data Assets', cn: '數據資產' },
  'Metadata Concepts': { nl: 'Metadata-concepten', en: 'Metadata Concepts', cn: '元數據概念' },
  'Lifecycle Stages': { nl: 'Levenscyclus-fasen', en: 'Lifecycle Stages', cn: '生命週期階段' },
  'Policies & Standards': { nl: 'Beleid & standaarden', en: 'Policies & Standards', cn: '政策與標準' },
  'Category': { nl: 'Categorie', en: 'Category', cn: '類別' },
  'Graph': { nl: 'Graaf', en: 'Graph', cn: '圖' },
};

export const RELATION_I18N: Record<string, { nl: string; en: string; cn: string }> = {
  IN_CATEGORY: { nl: 'in categorie', en: 'in category', cn: '屬類別' },
  PART_OF: { nl: 'deel van', en: 'part of', cn: '屬於' },
  PERFORMS: { nl: 'voert uit', en: 'performs', cn: '執行' },
  USES_TOOL: { nl: 'gebruikt', en: 'uses tool', cn: '使用工具' },
  PRODUCES: { nl: 'produceert', en: 'produces', cn: '生產' },
  REQUIRES_SKILL: { nl: 'vereist', en: 'requires skill', cn: '需要技能' },
  MEASURED_BY: { nl: 'gemeten met', en: 'measured by', cn: '以…衡量' },
  OWNS_ASSET: { nl: 'bezit', en: 'owns', cn: '擁有' },
  CONSUMES: { nl: 'gebruikt', en: 'consumes', cn: '消費' },
  PRODUCES_ASSET: { nl: 'levert', en: 'produces asset', cn: '產出資產' },
  GOVERNS: { nl: 'beheert', en: 'governs', cn: '治理' },
  CARES_ABOUT_METADATA: { nl: 'geeft om', en: 'cares about', cn: '關注元數據' },
  OPERATES_AT_STAGE: { nl: 'actief in fase', en: 'operates at stage', cn: '處於階段' },
  COLLABORATES_WITH: { nl: 'werkt samen met', en: 'collaborates with', cn: '協作' },
  HANDS_OFF_TO: { nl: 'draagt over aan', en: 'hands off to', cn: '交接給' },
  DEPENDS_ON: { nl: 'hangt af van', en: 'depends on', cn: '依賴' },
  APPLIES_TO: { nl: 'geldt voor', en: 'applies to', cn: '適用於' },
  CLASSIFIES: { nl: 'classificeert', en: 'classifies', cn: '分類' },
  DESCRIBES: { nl: 'beschrijft', en: 'describes', cn: '描述' },
  LINEAGE_TO: { nl: 'herkomst naar', en: 'lineage to', cn: '血緣至' },
  PRECEDES: { nl: 'gaat vooraf aan', en: 'precedes', cn: '先於' },
};

const REL_HUMAN: Record<string, string> = Object.fromEntries(
  Object.entries(RELATION_I18N).map(([k, v]) => [k, v.en]),
);

/** Categories for portal dropdowns ({key,label,group}). */
export function getCategories() {
  return Object.keys(CATEGORIES).map((k) => ({ key: k, label: CATEGORIES[k].label, group: CATEGORIES[k].group }));
}

/** The five roles ({key,name,mission}) — for the role picker. */
export function listRoles() {
  return ROLES.map((r) => ({ key: r.key, name: r.name, mission: r.mission }));
}

/** i18n dictionary for the portal (categories + relations + UI strings). */
export function getI18n() {
  return {
    categories: CATEGORY_I18N,
    relations: RELATION_I18N,
    ui: {
      nl: { title: 'VirtuAnalytica — rollen', combined: 'Gecombineerd', role: 'Rol' },
      en: { title: 'VirtuAnalytica — roles', combined: 'Combined', role: 'Role' },
      cn: { title: 'VirtuAnalytica — 角色', combined: '綜合', role: '角色' },
    },
  };
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------
export interface IngestResult {
  roles: number;
  nodes: number;
  categories: number;
  /** Organizational edges: IN_CATEGORY (per node) + PART_OF (per hub). */
  structuralEdges: number;
  /** Role→node edges auto-generated from the `roles` array. */
  roleEdges: number;
  /** Explicit cross-role / asset / catalog / lifecycle edges. */
  explicitEdges: number;
  offline?: boolean;
}

/** All seed nodes = the derived Role nodes + the NODES list. */
function allSeedNodes(): NodeSeed[] {
  const roleNodes: NodeSeed[] = ROLES.map((r) => ({ name: r.name, cat: 'role', roles: [r.key], note: r.mission }));
  return [...roleNodes, ...NODES];
}

/** Role→node edges, auto-generated from each node's `roles` + CATEGORY_REL. */
function autoRoleEdges(): EdgeSeed[] {
  const edges: EdgeSeed[] = [];
  for (const n of NODES) {
    const rel = CATEGORY_REL[n.cat];
    if (!rel) continue; // dataAsset handled explicitly
    for (const rk of n.roles) {
      const role = ROLE_BY_KEY[rk];
      if (!role) continue;
      edges.push({
        from: role.name, to: n.name, rel,
        confidence: 'stated',
        evidence: `Data-role ontology: a ${role.name} ${REL_HUMAN[rel] || rel.toLowerCase()} "${n.name}".`,
      });
    }
  }
  return edges;
}

/**
 * Build/refresh the VirtuAnalytica role graph in Neo4j. Idempotent (MERGE):
 *   (:VirtuAnalytica:<Type> {name})          one per node
 *   (:VirtuAnalytica:Categorie {name})        one hub per category
 *   (:VirtuAnalytica:Graaf {name})            root node
 *   (node)-[:IN_CATEGORY]->(hub)
 *   (hub)-[:PART_OF]->(root)
 *   (role)-[:<rel>]->(node) / cross-role edges  the seed relations
 */
export async function ingestRoleGraph(client: LightRAGClient): Promise<IngestResult> {
  if (!client.isConnected()) {
    return { roles: 0, nodes: 0, categories: 0, structuralEdges: 0, roleEdges: 0, explicitEdges: 0, offline: true };
  }
  const session = (client as any).driver.session();
  const seedNodes = allSeedNodes();
  const roleEdges = autoRoleEdges();
  let structuralEdges = 0;
  try {
    // Root node of this named graph.
    await session.run(
      `MERGE (g:VirtuAnalytica:Graaf {name: $name})
       SET g.graph = $name, g.kind = 'graph-root', g.cat = 'graph'`,
      { name: VIRTUANALYTICA_GRAPH_NAME },
    );

    // Category hubs (each hub → PART_OF → root).
    for (const key of Object.keys(CATEGORIES)) {
      const c = CATEGORIES[key];
      await session.run(
        `MERGE (cat:VirtuAnalytica:Categorie {name: $label})
         SET cat.graph = $graph, cat.group = $group, cat.kind = 'category', cat.cat = $key
         WITH cat
         MATCH (g:VirtuAnalytica:Graaf {name: $graph})
         MERGE (cat)-[:PART_OF]->(g)`,
        { label: c.label, graph: VIRTUANALYTICA_GRAPH_NAME, group: c.group, key },
      );
      structuralEdges++; // PART_OF
    }

    // Nodes + category edges. Type label is dynamically interpolated from the
    // validated whitelist (CATEGORIES.nodeLabel), never from user input.
    for (const n of seedNodes) {
      const c = CATEGORIES[n.cat];
      const typeLabel = assertSafeIdent(c.nodeLabel);
      await session.run(
        `MERGE (n:VirtuAnalytica:\`${typeLabel}\` {name: $name})
         SET n.graph = $graph, n.category = $catLabel, n.cat = $catKey,
             n.group = $group, n.note = $note, n.kind = 'entity', n.roles = $roles
         WITH n
         MATCH (cat:VirtuAnalytica:Categorie {name: $catLabel})
         MERGE (n)-[:IN_CATEGORY]->(cat)`,
        {
          name: n.name, graph: VIRTUANALYTICA_GRAPH_NAME, catLabel: c.label,
          catKey: n.cat, group: c.group, note: n.note || '', roles: n.roles,
        },
      );
      structuralEdges++; // IN_CATEGORY
    }

    // Reconciliation — make seed relations DECLARATIVE: first delete every edge
    // this module set (they all carry r.verified), then rebuild from the arrays.
    // Structural edges (IN_CATEGORY/PART_OF) lack r.verified and are untouched.
    // We scope to the seed (r.source IS NULL) so an imported catalog delta
    // (r.source='collibra') is reconciled separately by ingestCatalogModel.
    await session.run(
      `MATCH (:VirtuAnalytica)-[r]->(:VirtuAnalytica)
       WHERE r.verified IS NOT NULL AND r.source IS NULL DELETE r`,
    );

    // Role→node edges + explicit edges (all carry r.verified for reconciliation).
    const all = [...roleEdges, ...EXPLICIT_EDGES];
    for (const ed of all) {
      await session.run(
        `MATCH (a:VirtuAnalytica {name: $from}), (b:VirtuAnalytica {name: $to})
         MERGE (a)-[r:\`${assertSafeIdent(ed.rel)}\`]->(b)
         SET r.verified = true, r.confidence = $confidence,
             r.evidence = $evidence, r.inferred = $inferred`,
        { from: ed.from, to: ed.to, confidence: ed.confidence, evidence: ed.evidence, inferred: ed.confidence === 'inferred' },
      );
    }

    logger.info(`✓ role-graph: ${ROLES.length} roles, ${NODES.length} nodes, ${Object.keys(CATEGORIES).length} categories, ${roleEdges.length} role-edges + ${EXPLICIT_EDGES.length} explicit edges`);
    return {
      roles: ROLES.length,
      nodes: seedNodes.length,
      categories: Object.keys(CATEGORIES).length,
      structuralEdges,
      roleEdges: roleEdges.length,
      explicitEdges: EXPLICIT_EDGES.length,
    };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Tier-1 catalog ingest — attach imported metadata to the role graph.
// ---------------------------------------------------------------------------
//
// The backend catalog parser normalizes a Collibra (CSV/JSON) export — or a
// generic catalog JSON — into the CatalogModel below, then calls
// ingestCatalogModel(). Imported objects are tagged source='collibra' so they
// reconcile independently from the seed ontology. Assets/terms/classifications/
// policies become nodes wired to the role(s) that care about them, so connecting
// a real catalog visibly enriches each role's graph.

export interface CatalogAsset { id: string; name: string; type?: string; system?: string; schema?: string; description?: string; ownerIds?: string[]; termIds?: string[]; classificationIds?: string[]; tags?: string[]; }
export interface CatalogColumn { id: string; assetId: string; name: string; dataType?: string; piiFlag?: boolean; termIds?: string[]; }
export interface CatalogTerm { id: string; name: string; definition?: string; domain?: string; stewardId?: string; }
export interface CatalogClassification { id: string; name: string; scheme?: string; }
export interface CatalogOwner { id: string; name: string; role?: string; }
export interface CatalogLineage { id: string; fromAssetId: string; toAssetId: string; kind?: string; inferred?: boolean; evidence?: string; }
export interface CatalogPolicy { id: string; name: string; kind?: string; appliesToAssetIds?: string[]; }
export interface CatalogModel {
  importedAt: string;
  source: 'collibra' | 'generic';
  assets: CatalogAsset[];
  columns: CatalogColumn[];
  glossaryTerms: CatalogTerm[];
  classifications: CatalogClassification[];
  owners: CatalogOwner[];
  lineage: CatalogLineage[];
  policies: CatalogPolicy[];
}

export interface CatalogIngestResult { assets: number; terms: number; classifications: number; policies: number; lineage: number; edges: number; offline?: boolean; }

/**
 * Ingest a normalized catalog model into the role graph, tagged source='collibra'.
 * Idempotent: clears the previous delta of this source first, then rebuilds.
 */
export async function ingestCatalogModel(client: LightRAGClient, model: CatalogModel, source = 'collibra'): Promise<CatalogIngestResult> {
  if (!client.isConnected()) return { assets: 0, terms: 0, classifications: 0, policies: 0, lineage: 0, edges: 0, offline: true };
  const session = (client as any).driver.session();
  const STEWARD = ROLE_BY_KEY.steward.name, ENGINEER = ROLE_BY_KEY.engineer.name;
  const ANALYST = ROLE_BY_KEY.analyst.name, SCIENTIST = ROLE_BY_KEY.scientist.name, MANAGER = ROLE_BY_KEY.manager.name;
  let edges = 0;
  const link = async (from: string, to: string, rel: string, extra: Record<string, any> = {}) => {
    await session.run(
      `MATCH (a:VirtuAnalytica {name: $from}), (b:VirtuAnalytica {name: $to})
       MERGE (a)-[r:\`${assertSafeIdent(rel)}\`]->(b)
       SET r.verified = true, r.source = $source, r.confidence = 'stated', r.evidence = $evidence, r.inferred = $inferred`,
      { from, to, source, evidence: extra.evidence || `Imported from ${source} catalog.`, inferred: !!extra.inferred },
    );
    edges++;
  };
  const upsertNode = async (name: string, cat: CatKey, roles: RoleKey[], note: string) => {
    const c = CATEGORIES[cat];
    await session.run(
      `MERGE (n:VirtuAnalytica:\`${assertSafeIdent(c.nodeLabel)}\` {name: $name})
       SET n.graph = $graph, n.category = $catLabel, n.cat = $catKey, n.group = $group,
           n.note = $note, n.kind = 'entity', n.roles = $roles, n.source = $source
       WITH n MATCH (cat:VirtuAnalytica:Categorie {name: $catLabel}) MERGE (n)-[:IN_CATEGORY]->(cat)`,
      { name, graph: VIRTUANALYTICA_GRAPH_NAME, catLabel: c.label, catKey: cat, group: c.group, note, roles, source },
    );
  };
  try {
    // Reconcile: drop the previous delta of this source (edges then nodes).
    await session.run(`MATCH (:VirtuAnalytica)-[r]->(:VirtuAnalytica) WHERE r.source = $source DELETE r`, { source });
    await session.run(`MATCH (n:VirtuAnalytica) WHERE n.source = $source DETACH DELETE n`, { source });

    const assetName = new Map<string, string>();   // id → display name (deduped)
    const seen = new Set<string>();
    const uniq = (name: string) => { let n = name, i = 2; while (seen.has(n)) n = `${name} (${i++})`; seen.add(n); return n; };

    for (const a of model.assets || []) {
      const nm = uniq(a.name || a.id);
      assetName.set(a.id, nm);
      const note = [a.type, a.system, a.schema, a.description].filter(Boolean).join(' · ');
      await upsertNode(nm, 'dataAsset', ['steward', 'engineer', 'analyst', 'scientist'], note);
      // Steward owns; engineer produces; analyst & scientist consume → value visible.
      await link(STEWARD, nm, 'OWNS_ASSET', { evidence: 'Steward owns the imported catalog asset.' });
      await link(ENGINEER, nm, 'PRODUCES_ASSET', { evidence: 'Engineer maintains the imported asset.' });
      await link(ANALYST, nm, 'CONSUMES', { evidence: 'Analyst consumes the imported asset.' });
      await link(SCIENTIST, nm, 'CONSUMES', { evidence: 'Scientist consumes the imported asset.' });
    }

    const termName = new Map<string, string>();
    for (const t of model.glossaryTerms || []) {
      const nm = uniq(t.name || t.id);
      termName.set(t.id, nm);
      await upsertNode(nm, 'metadata', ['steward', 'analyst'], [t.definition, t.domain].filter(Boolean).join(' · '));
      await link(STEWARD, nm, 'GOVERNS', { evidence: 'Steward governs the glossary term.' });
    }

    const className = new Map<string, string>();
    for (const cl of model.classifications || []) {
      const nm = uniq(cl.name || cl.id);
      className.set(cl.id, nm);
      await upsertNode(nm, 'metadata', ['steward', 'manager'], cl.scheme || '');
      await link(STEWARD, nm, 'GOVERNS', { evidence: 'Steward governs the classification.' });
    }

    const policyName = new Map<string, string>();
    for (const p of model.policies || []) {
      const nm = uniq(p.name || p.id);
      policyName.set(p.id, nm);
      await upsertNode(nm, 'policy', ['manager', 'steward'], p.kind || '');
      await link(MANAGER, nm, 'GOVERNS', { evidence: 'Manager owns the policy.' });
    }

    // Asset ↔ metadata bindings (term DESCRIBES asset, classification CLASSIFIES asset).
    for (const a of model.assets || []) {
      const aNm = assetName.get(a.id); if (!aNm) continue;
      for (const tid of a.termIds || []) { const tNm = termName.get(tid); if (tNm) await link(tNm, aNm, 'DESCRIBES'); }
      for (const cid of a.classificationIds || []) { const cNm = className.get(cid); if (cNm) await link(cNm, aNm, 'CLASSIFIES'); }
    }
    for (const p of model.policies || []) {
      const pNm = policyName.get(p.id); if (!pNm) continue;
      for (const aid of p.appliesToAssetIds || []) { const aNm = assetName.get(aid); if (aNm) await link(pNm, aNm, 'APPLIES_TO'); }
    }

    // Lineage between imported assets.
    let lineage = 0;
    for (const l of model.lineage || []) {
      const from = assetName.get(l.fromAssetId), to = assetName.get(l.toAssetId);
      if (from && to) { await link(from, to, 'LINEAGE_TO', { inferred: !!l.inferred, evidence: l.evidence || 'Imported lineage.' }); lineage++; }
    }

    logger.info(`✓ role-graph: ${source} catalog delta — ${(model.assets || []).length} assets, ${(model.glossaryTerms || []).length} terms, ${(model.classifications || []).length} classifications, ${(model.policies || []).length} policies, ${lineage} lineage, ${edges} edges`);
    return {
      assets: (model.assets || []).length,
      terms: (model.glossaryTerms || []).length,
      classifications: (model.classifications || []).length,
      policies: (model.policies || []).length,
      lineage, edges,
    };
  } finally {
    await session.close();
  }
}

/** Read a normalized catalog JSON file and ingest it (used at boot if present). */
export async function ingestCatalogDelta(client: LightRAGClient, file: string, source = 'collibra'): Promise<CatalogIngestResult> {
  if (!client.isConnected()) return { assets: 0, terms: 0, classifications: 0, policies: 0, lineage: 0, edges: 0, offline: true };
  if (!fs.existsSync(file)) return { assets: 0, terms: 0, classifications: 0, policies: 0, lineage: 0, edges: 0 };
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const model: CatalogModel = doc.model || doc;
    return await ingestCatalogModel(client, model, source);
  } catch (e: any) {
    logger.warn(`role-graph: catalog delta read failed: ${e.message}`);
    return { assets: 0, terms: 0, classifications: 0, policies: 0, lineage: 0, edges: 0 };
  }
}

// ---------------------------------------------------------------------------
// 3D query surface — returns the family-graph {nodes, links} shape verbatim so
// the 3D viewer (public/role-graph.html) is a drop-in clone of family-graph.html.
// ---------------------------------------------------------------------------
export interface Graph3D {
  graph: string;
  role: string | null;
  hidden: boolean;
  nodes: Array<{ id: string; name: string; type: string; category: string; group: number; kind: string; roles?: string[]; note?: string; source?: string; val: number }>;
  links: Array<{ source: string; target: string; type: string; inferred?: boolean; verified?: boolean; confidence?: string; evidence?: string }>;
}

function nodeVal(kind: string, cat: string): number {
  if (kind === 'graph-root') return 14;
  if (kind === 'category') return 7;
  if (cat === 'role') return 9;
  if (cat === 'stage') return 5;
  if (cat === 'dataAsset') return 4;
  return 3;
}

/**
 * Return the role graph in `3d-force-graph` format. With `role` set to one of
 * the five keys, returns that role's subgraph: the root, the hubs that still
 * have children, ALL five Role nodes (so cross-role edges stay visible), and the
 * entities belonging to that role. With `role` null/undefined, returns the full
 * combined graph. Graceful empty result when Neo4j is offline.
 */
export async function getRoleGraph3D(client: LightRAGClient, role?: string | null): Promise<Graph3D> {
  const r = role && ROLE_KEYS.includes(role as RoleKey) ? role : null;
  const empty: Graph3D = { graph: VIRTUANALYTICA_GRAPH_NAME, role: r, hidden: false, nodes: [], links: [] };
  if (!client.isConnected()) return empty;

  const session = (client as any).driver.session();
  try {
    // Nodes: always include root + hubs + all Role nodes; entities filtered by role.
    const nodeRes = await session.run(
      `MATCH (n:VirtuAnalytica)
       WHERE $role IS NULL OR n.kind <> 'entity' OR n.cat = 'role' OR $role IN n.roles
       RETURN n.name AS name, labels(n) AS labels, coalesce(n.category,'') AS category,
              coalesce(n.group,0) AS group, coalesce(n.kind,'entity') AS kind,
              coalesce(n.cat,'') AS cat, coalesce(n.note,'') AS note,
              coalesce(n.source,'seed') AS source, coalesce(n.roles,[]) AS roles`,
      { role: r },
    );
    let nodes = nodeRes.records.map((rec: any) => {
      const o = rec.toObject();
      const labels: string[] = o.labels || [];
      const type = labels.find((l) => l !== 'VirtuAnalytica') || 'VirtuAnalytica';
      const group = typeof o.group === 'object' && o.group?.low !== undefined ? o.group.low : Number(o.group) || 0;
      return {
        id: o.name, name: o.name, type, category: o.category, group,
        kind: o.kind, roles: Array.isArray(o.roles) ? o.roles : undefined,
        note: o.note || undefined, source: o.source,
        val: nodeVal(o.kind, o.cat),
      };
    });

    const linkRes = await session.run(
      `MATCH (a:VirtuAnalytica)-[r]->(b:VirtuAnalytica)
       WHERE ($role IS NULL
              OR ((a.kind <> 'entity' OR a.cat = 'role' OR $role IN a.roles)
              AND (b.kind <> 'entity' OR b.cat = 'role' OR $role IN b.roles)))
       RETURN a.name AS source, b.name AS target, type(r) AS type,
              coalesce(r.inferred,false) AS inferred, coalesce(r.verified,false) AS verified,
              coalesce(r.confidence,'') AS confidence, coalesce(r.evidence,'') AS evidence`,
      { role: r },
    );
    let links = linkRes.records.map((rec: any) => {
      const o = rec.toObject();
      return {
        source: o.source, target: o.target, type: o.type,
        inferred: !!o.inferred, verified: !!o.verified,
        confidence: o.confidence || undefined, evidence: o.evidence || undefined,
      };
    });

    // Prune category hubs that have no surviving IN_CATEGORY child (keeps a
    // single-role view clean). The root is always kept.
    const present = new Set(nodes.map((n: any) => n.id));
    const hubHasChild = new Set<string>();
    for (const l of links) {
      if (l.type === 'IN_CATEGORY' && present.has(l.source) && present.has(l.target)) hubHasChild.add(l.target);
    }
    nodes = nodes.filter((n: any) => n.kind !== 'category' || hubHasChild.has(n.id));
    const kept = new Set(nodes.map((n: any) => n.id));
    links = links.filter((l: any) => kept.has(l.source) && kept.has(l.target));

    return { graph: VIRTUANALYTICA_GRAPH_NAME, role: r, hidden: false, nodes, links };
  } finally {
    await session.close();
  }
}
