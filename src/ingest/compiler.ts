import * as path from 'path';
import { detectFormat } from './detect';
import { extractText } from './extract';
import { extractRelations } from './relations';
import { tagBundle, TaggedBundle } from './tagger';
import { IngestError, Source, SourceFormat } from './types';

export interface CompileResult {
  bundle: TaggedBundle;
  relationCount: number;
}

/**
 * Compile a single Source into a TaggedBundle.
 *
 * Pipeline: detect format → extract text → extract relations → tag with
 * fiber/domain metadata.
 */
export async function compileSource(source: Source): Promise<CompileResult> {
  if (source.format === SourceFormat.UNKNOWN) {
    throw new IngestError(`cannot compile source with unknown format: ${source.path}`);
  }

  const text = await extractText(source);
  const relations = extractRelations(text, source);
  const bundle = tagBundle(source, relations);

  return {
    bundle,
    relationCount: relations.length,
  };
}

/**
 * Build a Source value from a file path and tagging metadata.
 */
export function buildSource(
  filePath: string,
  fiber: string,
  domains: string[],
  originator: string,
  metadata?: Record<string, unknown>,
): Source {
  const format = detectFormat(filePath);
  if (format === SourceFormat.UNKNOWN) {
    throw new IngestError(`unsupported file format: ${filePath}`);
  }
  return {
    path: path.resolve(filePath),
    format,
    fiber,
    domains: domains.map((d) => d.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean),
    assetCid: `source:${path.resolve(filePath)}`,
    originator,
    metadata,
  };
}
