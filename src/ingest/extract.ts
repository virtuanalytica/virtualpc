import * as fs from 'fs/promises';
import { Source, SourceFormat, IngestError } from './types';

/**
 * Extract plain text from a Source.
 *
 * Dispatches to a format-specific adapter. The returned text is trimmed and
 * normalised (runs of whitespace collapsed) so downstream relation extraction
 * does not need to worry about formatting noise.
 */
export async function extractText(source: Source): Promise<string> {
  switch (source.format) {
    case SourceFormat.TXT:
      return extractTxt(source.path);
    case SourceFormat.JSON:
      return extractJson(source.path);
    case SourceFormat.HTML:
      return extractHtml(source.path);
    case SourceFormat.PDF:
      return extractPdf(source.path);
    default:
      throw new IngestError(`unsupported source format: ${source.format}`);
  }
}

async function readBuffer(filePath: string): Promise<Buffer> {
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    throw new IngestError(`cannot read source file: ${filePath}`);
  }
}

async function extractTxt(filePath: string): Promise<string> {
  const buffer = await readBuffer(filePath);
  return normaliseText(buffer.toString('utf-8'));
}

async function extractJson(filePath: string): Promise<string> {
  const buffer = await readBuffer(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString('utf-8'));
  } catch {
    throw new IngestError(`invalid JSON in ${filePath}`);
  }
  const strings = flattenJson(parsed);
  return normaliseText(strings.join(' '));
}

function flattenJson(value: unknown, out: string[] = []): string[] {
  if (value === null || value === undefined) {
    return out;
  }
  if (typeof value === 'string') {
    out.push(value);
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    value.forEach((item) => flattenJson(item, out));
  } else if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      flattenJson(item, out),
    );
  }
  return out;
}

async function extractHtml(filePath: string): Promise<string> {
  const buffer = await readBuffer(filePath);
  const raw = buffer.toString('utf-8');
  // Lightweight server-side HTML-to-text: remove script/style tags and tags.
  const noScripts = raw.replace(
    /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,
    ' ',
  );
  const text = noScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;/g, (entity) => {
      switch (entity) {
        case '&nbsp;':
          return ' ';
        case '&amp;':
          return '&';
        case '&lt;':
          return '<';
        case '&gt;':
          return '>';
        case '&quot;':
          return '"';
        default:
          return entity;
      }
    });
  return normaliseText(text);
}

async function extractPdf(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfParse: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfParse = require('pdf-parse');
  } catch {
    throw new IngestError(
      'PDF extraction requires the optional dependency "pdf-parse". Install it with: npm install pdf-parse',
    );
  }
  const buffer = await readBuffer(filePath);
  try {
    const result = await pdfParse(buffer);
    return normaliseText(result.text);
  } catch (err) {
    throw new IngestError(`failed to parse PDF ${filePath}: ${err}`);
  }
}

function normaliseText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\n\f\r ]+/g, ' ')
    .trim();
}
