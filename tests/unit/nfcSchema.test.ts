/**
 * Unit tests for nfc-schema.ts and nfc-api.ts
 * All tests are offline — no Neo4j, Kafka, or network required.
 */

import {
  createNFCToken,
  createLockupContract,
  createRegistry,
  granularise,
  isNFCToken,
  isLockupContract,
  isNFCRegistry,
  createStorageNFC,
  NFC_INDEXES,
  NFCToken,
} from '../../src/integrations/lightrag/nfc-schema';
import { registerNFCRoutes } from '../../src/integrations/lightrag/nfc-api';
import { LightRAGClient } from '../../src/integrations/lightrag/client';
import express from 'express';
import http from 'http';

// ──────────────────────────────────────────────────────────────────────────────
// HTTP helper
// ──────────────────────────────────────────────────────────────────────────────

async function callRoute(
  app: express.Express,
  method: 'get' | 'post',
  path: string,
  body?: any,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      const url = `http://127.0.0.1:${port}${path}`;
      const reqBody = body ? JSON.stringify(body) : '';
      const opts: http.RequestOptions = {
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reqBody) },
      };
      const req = http.request(url, opts, (res) => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode ?? 200, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode ?? 200, body: data }); }
        });
      });
      req.on('error', e => { server.close(); reject(e); });
      if (reqBody) req.write(reqBody);
      req.end();
    });
  });
}

function makeOfflineClient(): LightRAGClient {
  return new LightRAGClient({
    neo4j_url: 'bolt://localhost:7687',
    neo4j_username: 'neo4j',
    neo4j_password: 'test',
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// createNFCToken
// ──────────────────────────────────────────────────────────────────────────────

describe('createNFCToken', () => {
  it('generates a unique id starting with "nfc_"', () => {
    const t = createNFCToken({ commodity_type: 'grain', quantity: 100, unit: 'kg',
      provenance: 'Netherlands', holder: 'agent1', issuer: 'issuer1', series_id: 's1' });
    expect(t.id).toMatch(/^nfc_/);
  });

  it('assigns default base_asset as bitcoin', () => {
    const t = createNFCToken({ commodity_type: 'gold', quantity: 1, unit: 'kg',
      provenance: 'Switzerland', holder: 'a1', issuer: 'i1', series_id: 's1' });
    expect(t.base_asset).toBe('bitcoin');
  });

  it('assigns default base_ratio of 10', () => {
    const t = createNFCToken({ commodity_type: 'grain', quantity: 100, unit: 'kg',
      provenance: 'Netherlands', holder: 'a1', issuer: 'i1', series_id: 's1' });
    expect(t.base_ratio).toBe(10);
  });

  it('allows custom base_ratio', () => {
    const t = createNFCToken({ commodity_type: 'gold', quantity: 1, unit: 'oz',
      base_ratio: 100, provenance: 'SA', holder: 'a1', issuer: 'i1', series_id: 's1' });
    expect(t.base_ratio).toBe(100);
  });

  it('sets locked to false by default', () => {
    const t = createNFCToken({ commodity_type: 'grain', quantity: 50, unit: 'kg',
      provenance: 'FR', holder: 'a1', issuer: 'i1', series_id: 's1' });
    expect(t.locked).toBe(false);
  });

  it('sets created_at to ISO string', () => {
    const t = createNFCToken({ commodity_type: 'grain', quantity: 50, unit: 'kg',
      provenance: 'FR', holder: 'a1', issuer: 'i1', series_id: 's1' });
    expect(() => new Date(t.created_at)).not.toThrow();
  });

  it('includes commodity and provenance in content', () => {
    const t = createNFCToken({ commodity_type: 'coffee', quantity: 25, unit: 'kg',
      provenance: 'Ethiopia', holder: 'a1', issuer: 'i1', series_id: 's1' });
    expect(t.content).toContain('coffee');
    expect(t.content).toContain('Ethiopia');
  });

  it('two tokens get different ids', () => {
    const params = { commodity_type: 'grain' as const, quantity: 100, unit: 'kg',
      provenance: 'NL', holder: 'a', issuer: 'b', series_id: 's' };
    const t1 = createNFCToken(params);
    const t2 = createNFCToken(params);
    expect(t1.id).not.toBe(t2.id);
  });

  it('slot equals series_id (ERC-3525 fungibility boundary)', () => {
    const t = createNFCToken({ commodity_type: 'grain', quantity: 100, unit: 'kg',
      provenance: 'NL', holder: 'a', issuer: 'b', series_id: 'series-abc' });
    expect(t.slot).toBe('series-abc');
    expect(t.slot).toBe(t.series_id);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// granularise (1:10)
// ──────────────────────────────────────────────────────────────────────────────

describe('granularise', () => {
  const parent: NFCToken = createNFCToken({
    commodity_type: 'grain', quantity: 1000, unit: 'kg',
    provenance: 'NL', holder: 'agent1', issuer: 'issuer1', series_id: 's1',
  });

  it('returns base_ratio number of sub-tokens', () => {
    const subs = granularise(parent);
    expect(subs).toHaveLength(10);
  });

  it('each sub-token has 1/10 of the parent quantity', () => {
    const subs = granularise(parent);
    for (const sub of subs) {
      expect(sub.quantity).toBeCloseTo(100);
    }
  });

  it('each sub-token references the parent id', () => {
    const subs = granularise(parent);
    for (const sub of subs) {
      expect(sub.parent_token_id).toBe(parent.id);
    }
  });

  it('sub-tokens inherit commodity_type from parent', () => {
    const subs = granularise(parent);
    for (const sub of subs) {
      expect(sub.commodity_type).toBe('grain');
    }
  });

  it('sub-tokens get unique ids', () => {
    const subs = granularise(parent);
    const ids = new Set(subs.map(s => s.id));
    expect(ids.size).toBe(10);
  });

  it('allows overriding the holder', () => {
    const subs = granularise(parent, 'new-holder');
    for (const sub of subs) {
      expect(sub.holder).toBe('new-holder');
    }
  });

  it('sub-tokens inherit slot from parent (ERC-3525 fungibility preserved)', () => {
    const subs = granularise(parent);
    for (const sub of subs) {
      expect(sub.slot).toBe(parent.slot);
    }
  });

  it('respects custom base_ratio', () => {
    const bigParent = createNFCToken({
      commodity_type: 'gold', quantity: 100, unit: 'oz',
      base_ratio: 4, provenance: 'ZA', holder: 'a', issuer: 'b', series_id: 's',
    });
    const subs = granularise(bigParent);
    expect(subs).toHaveLength(4);
    expect(subs[0].quantity).toBeCloseTo(25);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// createLockupContract
// ──────────────────────────────────────────────────────────────────────────────

describe('createLockupContract', () => {
  it('generates id starting with "lockup_"', () => {
    const c = createLockupContract({ token_id: 'tok1', holder: 'agent1' });
    expect(c.id).toMatch(/^lockup_/);
  });

  it('defaults to pension type', () => {
    const c = createLockupContract({ token_id: 'tok1', holder: 'agent1' });
    expect(c.lockup_type).toBe('pension');
  });

  it('defaults to 24 months duration (2 year pension)', () => {
    const c = createLockupContract({ token_id: 'tok1', holder: 'agent1' });
    expect(c.duration_months).toBe(24);
  });

  it('unlock_at is ~24 months after locked_at', () => {
    const c = createLockupContract({ token_id: 'tok1', holder: 'agent1' });
    const lockedAt = new Date(c.locked_at);
    const unlockAt = new Date(c.unlock_at);
    const diffMonths = (unlockAt.getFullYear() - lockedAt.getFullYear()) * 12
      + (unlockAt.getMonth() - lockedAt.getMonth());
    expect(diffMonths).toBe(24);
  });

  it('defaults status to "active"', () => {
    const c = createLockupContract({ token_id: 'tok1', holder: 'agent1' });
    expect(c.status).toBe('active');
  });

  it('allows custom duration', () => {
    const c = createLockupContract({ token_id: 'tok1', holder: 'agent1', duration_months: 6 });
    expect(c.duration_months).toBe(6);
  });

  it('allows custom lockup_type', () => {
    const c = createLockupContract({ token_id: 'tok1', holder: 'agent1', lockup_type: 'vesting' });
    expect(c.lockup_type).toBe('vesting');
  });

  it('defaults early_exit_penalty_pct to 10', () => {
    const c = createLockupContract({ token_id: 'tok1', holder: 'agent1' });
    expect(c.early_exit_penalty_pct).toBe(10);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// createRegistry
// ──────────────────────────────────────────────────────────────────────────────

describe('createRegistry', () => {
  it('generates id starting with "reg_"', () => {
    const r = createRegistry({ series_name: 'Series A', commodity_type: 'grain',
      total_supply: 1000, issuer: 'issuer1', description: 'test' });
    expect(r.id).toMatch(/^reg_/);
  });

  it('sets total_supply correctly', () => {
    const r = createRegistry({ series_name: 'S1', commodity_type: 'gold',
      total_supply: 500, issuer: 'i1', description: '' });
    expect(r.total_supply).toBe(500);
  });

  it('defaults base_ratio to 10', () => {
    const r = createRegistry({ series_name: 'S1', commodity_type: 'oil',
      total_supply: 100, issuer: 'i1', description: '' });
    expect(r.base_ratio).toBe(10);
  });

  it('includes series_name in content', () => {
    const r = createRegistry({ series_name: 'Amsterdam Grain 2026', commodity_type: 'grain',
      total_supply: 1000, issuer: 'i1', description: '' });
    expect(r.content).toContain('Amsterdam Grain 2026');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// createStorageNFC (TB/PB/EB exascale)
// ──────────────────────────────────────────────────────────────────────────────

describe('createStorageNFC', () => {
  it('creates storage_pb commodity for PB tier', () => {
    const t = createStorageNFC({ scale_tier: 'PB', quantity: 5, region: 'AMS',
      holder: 'h1', issuer: 'i1', series_id: 's1' });
    expect(t.commodity_type).toBe('storage_pb');
    expect(t.scale_tier).toBe('PB');
  });

  it('creates storage_tb commodity for TB tier', () => {
    const t = createStorageNFC({ scale_tier: 'TB', quantity: 100, region: 'FRA',
      holder: 'h1', issuer: 'i1', series_id: 's1' });
    expect(t.commodity_type).toBe('storage_tb');
  });

  it('defaults uptime_sla_pct to 99.9', () => {
    const t = createStorageNFC({ scale_tier: 'TB', quantity: 100, region: 'NL',
      holder: 'h1', issuer: 'i1', series_id: 's1' });
    expect(t.uptime_sla_pct).toBe(99.9);
  });

  it('uses bitcoin as base_asset', () => {
    const t = createStorageNFC({ scale_tier: 'EB', quantity: 1, region: 'US-EAST',
      holder: 'h1', issuer: 'i1', series_id: 's1' });
    expect(t.base_asset).toBe('bitcoin');
  });

  it('includes region in content', () => {
    const t = createStorageNFC({ scale_tier: 'PB', quantity: 2, region: 'Amsterdam',
      holder: 'h1', issuer: 'i1', series_id: 's1' });
    expect(t.content).toContain('Amsterdam');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Type guards
// ──────────────────────────────────────────────────────────────────────────────

describe('NFC type guards', () => {
  it('isNFCToken returns true for valid token', () => {
    const t = createNFCToken({ commodity_type: 'grain', quantity: 10, unit: 'kg',
      provenance: 'NL', holder: 'h', issuer: 'i', series_id: 's' });
    expect(isNFCToken(t)).toBe(true);
  });

  it('isNFCToken returns false for null', () => {
    expect(isNFCToken(null)).toBeFalsy();
  });

  it('isNFCToken returns false for object missing holder', () => {
    expect(isNFCToken({ id: 'x', commodity_type: 'grain', quantity: 1 })).toBeFalsy();
  });

  it('isLockupContract returns true for valid lockup', () => {
    const c = createLockupContract({ token_id: 't1', holder: 'h1' });
    expect(isLockupContract(c)).toBe(true);
  });

  it('isLockupContract returns false for null', () => {
    expect(isLockupContract(null)).toBeFalsy();
  });

  it('isNFCRegistry returns true for valid registry', () => {
    const r = createRegistry({ series_name: 'S1', commodity_type: 'grain',
      total_supply: 100, issuer: 'i', description: '' });
    expect(isNFCRegistry(r)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// NFC_INDEXES
// ──────────────────────────────────────────────────────────────────────────────

describe('NFC_INDEXES', () => {
  it('contains at least 12 index definitions', () => {
    expect(Object.keys(NFC_INDEXES).length).toBeGreaterThanOrEqual(12);
  });

  it('all values are valid Cypher CREATE INDEX strings', () => {
    for (const cypher of Object.values(NFC_INDEXES)) {
      // Named (fulltext) indexes put the name BEFORE `IF NOT EXISTS`; anonymous
      // indexes have it right after `INDEX`. Both are valid Neo4j 5 syntax.
      expect(cypher).toMatch(/CREATE (FULLTEXT )?INDEX (\w+ )?IF NOT EXISTS FOR/);
    }
  });

  it('includes nfc_search fulltext index', () => {
    expect(Object.values(NFC_INDEXES).some(c => c.includes('nfc_search'))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// NFC REST API — offline mode
// ──────────────────────────────────────────────────────────────────────────────

describe('NFC REST API — offline', () => {
  let app: express.Express;
  let client: LightRAGClient;

  beforeEach(() => {
    client = makeOfflineClient();
    app = express();
    app.use(express.json());
    registerNFCRoutes(app, client);
  });

  afterEach(async () => { await client.close(); });

  it('POST /api/nfc/registry returns 201 with registry (offline — no Neo4j needed for create)', async () => {
    const { status, body } = await callRoute(app, 'post', '/api/nfc/registry', {
      series_name: 'Test Series', commodity_type: 'grain', total_supply: 100,
      issuer: 'issuer1', description: 'Test',
    });
    expect(status).toBe(201);
    expect(body.registry.series_name).toBe('Test Series');
  });

  it('GET /api/nfc/registry returns offline flag', async () => {
    const { body } = await callRoute(app, 'get', '/api/nfc/registry');
    expect(body.offline).toBe(true);
  });

  it('POST /api/nfc/tokens returns 201 offline', async () => {
    const { status, body } = await callRoute(app, 'post', '/api/nfc/tokens', {
      commodity_type: 'gold', quantity: 1, unit: 'kg',
      provenance: 'ZA', holder: 'agent1', issuer: 'issuer1', series_id: 'reg_test',
    });
    expect(status).toBe(201);
    expect(body.token.commodity_type).toBe('gold');
    expect(body.token.base_asset).toBe('bitcoin');
    expect(body.token.base_ratio).toBe(10);
  });

  it('POST /api/nfc/tokens returns 400 when required fields missing', async () => {
    const { status } = await callRoute(app, 'post', '/api/nfc/tokens', {
      commodity_type: 'grain',
    });
    expect(status).toBe(400);
  });

  it('GET /api/nfc/tokens returns offline flag', async () => {
    const { body } = await callRoute(app, 'get', '/api/nfc/tokens');
    expect(body.offline).toBe(true);
  });

  it('POST /api/nfc/tokens/:id/lock creates lockup offline', async () => {
    const { status, body } = await callRoute(app, 'post', '/api/nfc/tokens/tok1/lock', {
      holder: 'agent1', lockup_type: 'pension',
    });
    expect(status).toBe(201);
    expect(body.contract.lockup_type).toBe('pension');
    expect(body.contract.duration_months).toBe(24);
  });

  it('POST /api/nfc/tokens/:id/lock returns 400 when holder missing', async () => {
    const { status } = await callRoute(app, 'post', '/api/nfc/tokens/tok1/lock', {});
    expect(status).toBe(400);
  });

  it('GET /api/nfc/lockups returns offline flag', async () => {
    const { body } = await callRoute(app, 'get', '/api/nfc/lockups');
    expect(body.offline).toBe(true);
  });

  it('GET /api/nfc/market returns offline flag', async () => {
    const { body } = await callRoute(app, 'get', '/api/nfc/market');
    expect(body.offline).toBe(true);
  });

  it('GET /api/nfc/stats returns offline flag with zero counts', async () => {
    const { body } = await callRoute(app, 'get', '/api/nfc/stats');
    expect(body.offline).toBe(true);
    expect(body.totalTokens).toBe(0);
  });
});
