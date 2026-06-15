/**
 * VirtuAnalytica JSON-backed stores.
 *
 * Three small persisted stores, each following the same dirty-flag + ~5s
 * debounced save pattern as the governance registry
 * (src/integrations/governance/index.ts):
 *
 *   - data/virtuanalytica-catalog.json      the last normalized CatalogModel
 *   - data/virtuanalytica-connections.json  Tier-2 DB connections (secrets at rest)
 *   - data/virtuanalytica-tools.json        Tier-3 tools + their run history
 *
 * Secrets (connection passwords, tool config secrets) are encrypted at rest via
 * FieldCrypto, mirroring src/credentials.ts: encryption is enabled only when
 * FIELD_ENCRYPTION_KEY is present, otherwise plaintext is stored with a warning
 * (never crashes). The in-memory state always holds plaintext; only the on-disk
 * serialization is encrypted. Secrets are NEVER returned to API callers — every
 * read goes through a mask helper.
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import FieldCrypto from '../security/fieldCrypto';
import type { CatalogModel } from './role-graph';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CATALOG_PATH = path.join(DATA_DIR, 'virtuanalytica-catalog.json');
const CONNECTIONS_PATH = path.join(DATA_DIR, 'virtuanalytica-connections.json');
const TOOLS_PATH = path.join(DATA_DIR, 'virtuanalytica-tools.json');

// ---------------------------------------------------------------------------
// Field encryption (lazy resolver — mirrors src/credentials.ts).
// Resolved lazily because FIELD_ENCRYPTION_KEY may only appear in process.env
// after dotenv config() runs, which can be later than this module's import.
// ---------------------------------------------------------------------------
let _fieldCrypto: FieldCrypto | null = null;
let _warnedNoKey = false;
function getFieldCrypto(): FieldCrypto | null {
  if (_fieldCrypto) return _fieldCrypto;
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) {
    if (!_warnedNoKey) {
      logger.warn('virtuanalytica: FIELD_ENCRYPTION_KEY absent — storing connection/tool secrets in plaintext');
      _warnedNoKey = true;
    }
    return null; // not cached — a later call can pick the key up
  }
  try {
    _fieldCrypto = new FieldCrypto(key);
  } catch (e: any) {
    logger.warn(`virtuanalytica: FIELD_ENCRYPTION_KEY present but invalid (${e.message}); storing plaintext`);
    _fieldCrypto = null;
  }
  return _fieldCrypto;
}

/** Token-shape check independent of any FieldCrypto instance. */
function looksEncryptedToken(v: unknown): boolean {
  return typeof v === 'string' && v.startsWith('v1:') && v.split(':').length === 4;
}

/** Encrypt a secret for storage (no-op if no key / already encrypted / empty). */
function encryptSecret(secret: string | undefined): string | undefined {
  if (!secret) return secret;
  const fc = getFieldCrypto();
  if (!fc) return secret;
  return looksEncryptedToken(secret) ? secret : fc.encrypt(secret);
}

/** Decrypt a stored secret back to plaintext in memory (handles legacy plaintext). */
function decryptSecret(secret: string | undefined): string | undefined {
  if (!secret) return secret;
  if (!looksEncryptedToken(secret)) return secret; // legacy plaintext
  const fc = getFieldCrypto();
  if (!fc) return secret; // no key — leave token as-is, never returned anyway
  try { return fc.decrypt(secret); }
  catch { logger.warn('virtuanalytica: secret decrypt failed (wrong FIELD_ENCRYPTION_KEY?)'); return secret; }
}

/** Mask a secret for display — never reveals plaintext. */
export function maskSecret(secret: string | undefined | null): string {
  if (!secret) return '';
  return '••••••••';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface VAConnection {
  id: string;
  name: string;
  engine: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  /** Plaintext in memory; encrypted on disk. Never serialized to API responses. */
  secret?: string;
  readOnly: boolean;
  demo: boolean;
  createdAt: string;
  lastProfiledAt?: string;
}

export interface VAToolRun {
  runId: string;
  at: string;
  status: 'simulated' | 'queued' | 'done' | 'error';
  dryRun: boolean;
  params?: Record<string, any>;
  output?: any;
}

export interface VATool {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  /** Free-form config; any field named like a secret is encrypted at rest. */
  config?: Record<string, any>;
  requiresConnectionId?: string;
  createdAt: string;
  lastRunAt?: string;
  runs: VAToolRun[];
}

export interface VACatalogStore { model: CatalogModel | null; }
interface VAConnectionsStore { connections: VAConnection[]; }
interface VAToolsStore { tools: VATool[]; }

// ---------------------------------------------------------------------------
// In-memory state + dirty flags
// ---------------------------------------------------------------------------
let catalogState: VACatalogStore = { model: null };
let connectionsState: VAConnectionsStore = { connections: [] };
let toolsState: VAToolsStore = { tools: [] };

let catalogDirty = false;
let connectionsDirty = false;
let toolsDirty = false;
let loaded = false;

/** Keys in a config object that should be treated as secrets and encrypted. */
const SECRET_KEY_RE = /(secret|password|token|api[_-]?key|credential|passwd)/i;

function encryptConfigSecrets(config?: Record<string, any>): Record<string, any> | undefined {
  if (!config || typeof config !== 'object') return config;
  const out: Record<string, any> = { ...config };
  for (const k of Object.keys(out)) {
    if (SECRET_KEY_RE.test(k) && typeof out[k] === 'string' && out[k]) {
      out[k] = encryptSecret(out[k]);
    }
  }
  return out;
}

function decryptConfigSecrets(config?: Record<string, any>): Record<string, any> | undefined {
  if (!config || typeof config !== 'object') return config;
  const out: Record<string, any> = { ...config };
  for (const k of Object.keys(out)) {
    if (SECRET_KEY_RE.test(k) && typeof out[k] === 'string' && out[k]) {
      out[k] = decryptSecret(out[k]);
    }
  }
  return out;
}

/** Strip secret-looking config values for API responses. */
export function maskConfig(config?: Record<string, any>): Record<string, any> | undefined {
  if (!config || typeof config !== 'object') return config;
  const out: Record<string, any> = { ...config };
  for (const k of Object.keys(out)) {
    if (SECRET_KEY_RE.test(k) && out[k]) out[k] = maskSecret(String(out[k]));
  }
  return out;
}

function seedConnection(): VAConnection {
  return {
    id: 'demo',
    name: 'Demo dataset',
    engine: 'demo',
    readOnly: true,
    demo: true,
    createdAt: new Date().toISOString(),
  };
}

function seedTools(): VATool[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'tool-lineage-lookup',
      name: 'Governance lineage lookup',
      kind: 'governance',
      enabled: true,
      createdAt: now,
      runs: [],
    },
    {
      id: 'tool-quality-profile',
      name: 'Data quality profile',
      kind: 'data-quality',
      enabled: false,
      createdAt: now,
      runs: [],
    },
    {
      id: 'tool-access-review',
      name: 'Access review draft',
      kind: 'remediation',
      enabled: false,
      createdAt: now,
      runs: [],
    },
  ];
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e: any) {
    logger.warn(`virtuanalytica: failed to load ${file}: ${e.message}`);
    return fallback;
  }
}

/** Load all three stores once. Seeds the demo connection if none on disk. */
export function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;

  const cat = readJson<VACatalogStore>(CATALOG_PATH, { model: null });
  catalogState = (cat && typeof cat === 'object' && 'model' in cat ? cat : { model: null }) as VACatalogStore;

  connectionsState = readJson<VAConnectionsStore>(CONNECTIONS_PATH, { connections: [] });
  if (!Array.isArray(connectionsState.connections)) connectionsState.connections = [];
  // Decrypt secrets into memory (so the in-memory copy is always plaintext).
  for (const c of connectionsState.connections) c.secret = decryptSecret(c.secret);
  if (!connectionsState.connections.some((c) => c.id === 'demo')) {
    connectionsState.connections.unshift(seedConnection());
    connectionsDirty = true;
    scheduleSave();
  }

  toolsState = readJson<VAToolsStore>(TOOLS_PATH, { tools: [] });
  if (!Array.isArray(toolsState.tools)) toolsState.tools = [];
  for (const t of toolsState.tools) {
    if (!Array.isArray(t.runs)) t.runs = [];
    t.config = decryptConfigSecrets(t.config);
  }
  if (toolsState.tools.length === 0) {
    toolsState.tools = seedTools();
    toolsDirty = true;
    scheduleSave();
  }
}

// ---------------------------------------------------------------------------
// Debounced save (one shared timer; persists whichever store is dirty).
// ---------------------------------------------------------------------------
let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save();
  }, 5000);
  if (typeof (saveTimer as any).unref === 'function') (saveTimer as any).unref();
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function save(): void {
  if (catalogDirty) {
    try { writeJson(CATALOG_PATH, catalogState); catalogDirty = false; }
    catch (e: any) { logger.warn(`virtuanalytica: catalog save failed: ${e.message}`); }
  }
  if (connectionsDirty) {
    try {
      // Encrypt secrets at rest; in-memory state stays plaintext.
      const onDisk: VAConnectionsStore = {
        connections: connectionsState.connections.map((c) => ({ ...c, secret: encryptSecret(c.secret) })),
      };
      writeJson(CONNECTIONS_PATH, onDisk);
      connectionsDirty = false;
    } catch (e: any) { logger.warn(`virtuanalytica: connections save failed: ${e.message}`); }
  }
  if (toolsDirty) {
    try {
      const onDisk: VAToolsStore = {
        tools: toolsState.tools.map((t) => ({ ...t, config: encryptConfigSecrets(t.config) })),
      };
      writeJson(TOOLS_PATH, onDisk);
      toolsDirty = false;
    } catch (e: any) { logger.warn(`virtuanalytica: tools save failed: ${e.message}`); }
  }
}

/** Flush any pending writes synchronously (used at shutdown / tests). */
export function flushSync(): void {
  if (catalogDirty || connectionsDirty || toolsDirty) save();
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
export function getCatalogModel(): CatalogModel | null {
  ensureLoaded();
  return catalogState.model;
}

export function setCatalogModel(model: CatalogModel): void {
  ensureLoaded();
  catalogState.model = model;
  catalogDirty = true;
  scheduleSave();
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------
export function listConnections(): VAConnection[] {
  ensureLoaded();
  return [...connectionsState.connections];
}

export function getConnection(id: string): VAConnection | undefined {
  ensureLoaded();
  return connectionsState.connections.find((c) => c.id === id);
}

export interface NewConnectionInput {
  name: string;
  engine: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  secret?: string;
  readOnly?: boolean;
}

export function addConnection(input: NewConnectionInput): VAConnection {
  ensureLoaded();
  const conn: VAConnection = {
    id: `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: input.name,
    engine: input.engine,
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.user,
    secret: input.secret, // plaintext in memory; encrypted on save
    readOnly: input.readOnly !== false, // default read-only for safety
    demo: false,
    createdAt: new Date().toISOString(),
  };
  connectionsState.connections.push(conn);
  connectionsDirty = true;
  scheduleSave();
  return conn;
}

export function markConnectionProfiled(id: string): void {
  ensureLoaded();
  const c = connectionsState.connections.find((x) => x.id === id);
  if (c) { c.lastProfiledAt = new Date().toISOString(); connectionsDirty = true; scheduleSave(); }
}

/** True if there is at least one non-demo connection (Tier-2 unlock). */
export function hasNonDemoConnection(): boolean {
  ensureLoaded();
  return connectionsState.connections.some((c) => !c.demo);
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
export function listTools(): VATool[] {
  ensureLoaded();
  return [...toolsState.tools];
}

export function getTool(id: string): VATool | undefined {
  ensureLoaded();
  return toolsState.tools.find((t) => t.id === id);
}

export interface NewToolInput {
  name: string;
  kind: string;
  config?: Record<string, any>;
  requiresConnectionId?: string;
}

export function addTool(input: NewToolInput): VATool {
  ensureLoaded();
  const tool: VATool = {
    id: `tool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: input.name,
    kind: input.kind,
    enabled: true,
    config: input.config, // plaintext in memory; secret keys encrypted on save
    requiresConnectionId: input.requiresConnectionId,
    createdAt: new Date().toISOString(),
    runs: [],
  };
  toolsState.tools.push(tool);
  toolsDirty = true;
  scheduleSave();
  return tool;
}

/** True if there is at least one enabled tool (Tier-3 unlock). */
export function hasEnabledTool(): boolean {
  ensureLoaded();
  return toolsState.tools.some((t) => t.enabled);
}

export function recordToolRun(id: string, run: VAToolRun): void {
  ensureLoaded();
  const t = toolsState.tools.find((x) => x.id === id);
  if (!t) return;
  t.runs.push(run);
  // Keep run history bounded.
  if (t.runs.length > 100) t.runs = t.runs.slice(-100);
  t.lastRunAt = run.at;
  toolsDirty = true;
  scheduleSave();
}

/** Test-only: reset all in-memory state (does not touch disk). */
export function resetForTests(): void {
  catalogState = { model: null };
  connectionsState = { connections: [seedConnection()] };
  toolsState = { tools: [] };
  catalogDirty = connectionsDirty = toolsDirty = false;
  loaded = true;
}
