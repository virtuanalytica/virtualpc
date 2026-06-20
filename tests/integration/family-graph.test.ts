/**
 * Familie knowledge-graph integration tests.
 *
 * Locks the guarantees of src/integrations/lightrag/family-graph.ts against
 * the live Neo4j: idempotent ingest, the hide-toggle gate, declarative edge
 * reconciliation, and the grounded "nieuwe situatie" facts (X.Wu 51% majority
 * of Slag B.V.; Optane → GPU Server 1).
 *
 * Graceful-offline: when Neo4j is unreachable the DB-dependent assertions are
 * skipped (same philosophy as the rest of the LightRAG integration) so the
 * suite still passes on a box without a database.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { LightRAGClient } from '../../src/integrations/lightrag/client';
import {
  ingestFamilyGraph,
  getFamilyGraph3D,
  getFamilyVisibility,
  setFamilyVisibility,
  listFamilyEntities,
  FAMILY_GRAPH_NAME,
} from '../../src/integrations/lightrag/family-graph';

// Curated baseline (ingestFamilyGraph only — excludes the chat/molgang deltas
// which are layered in separately and depend on optional data files). Bump when
// the curated object/category set intentionally changes.
const EXPECTED_CURATED_ENTITIES = 56;
const EXPECTED_CATEGORIES = 22;            // 10 curated + 6 chemistry + 4 chat + 2 molgang
const MIN_CURATED_NODES = EXPECTED_CURATED_ENTITIES + EXPECTED_CATEGORIES + 1;

describe('Familie knowledge graph', () => {
  let client: LightRAGClient;
  let connected = false;

  beforeAll(async () => {
    client = new LightRAGClient({
      neo4j_url: process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j_username: process.env.NEO4J_USER || 'neo4j',
      neo4j_password: process.env.NEO4J_PASSWORD || 'virtualpc-neo4j-pass',
    });
    await client.connect();
    connected = client.isConnected();
    if (!connected) console.warn('⚠️  Neo4j unavailable — DB assertions skipped');
  });

  afterAll(async () => {
    // Never leave the live graph hidden because a test toggled it.
    if (connected) await setFamilyVisibility(client, false);
    await client.close();
  });

  it('ingests the expected object & category counts (idempotent)', async () => {
    if (!connected) return;
    const r1 = await ingestFamilyGraph(client);
    expect(r1.offline).toBeFalsy();
    expect(r1.entities).toBe(EXPECTED_CURATED_ENTITIES);
    expect(r1.categories).toBe(EXPECTED_CATEGORIES);
    expect(r1.verifiedEdges).toBeGreaterThan(0);

    // Re-ingest — counts must be identical (MERGE + declarative reconcile).
    const r2 = await ingestFamilyGraph(client);
    expect(r2.entities).toBe(r1.entities);
    expect(r2.categories).toBe(r1.categories);
    expect(r2.verifiedEdges).toBe(r1.verifiedEdges);
    expect(r2.semanticEdges).toBe(r1.semanticEdges);
  });

  it('returns a stable 3D node/link graph', async () => {
    if (!connected) return;
    const g = await getFamilyGraph3D(client);
    expect(g.graph).toBe(FAMILY_GRAPH_NAME);
    expect(g.hidden).toBe(false);
    // Live graph includes any layered chat/molgang deltas, so assert the curated
    // baseline as a lower bound rather than an exact total.
    expect(g.nodes.length).toBeGreaterThanOrEqual(MIN_CURATED_NODES);
    expect(g.links.length).toBeGreaterThan(MIN_CURATED_NODES); // structural + semantic + verified
    // Every node carries the fields the viewer needs.
    for (const n of g.nodes) {
      expect(typeof n.id).toBe('string');
      expect(typeof n.group).toBe('number');
      expect(n.val).toBeGreaterThan(0);
    }
    // Idempotent read.
    const g2 = await getFamilyGraph3D(client);
    expect(g2.nodes.length).toBe(g.nodes.length);
    expect(g2.links.length).toBe(g.links.length);
  });

  it('grounded edges carry confidence + evidence', async () => {
    if (!connected) return;
    const g = await getFamilyGraph3D(client);
    const ceo = g.links.find((l) => l.source === 'Edwin' && l.target === 'VirtualV Holding B.V.' && l.type === 'CEO_VAN');
    expect(ceo).toBeDefined();
    expect(ceo!.verified).toBe(true);
    expect(ceo!.confidence).toBe('stated');
    expect(typeof ceo!.evidence).toBe('string');
    expect(ceo!.evidence!.length).toBeGreaterThan(0);
  });

  it('models X.Wu as 51% majority holder of Slag B.V.', async () => {
    if (!connected) return;
    const g = await getFamilyGraph3D(client);
    const xwu = g.nodes.find((n) => n.id === 'X.Wu');
    expect(xwu).toBeDefined();
    const share = g.links.find((l) => l.source === 'X.Wu' && l.target === 'SLAG B.V.' && l.type === 'AANDEELHOUDER_VAN');
    expect(share).toBeDefined();
    expect(share!.share).toBe('51%');
    expect(share!.verified).toBe(true);
  });

  it('places Optane in GPU Server 1 (user-confirmed)', async () => {
    if (!connected) return;
    const g = await getFamilyGraph3D(client);
    const opt = g.links.find((l) => l.source === 'Optane nvram' && l.target === 'GPU Server 1' && l.type === 'ONDERDEEL_VAN');
    expect(opt).toBeDefined();
    expect(opt!.verified).toBe(true);
  });

  it('declaratively retires removed edges (no stale Edwin→CONTROLEERT→SLAG)', async () => {
    if (!connected) return;
    // Re-ingest to ensure reconciliation ran this session, then assert absence.
    await ingestFamilyGraph(client);
    const g = await getFamilyGraph3D(client);
    const stale = g.links.find((l) => l.source === 'Edwin' && l.target === 'SLAG B.V.' && l.type === 'CONTROLEERT');
    expect(stale).toBeUndefined();
  });

  it('hide-toggle gates the entire graph', async () => {
    if (!connected) return;
    const before = (await getFamilyGraph3D(client)).nodes.length;
    // Hide → empty graph + hidden flag.
    await setFamilyVisibility(client, true);
    expect(getFamilyVisibility().hidden).toBe(true);
    const hiddenG = await getFamilyGraph3D(client);
    expect(hiddenG.hidden).toBe(true);
    expect(hiddenG.nodes.length).toBe(0);
    expect(hiddenG.links.length).toBe(0);
    const hiddenList = await listFamilyEntities(client);
    expect(hiddenList.hidden).toBe(true);
    expect(hiddenList.count).toBe(0);

    // Show → full graph back (same count as before hiding).
    await setFamilyVisibility(client, false);
    expect(getFamilyVisibility().hidden).toBe(false);
    const shownG = await getFamilyGraph3D(client);
    expect(shownG.hidden).toBe(false);
    expect(shownG.nodes.length).toBe(before);
  });
});
