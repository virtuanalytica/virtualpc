/**
 * Anchored Claim Token (ACT) Schema — ERC-3525 semi-fungible semantics
 *
 * Distinct from NFTs (unique, non-fungible) and ERC-20 tokens (fully fungible).
 * An ACT represents a real-world commodity claim where:
 *
 *   - Tokens with the same `slot` (= series_id) ARE fungible with each other
 *     (one unit of "Amsterdam Grain 2026 Series A" is interchangeable with
 *     any other unit in the same series). This fixes the "Non-Fungible Commodity"
 *     oxymoron: commodities ARE fungible within a series/grade/provenance class.
 *
 *   - Tokens across different slots are NOT fungible (grain ≠ gold; Series A ≠ B).
 *     The `slot` field is the ERC-3525 fungibility boundary.
 *
 *   - Bitcoin as the base settlement layer: 1 BTC → 10 ACT at 1:10 granularity.
 *     Tokens can be redeemed for BTC collateral or the underlying commodity.
 *
 *   - Lockup contracts: pension-grade lockups (default 2 years) with
 *     conditional early-exit rules.
 *
 * Node types:
 *   NFCToken        — an anchored commodity claim (ACT node in the graph)
 *   LockupContract  — time-locked holding arrangement
 *   CommodityMarket — live price / volume feed for a commodity type
 *   NFCRegistry     — registry of all ACT series (similar to ERC-3525 contract)
 *
 * Relationships:
 *   BACKED_BY       — NFCToken → Bitcoin (collateral) or physical commodity
 *   HELD_BY         — NFCToken → agent (current holder)
 *   LOCKED_IN       — NFCToken → LockupContract
 *   GRANULAR_OF     — 10 NFCTokens → 1 parent NFCToken (1:10 ratio)
 *   PRICED_BY       — NFCToken → CommodityMarket
 *   TRANSFERRED_TO  — NFCToken transfer event (ownership history)
 *   CERTIFIED_BY    — NFCToken → certification authority node
 *   ISSUED_BY       — NFCToken → NFCRegistry
 */

import { v4 as uuid } from 'uuid';
import type { LightRAGClient } from './client';
import logger from '../../utils/logger';

// ──────────────────────────────────────────────────────────────────────────────
// Commodity types
// ──────────────────────────────────────────────────────────────────────────────

export type CommodityType =
  | 'grain' | 'coffee' | 'cocoa' | 'cotton' | 'sugar'   // agricultural
  | 'crude_oil' | 'natural_gas' | 'coal'                  // energy
  | 'gold' | 'silver' | 'copper' | 'lithium' | 'cobalt'  // metals
  | 'carbon_credit' | 'renewable_energy_certificate'      // green
  | 'water_rights' | 'land'                               // real assets
  | 'compute' | 'storage_tb' | 'storage_pb' | 'storage_eb' // digital infra
  | 'pension'                                              // financial
  | string;

export type LockupType = 'pension' | 'vesting' | 'collateral' | 'escrow' | 'regulatory';

export type BaseAsset = 'bitcoin' | 'ethereum' | 'usdc' | 'physical' | string;

// ──────────────────────────────────────────────────────────────────────────────
// Node interfaces
// ──────────────────────────────────────────────────────────────────────────────

/**
 * AnchoredClaimToken — the primary interface (ERC-3525 semi-fungible).
 * `slot` = fungibility boundary: tokens with the same slot are interchangeable.
 * `NFCToken` below is a backward-compatibility alias for graph/API consumers.
 */
export interface AnchoredClaimToken {
  id: string;
  slot: string;                  // ERC-3525 slot = series_id (fungibility boundary)
  series_id: string;             // links to NFCRegistry
  commodity_type: CommodityType;
  base_asset: BaseAsset;
  base_ratio: number;            // 1:N — how many NFC tokens per 1 base unit. Default: 10
  quantity: number;              // physical quantity this token represents
  unit: string;                  // 'kg', 'barrel', 'ton', 'kWh', 'TB', 'PB', 'EB', 'BTC'
  provenance: string;            // origin / geographic identifier
  certification?: string;        // quality standard (ISO, USDA, etc.)
  holder: string;                // current holder agent id
  issuer: string;                // issuer agent id
  valuation_usd?: number;        // last known USD valuation
  locked: boolean;               // whether currently in a lockup
  parent_token_id?: string;      // if this is a 1:10 sub-token, links to parent
  created_at: string;
  content: string;               // for graph search indexing
}

/** @deprecated Use AnchoredClaimToken — kept for backward compatibility with existing graph/API consumers. */
export type NFCToken = AnchoredClaimToken;

export interface LockupContract {
  id: string;
  token_id: string;              // the NFCToken being locked
  holder: string;                // agent holding the lock
  lockup_type: LockupType;
  locked_at: string;             // ISO timestamp
  unlock_at: string;             // ISO timestamp — 2 years for pension default
  duration_months: number;       // 24 for pension
  early_exit_penalty_pct?: number; // % penalty for early exit
  conditions?: string;           // plain-text conditions for early exit
  status: 'active' | 'expired' | 'redeemed' | 'broken';
  content: string;
}

export interface CommodityMarket {
  id: string;
  commodity_type: CommodityType;
  price_usd: number;
  price_btc?: number;            // price expressed in Bitcoin
  volume_24h_usd: number;
  market_cap_usd?: number;
  last_updated: string;
  source: string;                // price oracle / exchange name
  content: string;
}

export interface NFCRegistry {
  id: string;
  series_name: string;           // e.g. 'Amsterdam Grain 2026 Series A'
  commodity_type: CommodityType;
  total_supply: number;          // total NFCTokens issued in this series
  base_asset: BaseAsset;
  base_ratio: number;
  issuer: string;
  issued_at: string;
  description: string;
  content: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Relationships
// ──────────────────────────────────────────────────────────────────────────────

export const NFC_RELATIONSHIPS = {
  BACKED_BY: 'BACKED_BY',         // NFCToken → base asset node
  HELD_BY: 'HELD_BY',             // NFCToken → agent
  LOCKED_IN: 'LOCKED_IN',         // NFCToken → LockupContract
  GRANULAR_OF: 'GRANULAR_OF',     // sub-NFCToken → parent NFCToken (1:10)
  PRICED_BY: 'PRICED_BY',         // NFCToken → CommodityMarket
  TRANSFERRED_TO: 'TRANSFERRED_TO', // historical ownership transfer
  CERTIFIED_BY: 'CERTIFIED_BY',   // NFCToken → certification node
  ISSUED_BY: 'ISSUED_BY',         // NFCToken → NFCRegistry
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Neo4j indexes
// ──────────────────────────────────────────────────────────────────────────────

export const NFC_INDEXES: Record<string, string> = {
  nfcTokenById:
    `CREATE INDEX IF NOT EXISTS FOR (t:NFCToken) ON (t.id)`,
  nfcTokenByHolder:
    `CREATE INDEX IF NOT EXISTS FOR (t:NFCToken) ON (t.holder)`,
  nfcTokenByCommodity:
    `CREATE INDEX IF NOT EXISTS FOR (t:NFCToken) ON (t.commodity_type)`,
  nfcTokenLocked:
    `CREATE INDEX IF NOT EXISTS FOR (t:NFCToken) ON (t.locked)`,
  nfcTokenBySeriesId:
    `CREATE INDEX IF NOT EXISTS FOR (t:NFCToken) ON (t.series_id)`,
  lockupById:
    `CREATE INDEX IF NOT EXISTS FOR (l:LockupContract) ON (l.id)`,
  lockupByHolder:
    `CREATE INDEX IF NOT EXISTS FOR (l:LockupContract) ON (l.holder)`,
  lockupByStatus:
    `CREATE INDEX IF NOT EXISTS FOR (l:LockupContract) ON (l.status)`,
  lockupByUnlockAt:
    `CREATE INDEX IF NOT EXISTS FOR (l:LockupContract) ON (l.unlock_at)`,
  commodityMarketByType:
    `CREATE INDEX IF NOT EXISTS FOR (m:CommodityMarket) ON (m.commodity_type)`,
  nfcRegistryByName:
    `CREATE INDEX IF NOT EXISTS FOR (r:NFCRegistry) ON (r.series_name)`,
  nfcFullText:
    `CREATE FULLTEXT INDEX nfc_search IF NOT EXISTS FOR (n:NFCToken|NFCRegistry|CommodityMarket) ON EACH [n.content]`,
};

// ──────────────────────────────────────────────────────────────────────────────
// Factory helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Create a new AnchoredClaimToken — returns the object but does NOT persist it. */
export function createNFCToken(params: {
  commodity_type: CommodityType;
  base_asset?: BaseAsset;
  base_ratio?: number;
  quantity: number;
  unit: string;
  provenance: string;
  certification?: string;
  holder: string;
  issuer: string;
  series_id: string;
  valuation_usd?: number;
  parent_token_id?: string;
}): AnchoredClaimToken {
  const id = `nfc_${uuid()}`;
  return {
    id,
    slot: params.series_id,      // ERC-3525: slot identifies the fungibility class
    series_id: params.series_id,
    commodity_type: params.commodity_type,
    base_asset: params.base_asset ?? 'bitcoin',
    base_ratio: params.base_ratio ?? 10,
    quantity: params.quantity,
    unit: params.unit,
    provenance: params.provenance,
    certification: params.certification,
    holder: params.holder,
    issuer: params.issuer,
    valuation_usd: params.valuation_usd,
    locked: false,
    parent_token_id: params.parent_token_id,
    created_at: new Date().toISOString(),
    content: `NFC ${params.commodity_type} ${params.quantity}${params.unit} from ${params.provenance}`,
  };
}

/**
 * Granularise a parent AnchoredClaimToken into N sub-tokens (1:base_ratio).
 * Sub-tokens inherit the parent's slot, so they remain fungible within the series.
 */
export function granularise(parent: AnchoredClaimToken, holder?: string): AnchoredClaimToken[] {
  const N = parent.base_ratio ?? 10;
  return Array.from({ length: N }, () =>
    createNFCToken({
      commodity_type: parent.commodity_type,
      base_asset: parent.base_asset,
      base_ratio: parent.base_ratio,
      quantity: parent.quantity / N,
      unit: parent.unit,
      provenance: parent.provenance,
      certification: parent.certification,
      holder: holder ?? parent.holder,
      issuer: parent.issuer,
      series_id: parent.series_id,
      valuation_usd: parent.valuation_usd ? parent.valuation_usd / N : undefined,
      parent_token_id: parent.id,
    }),
  );
}

/**
 * Create a LockupContract for an NFCToken.
 * Default: pension-grade 24-month lockup.
 */
export function createLockupContract(params: {
  token_id: string;
  holder: string;
  lockup_type?: LockupType;
  duration_months?: number;
  early_exit_penalty_pct?: number;
  conditions?: string;
}): LockupContract {
  const durationMonths = params.duration_months ?? 24;
  const lockedAt = new Date();
  const unlockAt = new Date(lockedAt);
  unlockAt.setMonth(unlockAt.getMonth() + durationMonths);

  return {
    id: `lockup_${uuid()}`,
    token_id: params.token_id,
    holder: params.holder,
    lockup_type: params.lockup_type ?? 'pension',
    locked_at: lockedAt.toISOString(),
    unlock_at: unlockAt.toISOString(),
    duration_months: durationMonths,
    early_exit_penalty_pct: params.early_exit_penalty_pct ?? 10,
    conditions: params.conditions,
    status: 'active',
    content: `Lockup ${params.lockup_type ?? 'pension'} ${durationMonths}mo for ${params.holder}`,
  };
}

/** Create an NFCRegistry (series definition). */
export function createRegistry(params: {
  series_name: string;
  commodity_type: CommodityType;
  total_supply: number;
  base_asset?: BaseAsset;
  base_ratio?: number;
  issuer: string;
  description: string;
}): NFCRegistry {
  return {
    id: `reg_${uuid()}`,
    series_name: params.series_name,
    commodity_type: params.commodity_type,
    total_supply: params.total_supply,
    base_asset: params.base_asset ?? 'bitcoin',
    base_ratio: params.base_ratio ?? 10,
    issuer: params.issuer,
    issued_at: new Date().toISOString(),
    description: params.description,
    content: `NFCRegistry ${params.series_name}: ${params.total_supply} tokens of ${params.commodity_type}`,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Graph persistence helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Persist an AnchoredClaimToken to the knowledge graph. Idempotent. */
export async function persistNFCToken(lightrag: LightRAGClient, token: AnchoredClaimToken): Promise<void> {
  await lightrag.mergeTypedNode(token.id, 'NFCToken', { ...token });
  if (token.parent_token_id) {
    await lightrag.addEdge(token.id, NFC_RELATIONSHIPS.GRANULAR_OF, token.parent_token_id, {});
  }
}

/** Persist a LockupContract and link to its NFCToken. */
export async function persistLockup(lightrag: LightRAGClient, contract: LockupContract): Promise<void> {
  await lightrag.mergeTypedNode(contract.id, 'LockupContract', { ...contract });
  await lightrag.addEdge(contract.token_id, NFC_RELATIONSHIPS.LOCKED_IN, contract.id, {
    lockup_type: contract.lockup_type,
  });
}

/** Persist an NFCRegistry. */
export async function persistRegistry(lightrag: LightRAGClient, registry: NFCRegistry): Promise<void> {
  await lightrag.mergeTypedNode(registry.id, 'NFCRegistry', { ...registry });
}

// ──────────────────────────────────────────────────────────────────────────────
// Cypher query helpers
// ──────────────────────────────────────────────────────────────────────────────

export const NFC_QUERIES = {
  /** All tokens held by an agent */
  tokensByHolder: () => `
    MATCH (t:NFCToken {holder: $holder})
    RETURN t ORDER BY t.created_at DESC LIMIT 100
  `,

  /** All active lockups expiring before a date */
  expiringLockups: () => `
    MATCH (l:LockupContract {status: 'active'})
    WHERE l.unlock_at <= $cutoffDate
    RETURN l ORDER BY l.unlock_at ASC LIMIT 50
  `,

  /** Tokens by commodity type */
  tokensByCommodity: () => `
    MATCH (t:NFCToken {commodity_type: $commodityType})
    RETURN t ORDER BY t.quantity DESC LIMIT 100
  `,

  /** Sub-tokens of a parent (1:10 granularity tree) */
  granularTokens: () => `
    MATCH (t:NFCToken)-[:GRANULAR_OF*1..3]->(parent:NFCToken {id: $parentId})
    RETURN t LIMIT 1000
  `,

  /** Full ownership history of a token */
  ownershipHistory: () => `
    MATCH (t:NFCToken {id: $tokenId})-[:TRANSFERRED_TO*]->(holder)
    RETURN holder ORDER BY holder.created_at ASC
  `,

  /** All pension lockups (2-year) summary */
  pensionSummary: () => `
    MATCH (l:LockupContract {lockup_type: 'pension'})
    RETURN l.status AS status, count(l) AS count, sum(l.duration_months) AS totalMonths
    ORDER BY l.status
  `,

  /** Tokens backed by Bitcoin */
  bitcoinBackedTokens: () => `
    MATCH (t:NFCToken {base_asset: 'bitcoin'})
    RETURN t.commodity_type AS commodity, count(t) AS count,
           sum(t.quantity) AS totalQty, sum(t.valuation_usd) AS totalValueUSD
    ORDER BY totalValueUSD DESC LIMIT 20
  `,
};

// ──────────────────────────────────────────────────────────────────────────────
// Type guards
// ──────────────────────────────────────────────────────────────────────────────

export function isNFCToken(o: any): o is AnchoredClaimToken {
  return o && typeof o.id === 'string' && typeof o.commodity_type === 'string' &&
    typeof o.quantity === 'number' && typeof o.holder === 'string';
}

export function isLockupContract(o: any): o is LockupContract {
  return o && typeof o.id === 'string' && typeof o.token_id === 'string' &&
    typeof o.locked_at === 'string' && typeof o.unlock_at === 'string';
}

export function isNFCRegistry(o: any): o is NFCRegistry {
  return o && typeof o.id === 'string' && typeof o.series_name === 'string' &&
    typeof o.total_supply === 'number';
}

// ──────────────────────────────────────────────────────────────────────────────
// Scale tier helpers (TB / PB / EB — Slava's exascale message)
// ──────────────────────────────────────────────────────────────────────────────

export type ScaleTier = 'TB' | 'PB' | 'EB' | 'ZB';

export interface StorageNFC extends AnchoredClaimToken {
  commodity_type: 'storage_tb' | 'storage_pb' | 'storage_eb';
  scale_tier: ScaleTier;
  datacenter_region: string;
  uptime_sla_pct: number;
}

export function createStorageNFC(params: {
  scale_tier: ScaleTier;
  quantity: number;
  region: string;
  holder: string;
  issuer: string;
  series_id: string;
  uptime_sla_pct?: number;
}): StorageNFC {
  const unitMap: Record<ScaleTier, 'storage_tb' | 'storage_pb' | 'storage_eb'> = {
    TB: 'storage_tb', PB: 'storage_pb', EB: 'storage_eb', ZB: 'storage_eb',
  };
  const base = createNFCToken({
    commodity_type: unitMap[params.scale_tier] ?? 'storage_tb',
    base_asset: 'bitcoin',
    base_ratio: 10,
    quantity: params.quantity,
    unit: params.scale_tier,
    provenance: params.region,
    holder: params.holder,
    issuer: params.issuer,
    series_id: params.series_id,
  });
  return {
    ...base,
    commodity_type: unitMap[params.scale_tier] ?? 'storage_tb',
    scale_tier: params.scale_tier,
    datacenter_region: params.region,
    uptime_sla_pct: params.uptime_sla_pct ?? 99.9,
    content: `Storage NFC ${params.quantity}${params.scale_tier} @ ${params.region} (${params.uptime_sla_pct ?? 99.9}% SLA)`,
  } as StorageNFC;
}

/** Register NFC indexes alongside the quantum indexes in client.ts initIndexes(). */
// NFC_INDEXES is already exported above — no re-export needed

/** Register all NFC indexes in Neo4j. Called from LightRAGClient.initIndexes(). */
export async function initNFCIndexes(lightrag: LightRAGClient): Promise<void> {
  if (!(lightrag as any).connected) return;
  const session = (lightrag as any).driver.session();
  try {
    for (const cypher of Object.values(NFC_INDEXES)) {
      await session.run(cypher);
    }
    logger.info('✓ NFC schema indexes initialised');
  } finally {
    await session.close();
  }
}
