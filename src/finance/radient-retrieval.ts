import { spawn } from 'child_process';
import * as path from 'path';

export interface TextEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface RetrievalDocument {
  id: string;
  text: string;
  publishedAt: string;
  availableAt: string;
  outcome?: number;
}

export interface RetrievedDocument extends RetrievalDocument { similarity: number }

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) throw new Error('Embedding dimensions do not match');
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  const denominator = Math.sqrt(leftNorm * rightNorm);
  return denominator === 0 ? 0 : dot / denominator;
}

export async function retrievePointInTime(
  embedder: TextEmbedder,
  query: string,
  documents: RetrievalDocument[],
  decisionAt: string,
  limit = 5,
): Promise<RetrievedDocument[]> {
  const cutoff = Date.parse(decisionAt);
  if (!Number.isFinite(cutoff)) throw new Error('decisionAt must be an ISO-8601 timestamp');
  const eligible = documents.filter(document => Date.parse(document.availableAt) <= cutoff);
  if (eligible.length === 0) return [];
  const vectors = await embedder.embed([query, ...eligible.map(document => document.text)]);
  if (vectors.length !== eligible.length + 1) throw new Error('Embedder returned an unexpected vector count');
  return eligible
    .map((document, index) => ({ ...document, similarity: cosine(vectors[0], vectors[index + 1]) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(0, limit));
}

/** Optional local Python bridge; no cloud service or API quota is required. */
export class PythonRadientEmbedder implements TextEmbedder {
  constructor(
    private readonly python = process.env.RADIENT_PYTHON ?? 'python3',
    private readonly script = path.join(__dirname, '..', '..', 'scripts', 'finance', 'radient_bridge.py'),
  ) {}

  embed(texts: string[]): Promise<number[][]> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, [this.script], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', code => {
        if (code !== 0) { reject(new Error(`Radient bridge failed (${code}): ${stderr.trim()}`)); return; }
        try {
          const parsed = JSON.parse(stdout) as { vectors: number[][] };
          resolve(parsed.vectors);
        } catch (error) { reject(new Error(`Invalid Radient bridge output: ${String(error)}`)); }
      });
      child.stdin.end(JSON.stringify({ texts }));
    });
  }
}
