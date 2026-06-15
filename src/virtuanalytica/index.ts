/**
 * VirtuAnalytica — backend routes (FROZEN contract; see docs/VIRTUANALYTICA-API.md).
 *
 * Mounts /api/virtuanalytica/* :
 *   Tier 0  — health, product/tier state, roles, categories, i18n
 *   Tier 1  — per-role 3D graph (via role-graph.ts) + catalog import/browse
 *   Tier 2  — DB connections (locked stub, demo-safe profiling of repo JSON)
 *   Tier 3  — tools (locked stub, simulated runs unless explicitly enabled)
 *
 * Shared services are reached LAZILY through req.app.locals (the LightRAG client
 * + governance graph hooks are attached AFTER route registration, on connect).
 * Everything degrades gracefully when LightRAG/Neo4j is offline: the role graph
 * returns empty, governance hooks are skipped, and no handler ever crashes.
 *
 * This module does NOT re-implement the role graph — it imports the
 * orchestrator-owned role-graph.ts. It does NOT touch a shell or live DB: Tier-2
 * profiling runs against the repo's own data/*.json, and Tier-3 runs are
 * simulated unless real execution is explicitly enabled.
 */

import type { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import type { LightRAGClient } from '../integrations/lightrag/client';
import { profileDataset } from '../data-quality/profiler';

import {
  listRoles,
  getCategories,
  getI18n,
  getRoleGraph3D,
  ingestCatalogModel,
  ROLE_KEYS,
} from './role-graph';
import type { CatalogModel, RoleKey } from './role-graph';

import * as store from './store';
import * as catalog from './catalog';
import * as roles from './roles';
import * as commerce from './commerce';
import * as rolesCatalog from './roles-catalog';
import * as capabilitiesCatalog from './capabilities-catalog';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SAMPLE_CATALOG_PATH = path.join(DATA_DIR, 'virtuanalytica-sample-catalog.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ok(res: Response, data: Record<string, any>): void {
  res.json({ success: true, ...data });
}
function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ success: false, error });
}

/** Lazily read the LightRAG client off app.locals (attached after registration). */
function lr(req: Request): LightRAGClient | null {
  const c = (req.app as any).locals?.lightrag;
  return c && typeof c.isConnected === 'function' ? (c as LightRAGClient) : null;
}

/** Best-effort governance graph notify; never fails the request. */
async function notifyGovernance(req: Request, entry: any): Promise<void> {
  try {
    const hooks = (req.app as any).locals?.governanceGraphHooks;
    const client = lr(req);
    if (hooks?.notifyGovernanceWrite && client) await hooks.notifyGovernanceWrite(client, entry);
  } catch (e: any) {
    logger.warn(`virtuanalytica: governance graph notify failed: ${e.message}`);
  }
}

/** Load the bundled demo catalog (CatalogModel under a top-level `model` key). */
function loadSampleModel(): CatalogModel {
  const doc = JSON.parse(fs.readFileSync(SAMPLE_CATALOG_PATH, 'utf8'));
  return catalog.normalizeGenericJson(doc, (doc?.model?.source === 'collibra' ? 'collibra' : 'generic'));
}

/**
 * Demo-engine profiling: profile the repo's own data/*.json the same way the
 * data-quality daemon does (largest top-level array, keyed by `id` if present).
 * Picks a specific file when `table` is given (matched by file stem); otherwise
 * defaults to a known-present store.
 */
function profileDemo(table?: string): { dataset: string; profile: ReturnType<typeof profileDataset> } {
  let files: string[] = [];
  try { files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')); } catch { /* no dir */ }

  let chosen: string | undefined;
  if (table) {
    const want = table.replace(/\.json$/i, '').toLowerCase();
    chosen = files.find((f) => f.replace(/\.json$/i, '').toLowerCase() === want);
  }
  if (!chosen) {
    // Prefer the governance store (always present + array-shaped), else any file.
    chosen = files.find((f) => f === 'governance.json') || files[0];
  }
  if (!chosen) return { dataset: '(none)', profile: profileDataset([]) };

  const json = JSON.parse(fs.readFileSync(path.join(DATA_DIR, chosen), 'utf8'));
  let records: any[] = [];
  let keyField: string | undefined;
  if (Array.isArray(json)) {
    records = json; keyField = json[0] && typeof json[0] === 'object' && 'id' in json[0] ? 'id' : undefined;
  } else if (json && typeof json === 'object') {
    const arrays = Object.entries(json).filter(([, v]) => Array.isArray(v)) as Array<[string, any[]]>;
    arrays.sort((a, b) => b[1].length - a[1].length);
    if (arrays.length) {
      records = arrays[0][1];
      keyField = records[0] && typeof records[0] === 'object' && 'id' in records[0] ? 'id' : undefined;
    }
  }
  return { dataset: chosen.replace(/\.json$/i, ''), profile: profileDataset(records, { keyField }) };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export function registerVirtuAnalyticaRoutes(app: Express): void {
  const base = '/api/virtuanalytica';

  // ─── Tier 0: health + state ───────────────────────────────────────────────
  app.get(`${base}/health`, (_req, res) => {
    ok(res, { ok: true, service: 'virtuanalytica' });
  });

  app.get(`${base}/state`, (_req, res) => {
    try {
      const model = store.getCatalogModel();
      const assets = model ? (model.assets || []).length : 0;
      const terms = model ? (model.glossaryTerms || []).length : 0;
      const conns = store.listConnections();
      const nonDemoConns = conns.filter((c) => !c.demo).length;
      const tools = store.listTools();
      const enabledTools = tools.filter((t) => t.enabled).length;
      ok(res, {
        demoMode: true,
        tiers: {
          tier1: { unlocked: assets >= 1, assets, terms },
          tier2: { unlocked: nonDemoConns >= 1, connections: conns.length, demo: true },
          tier3: { unlocked: enabledTools >= 1, tools: tools.length },
        },
      });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.get(`${base}/roles`, (_req, res) => {
    try { ok(res, { roles: listRoles() }); }
    catch (e: any) { fail(res, 500, e.message); }
  });

  // ─── Tier 1: role graph (3D payload) — MUST be registered before /roles/:role
  app.get(`${base}/roles/graph`, async (req, res) => {
    try {
      const graph = await getRoleGraph3D(lr(req) as any, null);
      ok(res, { ...graph });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.get(`${base}/roles/:role`, async (req, res) => {
    try {
      const role = String(req.params.role);
      if (!roles.isRoleKey(role)) { fail(res, 400, `unknown role: ${role}`); return; }
      const roleMeta = roles.getRole(role)!;
      const summary = await roles.getRoleSummary(lr(req), role as RoleKey);
      ok(res, { role: roleMeta, summary });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.get(`${base}/categories`, (_req, res) => {
    try { ok(res, { categories: getCategories() }); }
    catch (e: any) { fail(res, 500, e.message); }
  });

  app.get(`${base}/i18n`, (_req, res) => {
    try { ok(res, { ...getI18n() }); }
    catch (e: any) { fail(res, 500, e.message); }
  });

  app.get(`${base}/roles/:role/graph`, async (req, res) => {
    try {
      const role = String(req.params.role);
      if (!roles.isRoleKey(role)) { fail(res, 400, `unknown role: ${role}`); return; }
      const graph = await getRoleGraph3D(lr(req) as any, role);
      ok(res, { ...graph });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  // ─── Tier 1: catalog import / browse ──────────────────────────────────────
  app.post(`${base}/catalog/import`, requireEnabled, async (req, res) => {
    try {
      const body = req.body || {};
      const isEmptyBody = !body || Object.keys(body).length === 0 || (!body.payload && !body.demo);
      let model: CatalogModel;
      let source: string;

      if (body.demo === true || isEmptyBody) {
        // Bundled demo catalog (clearly-labeled sample on disk — not synthetic-at-runtime).
        if (!fs.existsSync(SAMPLE_CATALOG_PATH)) { fail(res, 500, 'sample catalog not found'); return; }
        model = loadSampleModel();
        source = body.source || model.source || 'generic';
      } else {
        if (body.payload === undefined || body.payload === null) {
          fail(res, 400, 'payload is required (or set demo:true)');
          return;
        }
        const format: catalog.CatalogFormat = body.format || 'generic-json';
        if (!['collibra-json', 'collibra-csv', 'generic-json'].includes(format)) {
          fail(res, 400, `unknown format: ${format}`);
          return;
        }
        model = catalog.normalize(body.payload, format);
        source = body.source || model.source || (format === 'collibra-csv' || format === 'collibra-json' ? 'collibra' : 'generic');
      }

      // Persist the normalized model.
      store.setCatalogModel(model);

      // Map assets + terms into the governance registry, notify the graph.
      const entries = catalog.upsertModelToGovernance(model, source);
      for (const entry of entries) await notifyGovernance(req, entry);

      // Ingest into the role knowledge graph (graceful no-op when offline).
      const client = lr(req);
      const graphResult = client
        ? await ingestCatalogModel(client, model, source)
        : { assets: 0, terms: 0, classifications: 0, policies: 0, lineage: 0, edges: 0, offline: true };

      ok(res, {
        imported: catalog.countModel(model),
        governanceEntriesUpserted: entries.length,
        graph: graphResult,
      });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.get(`${base}/catalog`, requireEnabled, (_req, res) => {
    try {
      const model = store.getCatalogModel();
      if (!model) {
        ok(res, {
          model: {
            source: null,
            importedAt: null,
            counts: { assets: 0, columns: 0, terms: 0, classifications: 0, owners: 0, lineage: 0, policies: 0 },
          },
          sampleAssets: [],
        });
        return;
      }
      const sampleAssets = (model.assets || []).slice(0, 10).map((a) => ({ id: a.id, name: a.name, type: a.type }));
      ok(res, {
        model: { source: model.source, importedAt: model.importedAt, counts: catalog.countModel(model) },
        sampleAssets,
      });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.get(`${base}/catalog/asset/:id`, requireEnabled, (req, res) => {
    try {
      const model = store.getCatalogModel();
      const id = String(req.params.id);
      const asset = model?.assets?.find((a) => a.id === id);
      if (!asset) { fail(res, 404, 'asset not found'); return; }
      const columns = (model!.columns || []).filter((c) => c.assetId === id);
      const termIds = new Set([...(asset.termIds || []), ...columns.flatMap((c) => c.termIds || [])]);
      const terms = (model!.glossaryTerms || []).filter((t) => termIds.has(t.id));
      const classifications = (model!.classifications || []).filter((c) => (asset.classificationIds || []).includes(c.id));
      const owners = (model!.owners || []).filter((o) => (asset.ownerIds || []).includes(o.id));
      const lineageIn = (model!.lineage || []).filter((l) => l.toAssetId === id);
      const lineageOut = (model!.lineage || []).filter((l) => l.fromAssetId === id);
      ok(res, { asset, columns, terms, classifications, owners, lineageIn, lineageOut });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  // ─── Tier 2: connections (locked stub, demo-safe) ─────────────────────────
  app.get(`${base}/connections`, requireEnabled, (_req, res) => {
    try {
      const connections = store.listConnections().map((c) => ({
        id: c.id,
        name: c.name,
        engine: c.engine,
        readOnly: c.readOnly,
        demo: c.demo,
        lastProfiledAt: c.lastProfiledAt || null,
        secretMasked: store.maskSecret(c.secret),
      }));
      ok(res, { connections });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/connections`, requireEnabled, (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.engine) { fail(res, 400, 'name and engine are required'); return; }
      const conn = store.addConnection({
        name: String(body.name),
        engine: String(body.engine),
        host: body.host ? String(body.host) : undefined,
        port: typeof body.port === 'number' ? body.port : undefined,
        database: body.database ? String(body.database) : undefined,
        user: body.user ? String(body.user) : undefined,
        secret: body.secret ? String(body.secret) : undefined,
        readOnly: body.readOnly === undefined ? true : Boolean(body.readOnly),
      });
      // Never return the secret — only a mask.
      ok(res, { connectionId: conn.id, masked: store.maskSecret(conn.secret) });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/connections/:id/profile`, requireEnabled, (req, res) => {
    try {
      const conn = store.getConnection(String(req.params.id));
      if (!conn) { fail(res, 404, 'connection not found'); return; }
      const table = req.body?.table ? String(req.body.table) : undefined;

      // Demo engine (and any connection without live exec) profiles repo JSON —
      // never touches an external DB. This keeps Tier 2 demoable with no DB.
      const { dataset, profile } = profileDemo(table);
      store.markConnectionProfiled(conn.id);
      ok(res, { profile: { connectionId: conn.id, engine: conn.engine, dataset, ...profile } });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  // ─── Tier 3: tools (locked stub, demo-safe) ───────────────────────────────
  app.get(`${base}/tools`, requireEnabled, (_req, res) => {
    try {
      const tools = store.listTools().map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        enabled: t.enabled,
        lastRunAt: t.lastRunAt || null,
      }));
      ok(res, { tools });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/tools`, requireEnabled, (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.kind) { fail(res, 400, 'name and kind are required'); return; }
      const tool = store.addTool({
        name: String(body.name),
        kind: String(body.kind),
        config: body.config && typeof body.config === 'object' ? body.config : undefined,
        requiresConnectionId: body.requiresConnectionId ? String(body.requiresConnectionId) : undefined,
      });
      ok(res, { toolId: tool.id });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/tools/:id/run`, requireEnabled, (req, res) => {
    try {
      const tool = store.getTool(String(req.params.id));
      if (!tool) { fail(res, 404, 'tool not found'); return; }
      const body = req.body || {};
      const dryRun = body.dryRun !== false; // default true
      const params = body.params && typeof body.params === 'object' ? body.params : undefined;

      // Real execution is gated three ways and OFF by default — otherwise simulate.
      const boundConn = tool.requiresConnectionId ? store.getConnection(tool.requiresConnectionId) : undefined;
      const realExecAllowed =
        dryRun === false &&
        !!boundConn && !boundConn.demo &&
        process.env.VIRTUANALYTICA_EXEC_ENABLED === 'true';

      // Even when "allowed", the MVP stub never touches a shell/DB; it queues.
      const status: 'simulated' | 'queued' = realExecAllowed ? 'queued' : 'simulated';
      const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      store.recordToolRun(tool.id, {
        runId, at: new Date().toISOString(), status, dryRun, params,
        output: status === 'simulated' ? { note: 'dry-run / simulated — no execution performed' } : { note: 'queued for execution' },
      });
      ok(res, { runId, status });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  // ─── Tier 1: pretrained role / capability catalog ─────────────────────────
  app.get(`${base}/catalog/roles`, (_req, res) => {
    try {
      ok(res, { success: true, roles: rolesCatalog.listRoles().map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        shortDescription: r.shortDescription,
        priceEur: r.priceEur,
      })) });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.get(`${base}/catalog/capabilities`, (_req, res) => {
    try {
      ok(res, { success: true, capabilities: capabilitiesCatalog.listCapabilities().map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        shortDescription: c.shortDescription,
        priceEur: c.priceEur,
      })) });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/price`, (req, res) => {
    try {
      const body = req.body || {};
      const price = commerce.calculatePrice(body.selectedRoles || [], body.selectedCapabilities || []);
      ok(res, { price });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/selection`, (req, res) => {
    try {
      const body = req.body || {};
      const entitlement = commerce.setSelection(body.selectedRoles || [], body.selectedCapabilities || []);
      ok(res, { entitlement });
    } catch (e: any) { fail(res, 500, e.message); }
  });

  // ─── Tier 4: commercial entitlement ───────────────────────────────────────
  function requireEnabled(req: Request, res: Response, next: any): void {
    const ent = commerce.getEntitlement();
    if (!ent.enabled) {
      fail(res, 402, 'VirtuAnalytica is not enabled. Activate it in Settings.');
      return;
    }
    const consume = commerce.consumeTokens(1);
    if (!consume.allowed) {
      fail(res, 402, consume.error || 'Insufficient tokens');
      return;
    }
    next();
  }

  app.get(`${base}/entitlement`, (_req, res) => {
    try { ok(res, { entitlement: commerce.getEntitlement() }); }
    catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/payment-intent`, async (req, res) => {
    try {
      const body = req.body || {};
      const result = await commerce.createPaymentIntent(
        body.selectedRoles,
        body.selectedCapabilities,
        body.currency || 'eur',
        body.paymentMethodType || 'card',
      );
      if (result.success) ok(res, { paymentIntentId: result.paymentIntentId, clientSecret: result.clientSecret, amountCents: result.amountCents, currency: result.currency });
      else fail(res, 400, result.error || 'Payment intent creation failed');
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/activate`, (req, res) => {
    try {
      const body = req.body || {};
      const result = commerce.activate(String(body.paymentIntentId || ''));
      if (result.success) ok(res, { entitlement: result.entitlement });
      else fail(res, 400, result.error || 'Activation failed');
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/toggle-test`, (req, res) => {
    try {
      const body = req.body || {};
      if (body.enabled === true || body.enabled === undefined) {
        const entitlement = commerce.enableTestMode(body.selectedRoles, body.selectedCapabilities);
        ok(res, { entitlement });
      } else {
        const entitlement = commerce.disableCommercial();
        ok(res, { entitlement });
      }
    } catch (e: any) { fail(res, 500, e.message); }
  });

  app.post(`${base}/disable`, (_req, res) => {
    try { ok(res, { entitlement: commerce.disableCommercial() }); }
    catch (e: any) { fail(res, 500, e.message); }
  });

  logger.info('✓ VirtuAnalytica routes registered (FROZEN contract)');
}
