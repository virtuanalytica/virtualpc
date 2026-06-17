#!/usr/bin/env node
/**
 * push-corpus-chunks.js — push a {chunks:[...]} JSON into the LIVE Neo4j corpus
 * using VirtualPC's own corpus module, over a FRESH independent Neo4j connection.
 *
 * This deliberately does NOT go through the running :3100 app — it connects
 * straight to Neo4j (bolt) so it works even when that process is in offline mode.
 * ingestChunks() is idempotent (MERGE on chunk.id) and additive, and embeds each
 * chunk via LM Studio / Ollama nomic-embed (degrading to keyword-only on failure).
 *
 * Usage: node scripts/push-corpus-chunks.js <chunks.json>
 *   chunks.json is either {"chunks":[...]} or a bare [...] array of CorpusChunk.
 */
'use strict';
const fs = require('fs');
const { LightRAGClient } = require('../dist/integrations/lightrag/client');
const corpus = require('../dist/integrations/corpus');

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('usage: push-corpus-chunks.js <chunks.json>'); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const chunks = Array.isArray(data) ? data : (data.chunks || []);
  if (!chunks.length) { console.error('no chunks in', file); process.exit(2); }

  const client = new LightRAGClient({
    neo4j_url: process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j_username: process.env.NEO4J_USER || 'neo4j',
    neo4j_password: process.env.NEO4J_PASSWORD || 'virtualpc-neo4j-pass',
  });
  await client.connect();
  if (!client.isConnected()) { console.error('Neo4j not reachable on bolt'); process.exit(1); }

  await corpus.bootstrapIndex(client);            // ensure corpus_embedding index (idempotent)
  const r = await corpus.ingestChunks(client, chunks);
  const embedded = chunks.filter((c) => Array.isArray(c.embedding) && c.embedding.length).length;
  console.log(JSON.stringify({ file, chunks: chunks.length, embedded, ...r }));
  await client.close();
})().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
