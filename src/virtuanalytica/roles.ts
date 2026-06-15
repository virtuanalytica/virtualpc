/**
 * VirtuAnalytica — role summaries + graph passthrough helpers.
 *
 * Thin layer over role-graph.ts: re-exports the role/category/i18n catalogs and
 * derives a per-role node summary (count + breakdown by category) from the live
 * 3D graph payload. When LightRAG/Neo4j is offline, getRoleGraph3D returns an
 * empty graph and the summary is all-zeros — never an error.
 */

import type { LightRAGClient } from '../integrations/lightrag/client';
import {
  ROLE_KEYS,
  listRoles,
  getRoleGraph3D,
} from './role-graph';
import type { RoleKey } from './role-graph';

/** True if a string is one of the five valid role keys. */
export function isRoleKey(role: string | undefined | null): role is RoleKey {
  return !!role && (ROLE_KEYS as readonly string[]).includes(role);
}

/** The {key,name,mission} record for a role key, or undefined. */
export function getRole(role: string): { key: string; name: string; mission: string } | undefined {
  return listRoles().find((r) => r.key === role);
}

export interface RoleSummary {
  /** Total entity nodes attributed to the role (excludes the graph root). */
  nodes: number;
  /** Count of nodes per category key (engineer/responsibility/tool/...). */
  byCategory: Record<string, number>;
}

/**
 * Summarize a role's subgraph: count nodes and break them down by node.category.
 * Reads the live graph via getRoleGraph3D; returns zeros when offline/empty.
 * The graph root + category hubs are excluded so the count reflects real content.
 */
export async function getRoleSummary(client: LightRAGClient | undefined | null, role: RoleKey): Promise<RoleSummary> {
  const byCategory: Record<string, number> = {};
  let nodes = 0;
  if (!client || !client.isConnected()) return { nodes, byCategory };

  const graph = await getRoleGraph3D(client, role);
  for (const n of graph.nodes) {
    if (n.kind === 'graph-root' || n.kind === 'category') continue; // structural, not content
    nodes++;
    const cat = n.category || n.type || 'unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  return { nodes, byCategory };
}
