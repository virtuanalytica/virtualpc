/**
 * VirtuAnalytica — connector capability contracts.
 *
 * Defines the integration abstraction that maps customer systems (metadata
 * repositories, databases, tool registries) to the four capability levels:
 *   none          → no integrations
 *   metadata      → metadata repository connected
 *   inspection    → metadata + database access
 *   execution     → metadata + database + tools
 *   recommendation→ execution + role-based next-best-actions
 */

export interface ConnectorSource {
  connectorId: string;
  connectorType: string; // 'metadata-repository' | 'database' | 'tool-registry'
}

export interface MetadataRepositoryAsset {
  id: string;
  name: string;
  assetType: string;
  description?: string;
  source: ConnectorSource;
}

export interface DatabaseInspectionSummary {
  id: string;
  source: ConnectorSource;
  engine: string;
  status: 'pending' | 'connected' | 'error';
  inspectedAt: string;
  readOnly: boolean;
  totals: {
    schemas: number;
    tables: number;
    columns: number;
  };
  schemas: { name: string; tableCount: number }[];
}

export interface ToolExecutionCapability {
  id: string;
  name: string;
  source: ConnectorSource;
  modes: ('read' | 'write' | 'simulate')[];
  enabled: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  approvalPolicy: 'never' | 'human' | 'auto';
}

export interface RoleAction {
  label: string;
  assetId?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface RoleRecommendation {
  id: string;
  role: 'steward' | 'analyst' | 'engineer' | 'scientist' | 'manager';
  confidence: number;
  rationale: string;
  actions: RoleAction[];
}

export interface ConnectorCapabilityInputs {
  metadataAssets?: MetadataRepositoryAsset[];
  databaseInspections?: DatabaseInspectionSummary[];
  toolCapabilities?: ToolExecutionCapability[];
  roleRecommendations?: RoleRecommendation[];
}

export type ConnectorCapabilityLevel =
  | 'none'
  | 'metadata'
  | 'inspection'
  | 'execution'
  | 'recommendation';

export function deriveConnectorCapabilityLevel(
  inputs?: ConnectorCapabilityInputs,
): ConnectorCapabilityLevel {
  const safe = inputs || {};
  const hasMetadata = Array.isArray(safe.metadataAssets) && safe.metadataAssets.length > 0;
  const hasInspection =
    Array.isArray(safe.databaseInspections) && safe.databaseInspections.length > 0;
  const hasTools = Array.isArray(safe.toolCapabilities) && safe.toolCapabilities.length > 0;
  const hasRecommendations =
    Array.isArray(safe.roleRecommendations) && safe.roleRecommendations.length > 0;

  if (hasRecommendations) return 'recommendation';
  if (hasTools) return 'execution';
  if (hasInspection) return 'inspection';
  if (hasMetadata) return 'metadata';
  return 'none';
}
