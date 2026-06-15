/**
 * VirtuAnalytica pretrained role catalog.
 *
 * These are data-management and engineering-scrum roles that a team can
 * purchase as a pack. Each role bundles responsibilities, skills, and a
 * RACI-ready capability set. Roles are sold once per activation at €2.00 each.
 */

export interface RACIEntry {
  activity: string;
  accountable: string;
  responsible: string[];
  consulted: string[];
  informed: string[];
}

export interface PretrainedRole {
  id: string;
  key: string;
  name: string;
  mission: string;
  category: 'data-management' | 'cloud' | 'scrum';
  shortDescription: string;
  priceEur: number;
  includedCapabilities: string[];
  baseTokensPerDay: number;
  raci: RACIEntry[];
}

export const PRETRAINED_ROLES: PretrainedRole[] = [
  {
    id: 'data-engineer',
    key: 'data-engineer',
    name: 'Data Engineer',
    mission: 'Design, build, and maintain scalable data pipelines and data-platform infrastructure.',
    category: 'data-management',
    shortDescription: 'Pipelines, ETL/ELT, warehousing, and data-platform infrastructure.',
    priceEur: 2,
    includedCapabilities: ['data-lineage', 'data-quality', 'dbt-transforms', 'airflow-orchestration'],
    baseTokensPerDay: 120,
    raci: [
      { activity: 'Pipeline design', accountable: 'data-engineer', responsible: ['data-engineer'], consulted: ['analytics-engineer', 'cloud-engineer'], informed: ['data-manager'] },
      { activity: 'Data quality rules', accountable: 'data-engineer', responsible: ['data-engineer'], consulted: ['data-steward', 'data-quality-analyst'], informed: ['data-governance-officer'] },
    ],
  },
  {
    id: 'cloud-engineer',
    key: 'cloud-engineer',
    name: 'Cloud Engineer',
    mission: 'Operate cloud infrastructure, networking, and managed services that data platforms run on.',
    category: 'cloud',
    shortDescription: 'Cloud infrastructure, networking, and managed data services.',
    priceEur: 2,
    includedCapabilities: ['cost-optimization', 'security-posture', 'iac-governance'],
    baseTokensPerDay: 110,
    raci: [
      { activity: 'Cloud provisioning', accountable: 'cloud-engineer', responsible: ['cloud-engineer'], consulted: ['data-engineer', 'platform-engineer'], informed: ['data-manager'] },
      { activity: 'Cost monitoring', accountable: 'cloud-engineer', responsible: ['cloud-engineer'], consulted: ['finance-analyst'], informed: ['data-manager'] },
    ],
  },
  {
    id: 'data-steward',
    key: 'data-steward',
    name: 'Data Steward',
    mission: 'Own data definitions, business glossaries, and day-to-day data quality accountability.',
    category: 'data-management',
    shortDescription: 'Business definitions, glossary ownership, and data-quality accountability.',
    priceEur: 2,
    includedCapabilities: ['data-quality', 'data-profiling', 'catalog-sync'],
    baseTokensPerDay: 100,
    raci: [
      { activity: 'Glossary curation', accountable: 'data-steward', responsible: ['data-steward'], consulted: ['data-analyst', 'data-product-owner'], informed: ['data-governance-officer'] },
      { activity: 'Quality remediation', accountable: 'data-steward', responsible: ['data-steward'], consulted: ['data-engineer'], informed: ['data-manager'] },
    ],
  },
  {
    id: 'data-analyst',
    key: 'data-analyst',
    name: 'Data Analyst',
    mission: 'Transform data into actionable insights through reports, dashboards, and ad-hoc analysis.',
    category: 'data-management',
    shortDescription: 'Reporting, dashboards, and ad-hoc analysis.',
    priceEur: 2,
    includedCapabilities: ['data-profiling', 'catalog-sync'],
    baseTokensPerDay: 90,
    raci: [
      { activity: 'Dashboard delivery', accountable: 'data-analyst', responsible: ['data-analyst'], consulted: ['data-engineer', 'analytics-engineer'], informed: ['data-product-owner'] },
    ],
  },
  {
    id: 'data-scientist',
    key: 'data-scientist',
    name: 'Data Scientist',
    mission: 'Build predictive models and experiments that turn data into business outcomes.',
    category: 'data-management',
    shortDescription: 'Predictive models, experiments, and machine-learning features.',
    priceEur: 2,
    includedCapabilities: ['data-profiling', 'feature-store', 'experiment-tracking'],
    baseTokensPerDay: 140,
    raci: [
      { activity: 'Model development', accountable: 'data-scientist', responsible: ['data-scientist'], consulted: ['data-engineer', 'ml-engineer'], informed: ['data-product-owner'] },
    ],
  },
  {
    id: 'data-manager',
    key: 'data-manager',
    name: 'Data Manager',
    mission: 'Lead the data function, prioritise initiatives, and secure budget and talent.',
    category: 'data-management',
    shortDescription: 'Data strategy, team leadership, and initiative prioritisation.',
    priceEur: 2,
    includedCapabilities: ['data-lineage', 'cost-optimization', 'catalog-sync'],
    baseTokensPerDay: 80,
    raci: [
      { activity: 'Roadmap planning', accountable: 'data-manager', responsible: ['data-manager'], consulted: ['data-product-owner', 'analytics-engineer'], informed: ['all-data-roles'] },
    ],
  },
  {
    id: 'analytics-engineer',
    key: 'analytics-engineer',
    name: 'Analytics Engineer',
    mission: 'Bridge data engineering and analytics with versioned, tested, documented datasets.',
    category: 'data-management',
    shortDescription: 'Versioned datasets, dbt models, and analytics engineering best practices.',
    priceEur: 2,
    includedCapabilities: ['dbt-transforms', 'data-quality', 'data-lineage'],
    baseTokensPerDay: 110,
    raci: [
      { activity: 'dbt model design', accountable: 'analytics-engineer', responsible: ['analytics-engineer'], consulted: ['data-engineer', 'data-analyst'], informed: ['data-manager'] },
    ],
  },
  {
    id: 'data-product-owner',
    key: 'data-product-owner',
    name: 'Data Product Owner',
    mission: 'Define data product vision, backlog, and acceptance criteria for data assets.',
    category: 'scrum',
    shortDescription: 'Data product vision, backlog, and acceptance criteria.',
    priceEur: 2,
    includedCapabilities: ['catalog-sync', 'data-lineage'],
    baseTokensPerDay: 90,
    raci: [
      { activity: 'Backlog prioritisation', accountable: 'data-product-owner', responsible: ['data-product-owner'], consulted: ['data-manager', 'data-engineer'], informed: ['scrum-team'] },
    ],
  },
  {
    id: 'data-governance-officer',
    key: 'data-governance-officer',
    name: 'Data Governance Officer',
    mission: 'Establish policies, standards, and oversight for trusted enterprise data.',
    category: 'data-management',
    shortDescription: 'Policies, standards, and oversight for trusted data.',
    priceEur: 2,
    includedCapabilities: ['data-lineage', 'data-quality', 'security-posture'],
    baseTokensPerDay: 100,
    raci: [
      { activity: 'Policy definition', accountable: 'data-governance-officer', responsible: ['data-governance-officer'], consulted: ['privacy-officer', 'data-steward'], informed: ['all-data-roles'] },
    ],
  },
  {
    id: 'privacy-officer',
    key: 'privacy-officer',
    name: 'Privacy Officer',
    mission: 'Ensure data handling complies with privacy regulations and ethical standards.',
    category: 'data-management',
    shortDescription: 'Privacy compliance, DPIAs, and data-handling ethics.',
    priceEur: 2,
    includedCapabilities: ['security-posture', 'data-lineage'],
    baseTokensPerDay: 90,
    raci: [
      { activity: 'Privacy impact assessment', accountable: 'privacy-officer', responsible: ['privacy-officer'], consulted: ['data-governance-officer', 'data-steward'], informed: ['data-manager'] },
    ],
  },
];

export function listRoles(): PretrainedRole[] {
  return PRETRAINED_ROLES.map((r) => ({ ...r }));
}

export function getRoleById(id: string): PretrainedRole | undefined {
  return PRETRAINED_ROLES.find((r) => r.id === id || r.key === id);
}

export function rolesByCategory(category: string): PretrainedRole[] {
  return PRETRAINED_ROLES.filter((r) => r.category === category).map((r) => ({ ...r }));
}

export function resolveRolePack(keys: string[]): { roles: PretrainedRole[]; combinedCapabilities: string[]; tokenEstimate: number } {
  const roles = keys.map((k) => getRoleById(k)).filter(Boolean) as PretrainedRole[];
  const capSet = new Set<string>();
  let tokenEstimate = 0;
  for (const r of roles) {
    r.includedCapabilities.forEach((c) => capSet.add(c));
    tokenEstimate += r.baseTokensPerDay;
  }
  return { roles, combinedCapabilities: Array.from(capSet), tokenEstimate };
}
