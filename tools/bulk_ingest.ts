/**
 * Bulk ingestion CLI for the VirtualPC agent army.
 *
 * Walks a source directory, detects file formats, extracts text, derives
 * relations, tags them with fiber/domain metadata, and writes one JSON bundle
 * per source file to the output directory.
 *
 * Usage:
 *   npx ts-node tools/bulk_ingest.ts \\
 *     --source-dir ./corpus/dama \\
 *     --fiber data \\
 *     --domains governance,quality \\
 *     --originator "virtualpc-agent-army" \\
 *     --output-dir ./out/bundles
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { buildSource, compileSource } from '../src/ingest/compiler';
import { IngestError } from '../src/ingest/types';

interface CliArgs {
  sourceDir: string;
  outputDir: string;
  fiber: string;
  domains: string[];
  originator: string;
  extensions: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const sourceDir = get('--source-dir');
  const outputDir = get('--output-dir');
  const fiber = get('--fiber');
  const originator = get('--originator') || 'virtualpc-ingest';
  const domains = get('--domains')?.split(',').map((d) => d.trim()).filter(Boolean) || [];
  const extensions = get('--extensions')?.split(',').map((e) => e.trim().toLowerCase()) || [
    '.txt', '.json', '.html', '.htm', '.md', '.pdf',
  ];

  if (!sourceDir || !outputDir || !fiber) {
    console.error('Usage: npx ts-node tools/bulk_ingest.ts --source-dir <dir> --output-dir <dir> --fiber <fiber> [--domains a,b] [--originator <name>]');
    process.exit(1);
  }

  return { sourceDir, outputDir, fiber, domains, originator, extensions };
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function listSourceFiles(dir: string, extensions: string[]): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (extensions.includes(ext)) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files.sort();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  await ensureDir(args.outputDir);

  const files = await listSourceFiles(args.sourceDir, args.extensions);
  if (files.length === 0) {
    console.warn(`No matching files found in ${args.sourceDir}`);
    return;
  }

  let processed = 0;
  let errors = 0;
  let totalRelations = 0;

  for (const filePath of files) {
    try {
      const source = buildSource(filePath, args.fiber, args.domains, args.originator);
      const result = await compileSource(source);
      const baseName = path.basename(filePath, path.extname(filePath));
      const outPath = path.join(args.outputDir, `${baseName}.bundle.json`);
      await fs.writeFile(outPath, JSON.stringify(result.bundle, null, 2));
      console.log(`✓ ${filePath} → ${outPath} (${result.relationCount} relations)`);
      processed += 1;
      totalRelations += result.relationCount;
    } catch (err) {
      errors += 1;
      const message = err instanceof IngestError ? err.message : String(err);
      console.error(`✗ ${filePath}: ${message}`);
    }
  }

  console.log(`\nDone. Processed ${processed}/${files.length} files, ${totalRelations} relations, ${errors} errors.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
