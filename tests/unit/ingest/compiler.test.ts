import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { buildSource, compileSource } from '../../../src/ingest/compiler';
import { SourceFormat, IngestError } from '../../../src/ingest/types';

async function withTempFile(ext: string, content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-test-'));
  const filePath = path.join(dir, `source${ext}`);
  await fs.writeFile(filePath, content);
  return filePath;
}

describe('buildSource', () => {
  it('builds a source from a TXT file', async () => {
    const filePath = await withTempFile('.txt', 'hello world');
    const source = buildSource(filePath, 'data', ['data governance'], 'test');
    expect(source.format).toBe(SourceFormat.TXT);
    expect(source.fiber).toBe('data');
    expect(source.domains).toEqual(['data-governance']);
    expect(source.assetCid).toBe(`source:${path.resolve(filePath)}`);
  });

  it('rejects unsupported formats', async () => {
    const filePath = await withTempFile('.bin', '\x00');
    expect(() => buildSource(filePath, 'data', [], 'test')).toThrow(IngestError);
  });
});

describe('compileSource', () => {
  it('compiles a TXT source into a tagged bundle', async () => {
    const filePath = await withTempFile('.txt', 'A database has tables.');
    const source = buildSource(filePath, 'data', ['governance'], 'test');
    const result = await compileSource(source);
    expect(result.bundle.fiber).toBe('data');
    expect(result.bundle.relations.some((r) => r.predicate === 'hasFiber')).toBe(true);
    expect(result.bundle.relations.some((r) => r.predicate === 'has')).toBe(true);
    expect(result.relationCount).toBeGreaterThan(0);
  });

  it('compiles a JSON source into a tagged bundle', async () => {
    const filePath = await withTempFile('.json', JSON.stringify({ title: 'DAMA', body: 'DAMA is a guide.' }));
    const source = buildSource(filePath, 'data', ['governance'], 'test');
    const result = await compileSource(source);
    expect(result.bundle.relations.some((r) => r.object === 'guide')).toBe(true);
  });
});
