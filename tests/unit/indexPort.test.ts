/**
 * Vector index port — replaceability contract
 *
 * The k-NN index is a plugin (docs/MODULAR-ARCHITECTURE.md): exact linear
 * scan by default, ANN implementations pluggable. The index returns ids and
 * scores only — rows come from the authoritative store, so a wrong index
 * degrades retrieval quality, never integrity.
 */

process.env.KAFKA_DISABLED = '1';

import {
  LinearScanIndex, cosineSimilarity,
  type VectorIndexPort, type IndexHit,
} from '../../src/integrations/lightrag/index-port';
import { FactMatrixService } from '../../src/integrations/lightrag/fact-matrix';
import type { SparseCoordinate } from '../../src/integrations/lightrag/news';

const vec = (...pairs: Array<[number, number]>): SparseCoordinate[] =>
  pairs.map(([dim, value]) => ({ dim, value }));

describe('LinearScanIndex', () => {
  it('declares exact, non-approximate capabilities', () => {
    const idx = new LinearScanIndex();
    expect(idx.capabilities.exact).toBe(true);
    expect(idx.capabilities.approximate).toBe(false);
    expect(idx.capabilities.designCapacity).toBeGreaterThanOrEqual(100_000);
  });

  it('add → query returns nearest neighbours in similarity order', () => {
    const idx = new LinearScanIndex();
    idx.add('a', 'tx', vec([1, 1], [2, 1]));
    idx.add('b', 'tx', vec([1, 1], [2, 0.9]));   // close to a
    idx.add('c', 'tx', vec([9, 1]));              // orthogonal
    const hits = idx.query(vec([1, 1], [2, 1]), 3, { excludeId: 'a' });
    expect(hits[0].id).toBe('b');
    expect(hits[0].similarity).toBeGreaterThan(hits[1]?.similarity ?? -1);
    expect(hits.find(h => h.id === 'a')).toBeUndefined();
  });

  it('kind filter restricts candidates', () => {
    const idx = new LinearScanIndex();
    idx.add('t1', 'tx', vec([1, 1]));
    idx.add('n1', 'news', vec([1, 1]));
    const hits = idx.query(vec([1, 1]), 10, { kind: 'news' });
    expect(hits.map(h => h.id)).toEqual(['n1']);
  });

  it('add is idempotent per id; remove deletes', () => {
    const idx = new LinearScanIndex();
    idx.add('x', 'tx', vec([1, 1]));
    idx.add('x', 'tx', vec([2, 1]));   // replace
    expect(idx.size()).toBe(1);
    idx.remove('x');
    expect(idx.size()).toBe(0);
  });

  it('caps k to 100 and floors at 1', () => {
    const idx = new LinearScanIndex();
    for (let i = 0; i < 150; i++) idx.add(`r${i}`, 'tx', vec([1, 1 + i / 1000]));
    expect(idx.query(vec([1, 1]), 99999).length).toBe(100);
    expect(idx.query(vec([1, 1]), 0).length).toBe(1);
  });
});

describe('FactMatrixService over a pluggable index', () => {
  it('default behavior (linear scan) is unchanged', () => {
    const svc = new FactMatrixService();
    const base = svc.ingestTransaction({ txId: 'base', asset: 'VPC/EUR', price: 100, volume: 10 });
    svc.ingestTransaction({ txId: 'near', asset: 'VPC/EUR', price: 101, volume: 10 });
    svc.ingestTransaction({ txId: 'far', asset: 'OTHER/USD', price: 0.01, volume: 1_000_000 });
    const hits = svc.similar(base.id, 1);
    expect(hits[0].row.refId).toBe('near');
  });

  it('a custom index implementation receives ingests and serves queries', () => {
    const calls: string[] = [];
    const spy: VectorIndexPort = {
      name: 'spy',
      capabilities: { exact: true, approximate: false, designCapacity: 10 },
      add: (id) => { calls.push(`add:${id}`); },
      query: (): IndexHit[] => [],
      remove: () => { /* noop */ },
      size: () => calls.length,
    };
    const svc = new FactMatrixService(undefined, spy);
    const row = svc.ingestNews({ newsId: 'n1', claimer: 'c', source: 's' });
    expect(calls).toEqual([`add:${row.id}`]);
    expect(svc.similar(row.id, 5)).toEqual([]);   // spy returns nothing — quality, not integrity
  });

  it('a hostile index cannot fabricate rows: unknown ids are dropped', () => {
    const hostile: VectorIndexPort = {
      name: 'hostile',
      capabilities: { exact: false, approximate: true, designCapacity: 10 },
      add: () => { /* ignore */ },
      query: (): IndexHit[] => [{ id: 'forged-row-id', similarity: 0.99 }],
      remove: () => { /* noop */ },
      size: () => 0,
    };
    const svc = new FactMatrixService(undefined, hostile);
    const row = svc.ingestNews({ newsId: 'n1', claimer: 'c', source: 's' });
    // The forged id does not exist in the authoritative store → filtered out.
    expect(svc.similar(row.id, 5)).toEqual([]);
  });

  it('matrix root is independent of the index implementation', () => {
    const a = new FactMatrixService();
    const b = new FactMatrixService(undefined, new LinearScanIndex());
    for (const svc of [a, b]) {
      svc.ingestNews({ newsId: 'n1', claimer: 'c', source: 's' });
      svc.ingestVote({ proposalId: 'p', voter: 'v', option: 'o', weight: 1 });
    }
    expect(a.matrixRoot()).toBe(b.matrixRoot());
  });
});

describe('sparse algebra (moved to index-port, re-exported by fact-matrix)', () => {
  it('cosineSimilarity is importable from both modules and identical', async () => {
    const fm = await import('../../src/integrations/lightrag/fact-matrix');
    expect(fm.cosineSimilarity).toBe(cosineSimilarity);
  });
});
