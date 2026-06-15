/**
 * Unit tests for the VirtuAnalytica backend module.
 *
 * Covers the pure, deterministic surface that does not require a live Neo4j:
 *   - catalog CSV/JSON normalization → CatalogModel
 *   - governance-registry mapping (asset→schema, term→wiki-term)
 *   - the JSON-backed store: demo connection seed, secret masking (never leaks),
 *     tier-unlock predicates, tool run recording
 *   - roles helpers: key validation + offline (empty) role summary
 *
 * The role-graph itself (Neo4j ingest/query) degrades to empty when offline, so
 * the offline summary is exercised with an un-connected LightRAGClient.
 */

import {
  parseCsv,
  parseCollibraCsv,
  normalize,
  normalizeGenericJson,
  countModel,
  upsertModelToGovernance,
} from '../../../src/virtuanalytica/catalog';
import * as store from '../../../src/virtuanalytica/store';
import * as roles from '../../../src/virtuanalytica/roles';
import * as governance from '../../../src/integrations/governance';
import { LightRAGClient } from '../../../src/integrations/lightrag/client';
import type { CatalogModel } from '../../../src/virtuanalytica/role-graph';

describe('catalog.parseCsv', () => {
  it('splits simple rows', () => {
    const rows = parseCsv('a,b,c\n1,2,3');
    expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('name,note\n"raw.orders","has, comma and ""quote"""');
    expect(rows[1][0]).toBe('raw.orders');
    expect(rows[1][1]).toBe('has, comma and "quote"');
  });
  it('handles CRLF line endings and a trailing newline', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('catalog.parseCollibraCsv', () => {
  it('merges rows sharing an asset and attaches columns/terms/classifications', () => {
    const csv = [
      'asset_id,asset,type,system,schema,description,owner,term,classification,column,column_type,pii',
      'a1,raw.orders,table,Snowflake,raw,Raw orders,Demo Steward,Order,Financial,order_id,string,false',
      'a1,raw.orders,table,Snowflake,raw,Raw orders,Demo Steward,Revenue,Financial,amount,number,false',
    ].join('\n');
    const model = parseCollibraCsv(csv);
    expect(model.source).toBe('collibra');
    expect(model.assets).toHaveLength(1);
    const asset = model.assets[0];
    expect(asset.name).toBe('raw.orders');
    expect(asset.system).toBe('Snowflake');
    expect(asset.termIds!.length).toBe(2);            // Order + Revenue
    expect(asset.classificationIds!.length).toBe(1);  // Financial deduped
    expect(model.columns).toHaveLength(2);            // order_id + amount
    expect(model.glossaryTerms.map((t) => t.name).sort()).toEqual(['Order', 'Revenue']);
    expect(model.classifications.map((c) => c.name)).toEqual(['Financial']);
    expect(model.owners.map((o) => o.name)).toEqual(['Demo Steward']);
  });
  it('flags pii columns and tolerates a header-only sheet', () => {
    const csv = 'asset,column,pii\nraw.customers,email,yes';
    const model = parseCollibraCsv(csv);
    expect(model.columns[0].piiFlag).toBe(true);
    expect(parseCollibraCsv('asset,column,pii').assets).toHaveLength(0);
  });
});

describe('catalog.normalizeGenericJson', () => {
  it('unwraps a {model} doc and coerces loosely-named arrays', () => {
    const doc = {
      model: {
        source: 'generic',
        importedAt: '2026-06-15T00:00:00Z',
        assets: [{ id: 'a1', name: 'mart.orders', type: 'table', ownerIds: ['o1'], termIds: ['t1'] }],
        glossary: [{ id: 't1', name: 'Order' }],     // loosely-named (glossary vs glossaryTerms)
        owners: [{ id: 'o1', name: 'Steward' }],
        lineage: [{ from: 'a0', to: 'a1', kind: 'derives' }],
        policies: [{ id: 'p1', name: 'GDPR', appliesToAssetIds: ['a1'] }],
      },
    };
    const model = normalizeGenericJson(doc);
    expect(model.source).toBe('generic');
    expect(model.assets[0].name).toBe('mart.orders');
    expect(model.glossaryTerms[0].name).toBe('Order');
    expect(model.lineage[0]).toMatchObject({ fromAssetId: 'a0', toAssetId: 'a1' });
    expect(model.policies[0].appliesToAssetIds).toEqual(['a1']);
  });
  it('drops lineage rows missing endpoints', () => {
    const model = normalizeGenericJson({ lineage: [{ from: 'a0' }, { from: 'a0', to: 'a1' }] });
    expect(model.lineage).toHaveLength(1);
  });
});

describe('catalog.normalize (format dispatch)', () => {
  it('parses collibra-csv text', () => {
    const model = normalize('asset,type\nraw.orders,table', 'collibra-csv');
    expect(model.source).toBe('collibra');
    expect(model.assets[0].name).toBe('raw.orders');
  });
  it('parses generic-json text', () => {
    const model = normalize(JSON.stringify({ assets: [{ id: 'a1', name: 'x' }] }), 'generic-json');
    expect(model.assets[0].id).toBe('a1');
  });
  it('throws on invalid JSON', () => {
    expect(() => normalize('{not json', 'generic-json')).toThrow();
  });
});

describe('catalog.countModel', () => {
  it('counts every collection', () => {
    const model: CatalogModel = {
      importedAt: 'now', source: 'generic',
      assets: [{ id: 'a', name: 'a' }],
      columns: [{ id: 'c', assetId: 'a', name: 'c' }],
      glossaryTerms: [{ id: 't', name: 't' }],
      classifications: [], owners: [], lineage: [], policies: [],
    };
    expect(countModel(model)).toEqual({ assets: 1, columns: 1, terms: 1, classifications: 0, owners: 0, lineage: 0, policies: 0 });
  });
});

describe('catalog.upsertModelToGovernance', () => {
  // Spy on the real registry so the test never persists to the shared, tracked
  // data/governance.json. The spy echoes the entry back (registerEntry's
  // contract) so the mapping output is still fully asserted.
  let registerSpy: jest.SpyInstance;
  beforeEach(() => {
    registerSpy = jest.spyOn(governance, 'registerEntry').mockImplementation((e: any) => ({
      ...e,
      updatedAt: e.updatedAt || new Date().toISOString(),
    }));
  });
  afterEach(() => registerSpy.mockRestore());

  it('upserts assets as schema entries and terms as wiki-term entries (idempotent)', () => {
    const model: CatalogModel = {
      importedAt: 'now', source: 'generic',
      assets: [{ id: 'a_orders', name: 'raw.orders', type: 'table', system: 'Snowflake', ownerIds: ['o1'] }],
      columns: [],
      glossaryTerms: [{ id: 't_order', name: 'Order', definition: 'An order.' }],
      classifications: [], owners: [{ id: 'o1', name: 'Demo Steward', role: 'steward' }],
      lineage: [], policies: [],
    };
    const entries = upsertModelToGovernance(model, 'generic');
    expect(entries).toHaveLength(2);
    const asset = entries.find((e) => e.kind === 'schema')!;
    const term = entries.find((e) => e.kind === 'wiki-term')!;
    expect(asset.name).toBe('raw.orders');
    expect(asset.owner).toBe('Demo Steward');
    expect(asset.tags).toContain('virtuanalytica');
    expect(term.name).toBe('Order');

    // Idempotent ids: re-running maps to the same stable ids (registerEntry
    // upserts by id, so no duplicate rows would be created in production).
    const again = upsertModelToGovernance(model, 'generic');
    expect(again.map((e) => e.id)).toEqual(entries.map((e) => e.id));
  });
});

describe('store', () => {
  beforeEach(() => store.resetForTests());

  it('seeds exactly one read-only demo connection', () => {
    const conns = store.listConnections();
    const demo = conns.find((c) => c.id === 'demo')!;
    expect(demo).toBeDefined();
    expect(demo.demo).toBe(true);
    expect(demo.readOnly).toBe(true);
    expect(demo.engine).toBe('demo');
  });

  it('masks secrets and never returns plaintext', () => {
    const conn = store.addConnection({ name: 'prod-pg', engine: 'postgres', secret: 'super-secret-pw' });
    expect(conn.secret).toBe('super-secret-pw'); // plaintext in memory only
    const masked = store.maskSecret(conn.secret);
    expect(masked).not.toContain('super-secret-pw');
    expect(masked.length).toBeGreaterThan(0);
    expect(store.maskSecret(undefined)).toBe('');
  });

  it('tier-2 unlock requires a non-demo connection', () => {
    expect(store.hasNonDemoConnection()).toBe(false); // only demo seeded
    store.addConnection({ name: 'prod', engine: 'postgres' });
    expect(store.hasNonDemoConnection()).toBe(true);
  });

  it('tier-3 unlock requires an enabled tool; records bounded run history', () => {
    expect(store.hasEnabledTool()).toBe(false);
    const tool = store.addTool({ name: 'profiler', kind: 'profile' });
    expect(store.hasEnabledTool()).toBe(true);
    store.recordToolRun(tool.id, { runId: 'r1', at: 'now', status: 'simulated', dryRun: true });
    const t = store.getTool(tool.id)!;
    expect(t.runs).toHaveLength(1);
    expect(t.lastRunAt).toBe('now');
  });

  it('masks secret-looking config keys', () => {
    const masked = store.maskConfig({ url: 'https://x', apiKey: 'abc123', password: 'pw' });
    expect(masked!.url).toBe('https://x');
    expect(masked!.apiKey).not.toBe('abc123');
    expect(masked!.password).not.toBe('pw');
  });
});

describe('roles', () => {
  it('validates role keys', () => {
    expect(roles.isRoleKey('engineer')).toBe(true);
    expect(roles.isRoleKey('steward')).toBe(true);
    expect(roles.isRoleKey('bogus')).toBe(false);
    expect(roles.isRoleKey(undefined)).toBe(false);
  });
  it('resolves a role record', () => {
    expect(roles.getRole('analyst')!.name).toBe('Data Analyst');
    expect(roles.getRole('bogus')).toBeUndefined();
  });
  it('returns an all-zero summary when LightRAG is offline', async () => {
    const client = new LightRAGClient({ neo4j_url: 'bolt://localhost:7687', neo4j_username: 'neo4j', neo4j_password: 'x' });
    try {
      const summary = await roles.getRoleSummary(client, 'engineer');
      expect(summary.nodes).toBe(0);
      expect(summary.byCategory).toEqual({});
    } finally {
      await client.close();
    }
  });
  it('returns an all-zero summary when client is null', async () => {
    const summary = await roles.getRoleSummary(null, 'steward');
    expect(summary).toEqual({ nodes: 0, byCategory: {} });
  });
});
