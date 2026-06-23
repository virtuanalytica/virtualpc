/**
 * Types for the VirtualPC body-of-knowledge ingestion pipeline.
 *
 * A Source represents a single raw document plus its intended semantic tagging
 * (fiber and domain tags). The extraction layer turns a Source into plain text
 * so relation extraction can operate on a uniform string.
 */

export enum SourceFormat {
  PDF = 'pdf',
  HTML = 'html',
  JSON = 'json',
  TXT = 'txt',
  UNKNOWN = 'unknown',
}

export interface Source {
  /** Absolute path to the raw file on disk. */
  path: string;
  /** Detected or declared format. */
  format: SourceFormat;
  /** Top-level semantic fiber (e.g. "data", "chem", "academic"). */
  fiber: string;
  /** Normalised domain sub-tags (e.g. "data-governance"). */
  domains: string[];
  /** Optional content identifier; derived from path if omitted. */
  assetCid?: string;
  /** Entity responsible for the source assertion. */
  originator: string;
  /** Free-form metadata (title, url, licence, etc.). */
  metadata?: Record<string, unknown>;
}

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}
