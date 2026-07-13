#!/usr/bin/env node
/**
 * ingest-corpus.js — build the semantic-knowledge corpus from local sources.
 *
 * What lands as Corpus nodes:
 *   - virtualpc/src/**.ts        (kind: code)
 *   - virtualpc/docs/*.md        (kind: doc)
 *   - virtualpc/scripts/*.{js,sh} (kind: code)
 *   - virtualpc-knowledge/*.md   (kind: doc)
 *   - alexander-knowledge/*.md   (kind: doc)
 *   - molgang-web/api/**.py      (kind: code)
 *   - molgang-web/frontend/app/**.tsx (kind: code)
 *   - molgang-web/shared/*.json  (kind: shared-data)
 *
 * Each file is chunked into ~1.2 KB passages, embedded via the local
 * nomic-embed model through LiteLLM, and inserted into Neo4j Corpus
 * nodes via /api/corpus/ingest.
 *
 * Usage: node scripts/ingest-corpus.js [--dry-run]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const VIRTUALPC_URL = process.env.VIRTUALPC_URL || 'http://127.0.0.1:3100';
const DRY = process.argv.includes('--dry-run');

const ROOTS = [
  { dir: '/home/knight2/virtualpc/src',           glob: /\.(ts|tsx|js|mjs)$/, kind: 'code' },
  { dir: '/home/knight2/virtualpc/docs',          glob: /\.md$/,              kind: 'doc' },
  { dir: '/home/knight2/virtualpc/scripts',       glob: /\.(js|sh|py)$/,      kind: 'code' },
  { dir: '/home/knight2/virtualpc-knowledge',     glob: /\.(md|rst|txt)$/,    kind: 'doc' },
  { dir: '/home/knight2/alexander-knowledge',     glob: /\.(md|rst|txt)$/,    kind: 'doc' },
  { dir: '/media/knight2/EDS2/projects/molgang-web/api',     glob: /\.py$/,   kind: 'code' },
  { dir: '/media/knight2/EDS2/projects/molgang-web/frontend/app', glob: /\.(tsx|ts)$/, kind: 'code' },
  { dir: '/media/knight2/EDS2/projects/molgang-web/shared',  glob: /\.json$/, kind: 'shared-data' },
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__pycache__', '.next', 'build', '.venv', 'venv', 'env', 'site-packages', 'tests', 'examples']);
const MAX_FILE_BYTES = 240 * 1024;  // 240 KB cap — anything bigger is generated/minified

function walk(root) {
  const out = [];
  const stack = [root.dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(full);
      } else if (e.isFile() && root.glob.test(e.name)) {
        try {
          const stat = fs.statSync(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          out.push({ path: full, kind: root.kind, size: stat.size });
        } catch { /* skip */ }
      }
    }
  }
  return out;
}

const CHUNK_TARGET = 1200;
const CHUNK_OVERLAP = 150;

function chunkText(text, source, sourceKind) {
  if (!text || text.length < 50) return [];
  const out = [];
  // Paragraph-aware split with merging up to target size
  const paras = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  let buf = '';
  let idx = 0;
  for (const p of paras) {
    if (buf.length + p.length > CHUNK_TARGET && buf.length > CHUNK_TARGET - CHUNK_OVERLAP) {
      out.push({ id: `${source}#${idx}`, source, source_kind: sourceKind, content: buf.trim() });
      idx++;
      const tail = buf.slice(-CHUNK_OVERLAP);
      const cut = Math.max(tail.lastIndexOf('. '), tail.lastIndexOf('\n'), 0);
      buf = tail.slice(cut).trim() + '\n\n' + p;
    } else {
      buf += (buf ? '\n\n' : '') + p;
    }
  }
  if (buf.trim().length > 0) out.push({ id: `${source}#${idx}`, source, source_kind: sourceKind, content: buf.trim() });
  return out;
}

function shorten(p) {
  // Make source paths repo-relative for nicer ids
  return p
    .replace('/home/knight2/virtualpc/', 'virtualpc:')
    .replace('/home/knight2/virtualpc-knowledge/', 'virtualpc-knowledge:')
    .replace('/home/knight2/alexander-knowledge/', 'alexander-knowledge:')
    .replace('/media/knight2/EDS2/projects/molgang-web/', 'molgang-web:')
    .replace(/\//g, '/');
}

async function postChunks(chunks) {
  const data = JSON.stringify({ chunks });
  return new Promise((resolve, reject) => {
    const u = new URL(VIRTUALPC_URL + '/api/corpus/ingest');
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
      timeout: 240000,
    }, (res) => {
      const buf = [];
      res.on('data', c => buf.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(buf).toString('utf8'))); }
        catch (e) { resolve({ raw: Buffer.concat(buf).toString('utf8') }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data); req.end();
  });
}

(async () => {
  console.log(`▶ corpus ingest scan${DRY ? ' (DRY-RUN)' : ''}`);
  let allChunks = [];
  let totalFiles = 0;
  let totalBytes = 0;
  for (const root of ROOTS) {
    const files = walk(root);
    for (const f of files) {
      try {
        const text = fs.readFileSync(f.path, 'utf8');
        const chunks = chunkText(text, shorten(f.path), root.kind);
        allChunks = allChunks.concat(chunks);
        totalFiles++;
        totalBytes += f.size;
      } catch (e) { console.warn('  ! read failed:', f.path); }
    }
    console.log(`  ${root.kind.padEnd(12)} ${files.length} files in ${root.dir.replace('/home/knight2/','~/')}`);
  }
  console.log(`▶ scanned ${totalFiles} files (${(totalBytes/1024).toFixed(1)} KB) → ${allChunks.length} chunks`);
  if (DRY) {
    console.log('(dry-run, no ingest)');
    return;
  }
  // Push in batches of 50 — nomic-embed handles batches of 16; the route
  // sub-batches itself. 50/batch keeps single-request size sane.
  const batchSize = 50;
  let ingested = 0;
  for (let i = 0; i < allChunks.length; i += batchSize) {
    const slice = allChunks.slice(i, i + batchSize);
    const r = await postChunks(slice);
    if (r.success) {
      ingested += r.ingested;
      process.stdout.write(`\r  ingested ${ingested}/${allChunks.length}…`);
    } else {
      console.warn(`\n  ! batch ${i/batchSize} failed: ${r.error || JSON.stringify(r).slice(0,200)}`);
    }
  }
  console.log(`\n✓ done — ${ingested} corpus nodes in Neo4j`);
})();
