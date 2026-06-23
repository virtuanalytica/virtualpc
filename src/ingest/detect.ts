import * as path from 'path';
import { SourceFormat } from './types';

const EXTENSION_FORMAT: Record<string, SourceFormat> = {
  '.pdf': SourceFormat.PDF,
  '.html': SourceFormat.HTML,
  '.htm': SourceFormat.HTML,
  '.json': SourceFormat.JSON,
  '.txt': SourceFormat.TXT,
  '.md': SourceFormat.TXT,
  '.markdown': SourceFormat.TXT,
};

/**
 * Detect the source format from a file path.
 *
 * Detection is based on the lower-case extension. Unknown extensions return
 * `SourceFormat.UNKNOWN` so callers can decide whether to reject or apply a
 * custom parser.
 */
export function detectFormat(filePath: string): SourceFormat {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_FORMAT[ext] ?? SourceFormat.UNKNOWN;
}
