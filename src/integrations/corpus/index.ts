/**
 * Corpus — semantic-chunked + vector-embedded knowledge store.
 *
 * Bigger thinking on knowledge graphs (per user ask): the box has 629 GB
 * RAM, mostly idle. We've been running Neo4j on a 1 GB heap for a 397-
 * node graph. This module pulls every available text source — code,
 * docs, shared JSONs, IUPAC terminology, eventually OpenStax + arXiv
 * abstracts — chunks each into ~500-char passages, embeds via the local
 * nomic-embed (768-dim), and stores in Neo4j as Corpus nodes with vector
 * index. Agents query through corpus.search(q, k) — gives them prior
 * context before they reason from scratch.
 *
 * Token-cost effect (the user's framing): an agent answering "how do I
 * model fugacity at high pressure" today reasons ~1500 prompt tokens.
 * With corpus retrieval first, the same answer needs ~400 token prompt
 * + 6 retrieved passages — same quality, ~3× cheaper.
 */
import * as fs from 'fs';
import * as path from 'path';
import { int as neo4jInt } from 'neo4j-driver';
import logger from '../../utils/logger';
import type { LightRAGClient } from '../lightrag/client';

export interface CorpusChunk {
  id: string;
  source: string;          // e.g. 'src/index.ts', 'IUPAC:fugacity', 'OpenStax:ch12.4'
  source_kind: 'code' | 'doc' | 'shared-data' | 'iupac' | 'textbook' | 'paper' | 'other';
  title?: string;
  content: string;         // the chunk text
  embedding?: number[];    // 768-dim from nomic-embed
  meta?: Record<string, any>;
}

const EMBEDDING_DIM = 768;
const CHUNK_TARGET_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;

// LM Studio direct — LiteLLM gateway doesn't expose embedding models in
// the current config. Embedding requests go straight to LM Studio's
// /v1/embeddings on :1234 against the loaded nomic-embed model.
const EMBED_URL = process.env.EMBED_URL || 'http://127.0.0.1:1234/v1';
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-nomic-embed-text-v1.5';
const OLLAMA_EMBED_URL = process.env.OLLAMA_EMBED_URL || 'http://127.0.0.1:11434/api/embeddings';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

/** Split text into ~CHUNK_TARGET_CHARS passages with overlap. Sentence-aware
 *  where possible (split on . ! ? newlines), falls back to char-window.  */
export function chunkText(text: string, source: string, sourceKind: CorpusChunk['source_kind'] = 'other'): CorpusChunk[] {
  if (!text || text.length < 50) return [];
  const out: CorpusChunk[] = [];
  // First pass: split into paragraphs (double newline) then re-merge to target size
  const paragraphs = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  let buffer = '';
  let chunkIdx = 0;
  for (const p of paragraphs) {
    if (buffer.length + p.length > CHUNK_TARGET_CHARS && buffer.length > CHUNK_TARGET_CHARS - CHUNK_OVERLAP_CHARS) {
      out.push({
        id: `${source}#${chunkIdx}`,
        source,
        source_kind: sourceKind,
        content: buffer.trim(),
      });
      chunkIdx++;
      // Carry overlap (last 1-2 sentences) into next buffer
      const tail = buffer.slice(-CHUNK_OVERLAP_CHARS);
      const lastBoundary = Math.max(tail.lastIndexOf('. '), tail.lastIndexOf('\n'), 0);
      buffer = tail.slice(lastBoundary).trim() + '\n\n' + p;
    } else {
      buffer += (buffer ? '\n\n' : '') + p;
    }
  }
  if (buffer.trim().length > 0) {
    out.push({ id: `${source}#${chunkIdx}`, source, source_kind: sourceKind, content: buffer.trim() });
  }
  return out;
}

/** Embed a list of texts via the local nomic-embed model exposed by
 *  LiteLLM. Returns array of 768-dim float arrays. Failures degrade
 *  gracefully — chunks without embeddings still ingest by keyword. */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  // Batch in groups of 16 to stay friendly to the embedder
  const out: (number[] | null)[] = new Array(texts.length).fill(null);
  for (let i = 0; i < texts.length; i += 16) {
    const batch = texts.slice(i, i + 16);
    let embeddedWithLmStudio = false;
    try {
      const r = await fetch(`${EMBED_URL}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) {
        logger.warn(`corpus.embedTexts: ${r.status} ${await r.text()}`);
        continue;
      }
      const data: any = await r.json();
      if (data.data) {
        for (let j = 0; j < batch.length; j++) {
          out[i + j] = data.data[j]?.embedding || null;
        }
        embeddedWithLmStudio = true;
      }
    } catch (e: any) {
      logger.warn(`corpus.embedTexts batch failed: ${e.message}`);
    }

    if (embeddedWithLmStudio) continue;

    // Local fallback: Alexander already keeps Ollama's nomic-embed-text warm.
    // This keeps VirtualPC's corpus vectorized when LM Studio is closed.
    for (let j = 0; j < batch.length; j++) {
      try {
        const r = await fetch(OLLAMA_EMBED_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: batch[j].slice(0, 8000) }),
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) {
          logger.warn(`corpus.embedTexts Ollama fallback: ${r.status} ${await r.text()}`);
          continue;
        }
        const data: any = await r.json();
        out[i + j] = data.embedding || null;
      } catch (e: any) {
        logger.warn(`corpus.embedTexts Ollama fallback failed: ${e.message}`);
      }
    }
  }
  return out;
}

/** Create the corpus vector index if missing. Neo4j 2026.04 syntax with
 *  backtick-escaped option keys (the dotted form 'vector.dimensions' must
 *  be back-quoted in Cypher). Safe to call repeatedly. */
async function ensureVectorIndex(session: any): Promise<void> {
  try {
    await session.run(
      `CREATE VECTOR INDEX corpus_embedding IF NOT EXISTS
       FOR (n:Corpus) ON (n.embedding)
       OPTIONS { indexConfig: { \`vector.dimensions\`: ${EMBEDDING_DIM}, \`vector.similarity_function\`: 'cosine' } }`,
    );
  } catch (e: any) {
    logger.warn(`corpus.ensureVectorIndex failed: ${e.message}`);
  }
}

/** Bootstrap the vector index on virtualpc startup so the very first
 *  corpus.search call finds it (instead of returning empty until an
 *  ingest happens). Called from index.ts after LightRAG connects. */
export async function bootstrapIndex(client: LightRAGClient): Promise<void> {
  if (!client.isConnected()) return;
  const driver = (client as any).driver;
  if (!driver) return;
  const session = driver.session();
  try { await ensureVectorIndex(session); }
  finally { await session.close(); }
}

/** Push a batch of chunks to Neo4j as Corpus nodes. Idempotent on chunk.id.
 *  Stores embedding as a list property so Neo4j 5's vector index can use it. */
export async function ingestChunks(client: LightRAGClient, chunks: CorpusChunk[]): Promise<{ ingested: number; offline: boolean }> {
  if (!client.isConnected()) return { ingested: 0, offline: true };
  const driver = (client as any).driver;
  if (!driver) return { ingested: 0, offline: true };

  // Embed everything first (already embedded chunks pass through unchanged)
  const toEmbed = chunks.filter(c => !c.embedding);
  if (toEmbed.length > 0) {
    const vectors = await embedTexts(toEmbed.map(c => c.content));
    for (let i = 0; i < toEmbed.length; i++) {
      if (vectors[i]) toEmbed[i].embedding = vectors[i] as number[];
    }
  }

  const session = driver.session();
  let ingested = 0;
  try {
    for (const c of chunks) {
      try {
        await session.run(
          `MERGE (n:Corpus {id: $id})
           ON CREATE SET n.created_at = datetime()
           SET n.source = $source,
               n.source_kind = $source_kind,
               n.title = $title,
               n.content = $content,
               n.embedding = $embedding,
               n.updated_at = datetime()`,
          {
            id: c.id,
            source: c.source,
            source_kind: c.source_kind,
            title: c.title || null,
            content: c.content,
            embedding: c.embedding || null,
          },
        );
        ingested++;
      } catch (e: any) {
        logger.warn(`corpus ingest failed for ${c.id}: ${e.message}`);
      }
    }
    // Ensure the vector index exists (idempotent)
    await ensureVectorIndex(session);
  } finally {
    await session.close();
  }
  return { ingested, offline: false };
}

/** Hybrid search: vector similarity + lexical exact/term overlap.
 *  Returns top-k passages with scores. */
export async function search(
  client: LightRAGClient,
  query: string,
  opts: { k?: number; sourceKind?: CorpusChunk['source_kind']; minScore?: number } = {},
): Promise<Array<{ id: string; source: string; source_kind: string; title?: string; content: string; score: number }>> {
  if (!client.isConnected()) return [];
  const driver = (client as any).driver;
  if (!driver) return [];
  const k = opts.k || 8;

  // Embed the query
  const qVec = (await embedTexts([query]))[0];
  logger.info(`corpus.search(q="${query.slice(0,50)}", k=${k}) qVec=${qVec ? `dim=${qVec.length}` : 'null'}`);
  const session = driver.session();
  try {
    const merged = new Map<string, { id: string; source: string; source_kind: string; title?: string; content: string; score: number }>();
    const upsert = (hit: { id: string; source: string; source_kind: string; title?: string; content: string; score: number }) => {
      const existing = merged.get(hit.id);
      if (!existing || hit.score > existing.score) merged.set(hit.id, hit);
    };
    const n = (v: any) => v?.toNumber?.() ?? Number(v || 0);
    const sourceKind = opts.sourceKind || null;
    const candidateLimit = neo4jInt(Math.max(k * 4, k));

    if (qVec) {
      const result = await session.run(
        `
        CALL db.index.vector.queryNodes('corpus_embedding', $k, $q)
        YIELD node, score
        WHERE $sourceKind IS NULL OR node.source_kind = $sourceKind
        RETURN node.id AS id, node.source AS source, node.source_kind AS sk, node.title AS title, node.content AS content, score
        ORDER BY score DESC
        LIMIT $k`,
        { k: candidateLimit, q: qVec, sourceKind },
      );
      for (const r of result.records) {
        upsert({
          id: r.get('id'),
          source: r.get('source'),
          source_kind: r.get('sk'),
          title: r.get('title') || undefined,
          content: r.get('content'),
          score: typeof r.get('score') === 'number' ? r.get('score') : n(r.get('score')),
        });
      }
    }

    const phrase = query.toLowerCase().trim();
    const terms = Array.from(new Set((phrase.match(/[\p{L}\p{N}_:-]{3,}/gu) || []).slice(0, 16)));
    if (phrase || terms.length > 0) {
      const keyword = await session.run(
        `
        MATCH (n:Corpus)
        WHERE ($sourceKind IS NULL OR n.source_kind = $sourceKind)
          AND (
            toLower(n.content) CONTAINS $phrase
            OR toLower(n.source) CONTAINS $phrase
            OR toLower(coalesce(n.title, '')) CONTAINS $phrase
            OR any(term IN $terms WHERE
              toLower(n.content) CONTAINS term
              OR toLower(n.source) CONTAINS term
              OR toLower(coalesce(n.title, '')) CONTAINS term
            )
          )
        WITH n,
          CASE WHEN
            toLower(n.content) CONTAINS $phrase
            OR toLower(n.source) CONTAINS $phrase
            OR toLower(coalesce(n.title, '')) CONTAINS $phrase
          THEN 1 ELSE 0 END AS exact,
          size([term IN $terms WHERE
            toLower(n.content) CONTAINS term
            OR toLower(n.source) CONTAINS term
            OR toLower(coalesce(n.title, '')) CONTAINS term
          ]) AS hitCount
        RETURN n.id AS id, n.source AS source, n.source_kind AS sk,
               n.title AS title, n.content AS content, exact, hitCount
        ORDER BY exact DESC, hitCount DESC, n.updated_at DESC
        LIMIT $k`,
        { k: candidateLimit, sourceKind, phrase, terms },
      );
      for (const r of keyword.records) {
        const exact = n(r.get('exact'));
        const hitCount = n(r.get('hitCount'));
        const lexicalScore = exact
          ? 1
          : Math.min(0.98, 0.82 + Math.min(hitCount, 8) * 0.04);
        upsert({
          id: r.get('id'),
          source: r.get('source'),
          source_kind: r.get('sk'),
          title: r.get('title') || undefined,
          content: r.get('content'),
          score: lexicalScore,
        });
      }
    }

    const results = Array.from(merged.values())
      .filter((x) => !opts.minScore || x.score >= opts.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    logger.info(`corpus.search returned ${results.length} rows`);
    return results;
  } catch (e: any) {
    logger.warn(`corpus.search failed: ${e.message}`);
    return [];
  } finally {
    await session.close();
  }
}

/** Quick stats for the corpus dashboard. */
export async function stats(client: LightRAGClient): Promise<{ total: number; by_kind: Record<string, number>; vector_indexed: number; offline: boolean }> {
  if (!client.isConnected()) return { total: 0, by_kind: {}, vector_indexed: 0, offline: true };
  const driver = (client as any).driver;
  const session = driver.session();
  try {
    const r1 = await session.run(`MATCH (n:Corpus) RETURN n.source_kind AS sk, count(*) AS c`);
    const by_kind: Record<string, number> = {};
    let total = 0;
    for (const rec of r1.records) {
      const sk = rec.get('sk') || 'unknown';
      const c = rec.get('c').toNumber ? rec.get('c').toNumber() : Number(rec.get('c'));
      by_kind[sk] = c;
      total += c;
    }
    const r2 = await session.run(`MATCH (n:Corpus) WHERE n.embedding IS NOT NULL RETURN count(*) AS c`);
    const vIdx = r2.records[0]?.get('c');
    return {
      total,
      by_kind,
      vector_indexed: vIdx?.toNumber ? vIdx.toNumber() : Number(vIdx || 0),
      offline: false,
    };
  } catch (e: any) {
    logger.warn(`corpus.stats failed: ${e.message}`);
    return { total: 0, by_kind: {}, vector_indexed: 0, offline: true };
  } finally {
    await session.close();
  }
}
