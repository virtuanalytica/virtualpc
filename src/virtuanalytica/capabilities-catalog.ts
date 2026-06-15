/**
 * VirtuAnalytica capability catalog.
 *
 * Capabilities are granular modules that users attach to selected roles.
 * Each capability is €1.00 per activation and contributes a daily token budget.
 */

export interface Capability {
  id: string;
  name: string;
  description: string;
  category: 'data' | 'engineering' | 'platform' | 'scrum-cap' | 'cloud-cap';
  shortDescription: string;
  priceEur: number;
  tokenCostPerDay: number;
  requiresRoles?: string[];
  raciActivity: string;
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'data-lineage',
    name: 'Data Lineage',
    description: 'Trace data flows across systems, pipelines, and transformations.',
    category: 'data',
    shortDescription: 'Trace data flows across systems and transformations.',
    priceEur: 1,
    tokenCostPerDay: 50,
    requiresRoles: ['data-engineer', 'data-steward', 'analytics-engineer', 'data-governance-officer'],
    raciActivity: 'Lineage mapping',
  },
  {
    id: 'data-quality',
    name: 'Data Quality',
    description: 'Define, measure, and monitor data-quality rules and SLAs.',
    category: 'data',
    shortDescription: 'Define, measure, and monitor data-quality rules.',
    priceEur: 1,
    tokenCostPerDay: 60,
    requiresRoles: ['data-steward', 'data-engineer', 'analytics-engineer'],
    raciActivity: 'Quality rule authoring',
  },
  {
    id: 'data-profiling',
    name: 'Data Profiling',
    description: 'Automatically profile datasets for schema, distribution, and anomalies.',
    category: 'data',
    shortDescription: 'Profile datasets for schema, distribution, and anomalies.',
    priceEur: 1,
    tokenCostPerDay: 40,
    requiresRoles: ['data-steward', 'data-analyst', 'data-scientist'],
    raciActivity: 'Profiling execution',
  },
  {
    id: 'catalog-sync',
    name: 'Catalog Sync',
    description: 'Synchronise metadata with Collibra, Alation, or generic catalogs.',
    category: 'data',
    shortDescription: 'Synchronise metadata with Collibra, Alation, or generic catalogs.',
    priceEur: 1,
    tokenCostPerDay: 45,
    requiresRoles: ['data-steward', 'data-engineer', 'data-product-owner', 'data-manager'],
    raciActivity: 'Catalog ingestion',
  },
  {
    id: 'dbt-transforms',
    name: 'dbt Transforms',
    description: 'Versioned SQL transformations, tests, and documentation with dbt.',
    category: 'data',
    shortDescription: 'Versioned SQL transformations and tests with dbt.',
    priceEur: 1,
    tokenCostPerDay: 55,
    requiresRoles: ['analytics-engineer', 'data-engineer'],
    raciActivity: 'dbt model delivery',
  },
  {
    id: 'airflow-orchestration',
    name: 'Airflow Orchestration',
    description: 'Schedule and monitor data pipelines with Apache Airflow.',
    category: 'engineering',
    shortDescription: 'Schedule and monitor pipelines with Apache Airflow.',
    priceEur: 1,
    tokenCostPerDay: 50,
    requiresRoles: ['data-engineer'],
    raciActivity: 'Pipeline scheduling',
  },
  {
    id: 'cost-optimization',
    name: 'Cost Optimization',
    description: 'Monitor and right-size cloud spend across data workloads.',
    category: 'cloud-cap',
    shortDescription: 'Monitor and right-size cloud spend across data workloads.',
    priceEur: 1,
    tokenCostPerDay: 35,
    requiresRoles: ['cloud-engineer', 'data-manager'],
    raciActivity: 'Cost review',
  },
  {
    id: 'security-posture',
    name: 'Security Posture',
    description: 'Track access controls, encryption, and compliance posture.',
    category: 'platform',
    shortDescription: 'Track access controls, encryption, and compliance posture.',
    priceEur: 1,
    tokenCostPerDay: 45,
    requiresRoles: ['cloud-engineer', 'data-governance-officer', 'privacy-officer'],
    raciActivity: 'Security assessment',
  },
  {
    id: 'iac-governance',
    name: 'IaC Governance',
    description: 'Govern Terraform, Pulumi, or CloudFormation data infrastructure.',
    category: 'engineering',
    shortDescription: 'Govern Terraform/Pulumi/CloudFormation data infrastructure.',
    priceEur: 1,
    tokenCostPerDay: 40,
    requiresRoles: ['cloud-engineer'],
    raciActivity: 'IaC review',
  },
  {
    id: 'feature-store',
    name: 'Feature Store',
    description: 'Manage reusable machine-learning features and feature versions.',
    category: 'data',
    shortDescription: 'Manage reusable ML features and versions.',
    priceEur: 1,
    tokenCostPerDay: 70,
    requiresRoles: ['data-scientist'],
    raciActivity: 'Feature registration',
  },
  {
    id: 'experiment-tracking',
    name: 'Experiment Tracking',
    description: 'Track ML experiments, parameters, metrics, and artifacts.',
    category: 'data',
    shortDescription: 'Track ML experiments, parameters, metrics, and artifacts.',
    priceEur: 1,
    tokenCostPerDay: 60,
    requiresRoles: ['data-scientist'],
    raciActivity: 'Experiment logging',
  },
  {
    id: 'observability',
    name: 'Observability',
    description: 'Unified logs, metrics, and traces for data pipelines.',
    category: 'platform',
    shortDescription: 'Unified logs, metrics, and traces for data pipelines.',
    priceEur: 1,
    tokenCostPerDay: 40,
    requiresRoles: ['data-engineer', 'cloud-engineer'],
    raciActivity: 'Observability setup',
  },
];

export function listCapabilities(): Capability[] {
  return CAPABILITIES.map((c) => ({ ...c }));
}

export function getCapabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

export function capabilitiesForRoles(roleKeys: string[]): Capability[] {
  const keys = new Set(roleKeys || []);
  return CAPABILITIES.filter((c) => !c.requiresRoles || c.requiresRoles.some((r) => keys.has(r))).map((c) => ({ ...c }));
}

export function estimateTokenBudget(roleKeys: string[], capabilityIds: string[]): number {
  const { tokenEstimate: roleTokens } = (() => {
    // Avoid circular import by inlining role lookup if needed; here we just sum role tokens from the catalog.
    const { resolveRolePack } = require('./roles-catalog');
    return resolveRolePack(roleKeys || []);
  })();
  const capTokens = (capabilityIds || [])
    .map((id) => CAPABILITIES.find((c) => c.id === id)?.tokenCostPerDay || 0)
    .reduce((a, b) => a + b, 0);
  return roleTokens + capTokens;
}

export function capabilityBundleForRoles(roleKeys: string[]): Capability[] {
  return capabilitiesForRoles(roleKeys);
}
