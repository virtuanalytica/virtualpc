/**
 * VirtuAnalytica — catalog normalization.
 *
 * Turns a customer metadata export (Collibra CSV/JSON or a generic catalog JSON)
 * into the canonical `CatalogModel` shape owned by role-graph.ts, and maps that
 * model into the platform governance registry.
 *
 * No new runtime dependency: the Collibra-CSV path uses a tiny, forgiving CSV
 * splitter (handles double-quoted fields with embedded commas / quotes) defined
 * here. Imported objects are real customer metadata — never synthetic. The only
 * sample data in this product is the clearly-labeled bundled demo catalog on
 * disk (data/virtuanalytica-sample-catalog.json), loaded by the route layer.
 */

import logger from '../utils/logger';
import * as governance from '../integrations/governance';
import type {
  CatalogModel,
  CatalogAsset,
  CatalogColumn,
  CatalogTerm,
  CatalogClassification,
  CatalogOwner,
  CatalogLineage,
  CatalogPolicy,
} from './role-graph';

export type CatalogFormat = 'collibra-json' | 'collibra-csv' | 'generic-json';

/** Counts for the import response envelope. */
export interface CatalogCounts {
  assets: number;
  columns: number;
  terms: number;
  classifications: number;
  owners: number;
  lineage: number;
  policies: number;
}

export function countModel(model: CatalogModel): CatalogCounts {
  return {
    assets: (model.assets || []).length,
    columns: (model.columns || []).length,
    terms: (model.glossaryTerms || []).length,
    classifications: (model.classifications || []).length,
    owners: (model.owners || []).length,
    lineage: (model.lineage || []).length,
    policies: (model.policies || []).length,
  };
}

/** Build an empty, well-formed model. */
function emptyModel(source: 'collibra' | 'generic'): CatalogModel {
  return {
    importedAt: new Date().toISOString(),
    source,
    assets: [],
    columns: [],
    glossaryTerms: [],
    classifications: [],
    owners: [],
    lineage: [],
    policies: [],
  };
}

// ---------------------------------------------------------------------------
// Tiny, forgiving CSV parser (no dependency).
// ---------------------------------------------------------------------------
/**
 * Parse CSV text into rows of string cells. Handles:
 *   - double-quoted fields containing commas, newlines and escaped quotes ("")
 *   - CRLF or LF line endings
 * It is intentionally forgiving: malformed quoting degrades to best-effort.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  // flush trailing field/row (unless the file ended on a clean newline)
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

/**
 * Parse a Collibra-style CSV export into a CatalogModel.
 *
 * Documented column convention (case-insensitive headers; all optional except a
 * name/asset identifier). One flat sheet describes assets + their columns +
 * glossary attachments, the common "asset inventory" export shape:
 *
 *   asset_id | asset | type | system | schema | description | owner |
 *   term | classification | column | column_type | pii
 *
 * Rows that share an asset_id (or asset name) are merged into one asset; the
 * `column` / `term` / `classification` cells add child objects. A row with only
 * a `term` (no asset) registers a stand-alone glossary term.
 */
export function parseCollibraCsv(text: string): CatalogModel {
  const model = emptyModel('collibra');
  const rows = parseCsv(text);
  if (rows.length < 2) return model; // header only / empty

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    assetId: col('asset_id'),
    asset: col('asset') >= 0 ? col('asset') : col('asset_name'),
    type: col('type') >= 0 ? col('type') : col('asset_type'),
    system: col('system'),
    schema: col('schema'),
    description: col('description'),
    owner: col('owner') >= 0 ? col('owner') : col('owner_name'),
    term: col('term') >= 0 ? col('term') : col('glossary_term'),
    classification: col('classification'),
    column: col('column') >= 0 ? col('column') : col('column_name'),
    columnType: col('column_type') >= 0 ? col('column_type') : col('data_type'),
    pii: col('pii'),
  };

  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? (r[i] || '').trim() : '');
  const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';

  const assetById = new Map<string, CatalogAsset>();
  const termByName = new Map<string, CatalogTerm>();
  const classByName = new Map<string, CatalogClassification>();
  const ownerByName = new Map<string, CatalogOwner>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const assetName = cell(row, idx.asset);
    const explicitId = cell(row, idx.assetId);
    const termName = cell(row, idx.term);
    const className = cell(row, idx.classification);
    const ownerName = cell(row, idx.owner);

    // Resolve / register a glossary term for this row, if any.
    let termId: string | undefined;
    if (termName) {
      let t = termByName.get(termName.toLowerCase());
      if (!t) { t = { id: `t_${slug(termName)}`, name: termName }; termByName.set(termName.toLowerCase(), t); }
      termId = t.id;
    }
    // Resolve / register a classification, if any.
    let classId: string | undefined;
    if (className) {
      let c = classByName.get(className.toLowerCase());
      if (!c) { c = { id: `c_${slug(className)}`, name: className }; classByName.set(className.toLowerCase(), c); }
      classId = c.id;
    }
    // Resolve / register an owner, if any.
    let ownerId: string | undefined;
    if (ownerName) {
      let o = ownerByName.get(ownerName.toLowerCase());
      if (!o) { o = { id: `o_${slug(ownerName)}`, name: ownerName }; ownerByName.set(ownerName.toLowerCase(), o); }
      ownerId = o.id;
    }

    // No asset on this row → it was a stand-alone term/classification row.
    if (!assetName && !explicitId) continue;

    const assetKey = explicitId || `a_${slug(assetName)}`;
    let asset = assetById.get(assetKey);
    if (!asset) {
      asset = {
        id: assetKey,
        name: assetName || assetKey,
        type: cell(row, idx.type) || undefined,
        system: cell(row, idx.system) || undefined,
        schema: cell(row, idx.schema) || undefined,
        description: cell(row, idx.description) || undefined,
        ownerIds: [],
        termIds: [],
        classificationIds: [],
      };
      assetById.set(assetKey, asset);
    }
    if (ownerId && !asset.ownerIds!.includes(ownerId)) asset.ownerIds!.push(ownerId);
    if (termId && !asset.termIds!.includes(termId)) asset.termIds!.push(termId);
    if (classId && !asset.classificationIds!.includes(classId)) asset.classificationIds!.push(classId);

    // A column on this row.
    const columnName = cell(row, idx.column);
    if (columnName) {
      const colId = `${assetKey}__${slug(columnName)}`;
      if (!model.columns.some((c) => c.id === colId)) {
        const colObj: CatalogColumn = {
          id: colId,
          assetId: assetKey,
          name: columnName,
          dataType: cell(row, idx.columnType) || undefined,
          piiFlag: /^(1|true|yes|y)$/i.test(cell(row, idx.pii)),
          termIds: termId ? [termId] : undefined,
        };
        model.columns.push(colObj);
      }
    }
  }

  model.assets = Array.from(assetById.values());
  model.glossaryTerms = Array.from(termByName.values());
  model.classifications = Array.from(classByName.values());
  model.owners = Array.from(ownerByName.values());
  return model;
}

/**
 * Coerce any object into a CatalogModel. Accepts:
 *   - a wrapped doc `{ model: {...} }` (the sample-catalog shape),
 *   - a bare CatalogModel,
 *   - a generic catalog JSON with loosely-named arrays (assets/datasets/tables,
 *     terms/glossary, classifications/tags, owners, lineage, policies).
 */
export function normalizeGenericJson(input: any, source: 'collibra' | 'generic' = 'generic'): CatalogModel {
  const doc = input && typeof input === 'object' && input.model ? input.model : input;
  const model = emptyModel(source);
  if (!doc || typeof doc !== 'object') return model;

  const firstArray = (...keys: string[]): any[] => {
    for (const k of keys) if (Array.isArray(doc[k])) return doc[k] as any[];
    return [];
  };
  const str = (v: any): string | undefined => (v === undefined || v === null ? undefined : String(v));
  const idOf = (o: any, prefix: string, i: number): string => str(o?.id) || str(o?.uuid) || `${prefix}_${i}`;

  if (typeof doc.importedAt === 'string') model.importedAt = doc.importedAt;
  if (doc.source === 'collibra' || doc.source === 'generic') model.source = doc.source;

  model.assets = firstArray('assets', 'datasets', 'tables').map((a: any, i: number): CatalogAsset => ({
    id: idOf(a, 'a', i),
    name: str(a?.name) || str(a?.displayName) || idOf(a, 'a', i),
    type: str(a?.type),
    system: str(a?.system) || str(a?.source),
    schema: str(a?.schema),
    description: str(a?.description),
    ownerIds: Array.isArray(a?.ownerIds) ? a.ownerIds.map(String) : undefined,
    termIds: Array.isArray(a?.termIds) ? a.termIds.map(String) : undefined,
    classificationIds: Array.isArray(a?.classificationIds) ? a.classificationIds.map(String) : undefined,
    tags: Array.isArray(a?.tags) ? a.tags.map(String) : undefined,
  }));

  model.columns = firstArray('columns', 'fields').map((c: any, i: number): CatalogColumn => ({
    id: idOf(c, 'col', i),
    assetId: str(c?.assetId) || str(c?.tableId) || '',
    name: str(c?.name) || idOf(c, 'col', i),
    dataType: str(c?.dataType) || str(c?.type),
    piiFlag: !!c?.piiFlag,
    termIds: Array.isArray(c?.termIds) ? c.termIds.map(String) : undefined,
  }));

  model.glossaryTerms = firstArray('glossaryTerms', 'terms', 'glossary').map((t: any, i: number): CatalogTerm => ({
    id: idOf(t, 't', i),
    name: str(t?.name) || idOf(t, 't', i),
    definition: str(t?.definition) || str(t?.description),
    domain: str(t?.domain),
    stewardId: str(t?.stewardId),
  }));

  model.classifications = firstArray('classifications', 'tags', 'labels').map((c: any, i: number): CatalogClassification => ({
    id: idOf(c, 'c', i),
    name: str(c?.name) || idOf(c, 'c', i),
    scheme: str(c?.scheme),
  }));

  model.owners = firstArray('owners', 'stewards', 'people').map((o: any, i: number): CatalogOwner => ({
    id: idOf(o, 'o', i),
    name: str(o?.name) || idOf(o, 'o', i),
    role: str(o?.role),
  }));

  model.lineage = firstArray('lineage', 'edges').map((l: any, i: number): CatalogLineage => ({
    id: idOf(l, 'l', i),
    fromAssetId: str(l?.fromAssetId) || str(l?.from) || '',
    toAssetId: str(l?.toAssetId) || str(l?.to) || '',
    kind: str(l?.kind),
    inferred: !!l?.inferred,
    evidence: str(l?.evidence),
  })).filter((l: CatalogLineage) => l.fromAssetId && l.toAssetId);

  model.policies = firstArray('policies', 'rules').map((p: any, i: number): CatalogPolicy => ({
    id: idOf(p, 'p', i),
    name: str(p?.name) || idOf(p, 'p', i),
    kind: str(p?.kind),
    appliesToAssetIds: Array.isArray(p?.appliesToAssetIds) ? p.appliesToAssetIds.map(String) : undefined,
  }));

  return model;
}

/**
 * Normalize a payload according to `format` into a CatalogModel. `payload` may
 * already be a parsed object (JSON) or a raw string (JSON text / CSV text).
 */
export function normalize(payload: string | object, format: CatalogFormat): CatalogModel {
  if (format === 'collibra-csv') {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return parseCollibraCsv(text);
  }
  // collibra-json | generic-json
  let obj: any = payload;
  if (typeof payload === 'string') {
    try { obj = JSON.parse(payload); }
    catch (e: any) { throw new Error(`payload is not valid JSON: ${e.message}`); }
  }
  const source = format === 'collibra-json' ? 'collibra' : 'generic';
  return normalizeGenericJson(obj, source);
}

// ---------------------------------------------------------------------------
// Governance registry mapping.
// ---------------------------------------------------------------------------
function slugId(prefix: string, raw: string): string {
  const base = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
  return `${prefix}-${base}`;
}

/**
 * Map a CatalogModel into the governance registry: each asset becomes a
 * `schema` entry, each glossary term a `wiki-term` entry. Returns the list of
 * upserted GovernanceEntry objects (so the route can fire the graph hook for
 * each). Idempotent — registerEntry upserts by id.
 */
export function upsertModelToGovernance(model: CatalogModel, source: string): governance.GovernanceEntry[] {
  const now = new Date().toISOString();
  const out: governance.GovernanceEntry[] = [];

  const ownerName = new Map<string, string>();
  for (const o of model.owners || []) ownerName.set(o.id, o.name);

  for (const a of model.assets || []) {
    const owner = (a.ownerIds || []).map((id) => ownerName.get(id)).filter(Boolean)[0] || 'VirtuAnalytica';
    const lineageNote = [a.system, a.schema, a.type].filter(Boolean).join(' · ');
    const entry = governance.registerEntry({
      id: slugId('va-asset', a.id),
      name: a.name,
      kind: 'schema',
      owner,
      source: `virtuanalytica:${source}:${a.id}`,
      lineage: a.description || lineageNote || `Imported ${source} catalog asset.`,
      updatedAt: now,
      tags: ['virtuanalytica', 'catalog', source, ...(a.tags || [])],
    });
    out.push(entry);
  }

  for (const t of model.glossaryTerms || []) {
    const entry = governance.registerEntry({
      id: slugId('va-term', t.id),
      name: t.name,
      kind: 'wiki-term',
      owner: 'VirtuAnalytica',
      source: `virtuanalytica:${source}:${t.id}`,
      lineage: t.definition || `Imported ${source} glossary term.`,
      updatedAt: now,
      tags: ['virtuanalytica', 'glossary', source, ...(t.domain ? [t.domain] : [])],
    });
    out.push(entry);
  }

  logger.info(`virtuanalytica: upserted ${out.length} governance entries from ${source} catalog`);
  return out;
}
