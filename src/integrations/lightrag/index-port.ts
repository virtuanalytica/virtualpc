/**
 * Vector index port — k-NN retrieval behind a replaceable interface
 *
 * Modularity rule (docs/MODULAR-ARCHITECTURE.md): the fact matrix's nearest-
 * neighbour search was a linear scan hard-wired into FactMatrixService. That
 * is the honest baseline at 10⁵ rows (~120 ms, see IDEAGRAPH-BENCHMARK.md)
 * but not a strategy at 10⁷. This port makes the index a plugin: the exact
 * linear scan stays the default, and an ANN implementation (HNSW / IVF) can
 * replace it without touching ingest, hashing, or the REST surface.
 *
 * The index is NOT part of the truth model: it returns candidate ids and
 * scores, nothing more. Rows, content hashes and the Merkle matrix root live
 * in FactMatrixService — a wrong or stale index can degrade retrieval
 * quality, never integrity (same trust split as Neo4j, threat model §3.6).
 */

import type { SparseCoordinate } from './news';

// ── Sparse vector algebra (lives with the index — its only consumer-side dep) ─

/** Dot product of two dim-sorted sparse vectors — O(n+m) merge walk. */
export function sparseDot(a: SparseCoordinate[], b: SparseCoordinate[]): number {
  let i = 0, j = 0, dot = 0;
  while (i < a.length && j < b.length) {
    if (a[i].dim === b[j].dim) { dot += a[i].value * b[j].value; i++; j++; }
    else if (a[i].dim < b[j].dim) i++;
    else j++;
  }
  return dot;
}

export function sparseNorm(a: SparseCoordinate[]): number {
  return Math.sqrt(a.reduce((s, c) => s + c.value * c.value, 0));
}

/** Cosine similarity in [-1, 1]; 0 when either vector is empty. */
export function cosineSimilarity(a: SparseCoordinate[], b: SparseCoordinate[]): number {
  const na = sparseNorm(a), nb = sparseNorm(b);
  if (na === 0 || nb === 0) return 0;
  return sparseDot(a, b) / (na * nb);
}

export interface IndexCapabilities {
  /** Results are exhaustive and exact (no recall loss). */
  exact: boolean;
  /** Approximate index (HNSW/IVF-class) — faster, possible recall loss. */
  approximate: boolean;
  /** Rows the implementation is designed to handle. */
  designCapacity: number;
}

export interface IndexHit {
  id: string;
  similarity: number;
}

export interface VectorIndexPort {
  readonly name: string;
  readonly capabilities: IndexCapabilities;
  /** Insert or replace a vector. Idempotent per id. */
  add(id: string, kind: string, coordinates: SparseCoordinate[]): void;
  /**
   * k nearest neighbours of the query vector by cosine similarity,
   * optionally restricted to one kind. Never returns `excludeId`.
   */
  query(
    coordinates: SparseCoordinate[],
    k: number,
    opts?: { kind?: string; excludeId?: string },
  ): IndexHit[];
  remove(id: string): void;
  size(): number;
}

/** Exact exhaustive scan — the original FactMatrixService behavior. */
export class LinearScanIndex implements VectorIndexPort {
  readonly name = 'linear-scan';
  readonly capabilities: IndexCapabilities = {
    exact: true,
    approximate: false,
    designCapacity: 100_000,
  };

  private vectors = new Map<string, { kind: string; coordinates: SparseCoordinate[] }>();

  add(id: string, kind: string, coordinates: SparseCoordinate[]): void {
    this.vectors.set(id, { kind, coordinates });
  }

  query(
    coordinates: SparseCoordinate[],
    k: number,
    opts: { kind?: string; excludeId?: string } = {},
  ): IndexHit[] {
    const hits: IndexHit[] = [];
    for (const [id, v] of this.vectors) {
      if (id === opts.excludeId) continue;
      if (opts.kind && v.kind !== opts.kind) continue;
      hits.push({ id, similarity: cosineSimilarity(coordinates, v.coordinates) });
    }
    return hits
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.max(1, Math.min(k, 100)));
  }

  remove(id: string): void {
    this.vectors.delete(id);
  }

  size(): number {
    return this.vectors.size;
  }
}
