/**
 * Predefined agent specialisations for the VirtualPC agent army.
 *
 * Each role maps to a fibre (top-level knowledge container) and one or more
 * domain sub-tags. Roles are used by the orchestrator to match agents to
 * bundles and to generate certification tests.
 */

export interface AgentRole {
  id: string;
  label: string;
  fiber: string;
  domains: string[];
  description: string;
}

export const AGENT_ROLES: AgentRole[] = [
  {
    id: 'data-governance-analyst',
    label: 'Data Governance Analyst',
    fiber: 'data',
    domains: ['governance'],
    description: 'Specialist in data governance frameworks and policies.',
  },
  {
    id: 'data-quality-analyst',
    label: 'Data Quality Analyst',
    fiber: 'data',
    domains: ['quality'],
    description: 'Specialist in data quality dimensions and measurement.',
  },
  {
    id: 'metadata-analyst',
    label: 'Metadata Analyst',
    fiber: 'data',
    domains: ['metadata'],
    description: 'Specialist in metadata management and lineage.',
  },
  {
    id: 'chemistry-analyst',
    label: 'Chemistry Analyst',
    fiber: 'chem',
    domains: ['organic', 'inorganic', 'reaction'],
    description: 'Specialist in chemical compounds and reactions.',
  },
  {
    id: 'physics-analyst',
    label: 'Physics Analyst',
    fiber: 'academic',
    domains: ['physics'],
    description: 'Specialist in physical sciences and mechanics.',
  },
  {
    id: 'pseudo-science-auditor',
    label: 'Pseudo-Science Auditor',
    fiber: 'pseudo',
    domains: ['astrology', 'homeopathy', 'conspiracy'],
    description: 'Auditor trained to identify and tag pseudo-scientific claims.',
  },
];

export function getRoleById(id: string): AgentRole | undefined {
  return AGENT_ROLES.find((r) => r.id === id);
}

export function listRoles(): AgentRole[] {
  return [...AGENT_ROLES];
}
