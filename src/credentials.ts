/**
 * Provider credentials store — saves API keys + emails for upstream LLM
 * providers (Anthropic, OpenAI, Grok, DeepSeek, Kimi/Moonshot, Perplexity).
 *
 * Storage: /media/knight2/EDS2/virtualpc-state/credentials.json (gitignored)
 * Reading: returns *masked* values (show first 4 + last 4 chars only).
 * Writing: replaces a single provider's record at a time.
 *
 * Loaded into process.env on startup so VirtualPC's LM Studio router and any
 * cloud-fallback wrappers can see them without restarts.
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from './utils/logger';
import FieldCrypto from './security/fieldCrypto';

const STATE_DIR = process.env.VIRTUALPC_STATE_DIR || '/media/knight2/EDS2/virtualpc-state';
const CRED_PATH = path.join(STATE_DIR, 'credentials.json');

// Field encryption for api_key at rest. Mirrors AuthSystem's policy: enabled
// only when FIELD_ENCRYPTION_KEY is present (via .env or the secrets bootstrap)
// and a no-op otherwise, so the app never breaks for lack of a key. The in-
// memory `credentials` array always holds *plaintext* keys (so process.env,
// masking, and listMasked keep working unchanged) — only the on-disk
// serialization is encrypted.
//
// Resolved lazily because this module is imported before dotenv config() runs,
// so the key may only appear in process.env later; callers (index.ts) re-invoke
// loadCredentials() once secrets are loaded to pick it up and migrate at rest.
let _fieldCrypto: FieldCrypto | null = null;
function getFieldCrypto(): FieldCrypto | null {
  if (_fieldCrypto) return _fieldCrypto;
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) return null; // not cached — a later call can pick the key up
  try {
    _fieldCrypto = new FieldCrypto(key);
  } catch (e: any) {
    logger.warn(`credentials: FIELD_ENCRYPTION_KEY present but invalid (${e.message}); storing plaintext`);
    _fieldCrypto = null;
  }
  return _fieldCrypto;
}

// Standalone token-shape check — independent of any FieldCrypto instance so we
// can recognise an encrypted value even when no key is available yet (and thus
// never leak ciphertext into process.env). Must match FieldCrypto's format.
function looksEncryptedToken(v: unknown): boolean {
  return typeof v === 'string' && v.startsWith('v1:') && v.split(':').length === 4;
}

export interface ProviderRecord {
  provider: string;       // anthropic, openai, grok, deepseek, kimi, perplexity
  email: string;          // account email
  api_key: string;        // raw key (stored, never returned via API except masked)
  base_url?: string;      // optional override (Moonshot endpoint, OpenRouter, etc.)
  notes?: string;
  updated_at: string;     // ISO
}

export interface ProviderMeta {
  id: string;
  label: string;
  default_base_url: string;
  /** Env var name we expose so the rest of the app finds the key without changes. */
  env_var: string;
  docs_url: string;
}

export const PROVIDER_CATALOG: ProviderMeta[] = [
  { id: 'anthropic',  label: 'Anthropic Claude',  default_base_url: 'https://api.anthropic.com',           env_var: 'ANTHROPIC_API_KEY',  docs_url: 'https://docs.anthropic.com/' },
  { id: 'openai',     label: 'OpenAI',            default_base_url: 'https://api.openai.com/v1',           env_var: 'OPENAI_API_KEY',     docs_url: 'https://platform.openai.com/docs' },
  { id: 'grok',       label: 'xAI Grok',          default_base_url: 'https://api.x.ai/v1',                 env_var: 'XAI_API_KEY',        docs_url: 'https://docs.x.ai/' },
  { id: 'deepseek',   label: 'DeepSeek',          default_base_url: 'https://api.deepseek.com',            env_var: 'DEEPSEEK_API_KEY',   docs_url: 'https://platform.deepseek.com/' },
  { id: 'kimi',       label: 'Moonshot Kimi',     default_base_url: 'https://api.moonshot.cn/v1',          env_var: 'MOONSHOT_API_KEY',   docs_url: 'https://platform.moonshot.cn/' },
  { id: 'perplexity', label: 'Perplexity',        default_base_url: 'https://api.perplexity.ai',           env_var: 'PPLX_API_KEY',       docs_url: 'https://docs.perplexity.ai/' },
  { id: 'mistral',    label: 'Mistral',           default_base_url: 'https://api.mistral.ai/v1',           env_var: 'MISTRAL_API_KEY',    docs_url: 'https://docs.mistral.ai/' },
  { id: 'google',     label: 'Google Gemini',     default_base_url: 'https://generativelanguage.googleapis.com', env_var: 'GOOGLE_API_KEY', docs_url: 'https://ai.google.dev/' },
  // Stripe — for Croesus's commercialization spend. Account is registered
  // to VirtualV Holding B.V. Use a *restricted* key with charges:write only.
  { id: 'stripe',     label: 'Stripe (VirtualV Holding B.V.)', default_base_url: 'https://api.stripe.com', env_var: 'STRIPE_API_KEY',   docs_url: 'https://stripe.com/docs/api' },
];

let credentials: ProviderRecord[] = [];

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

export function loadCredentials() {
  try {
    if (!fs.existsSync(CRED_PATH)) {
      credentials = [];
      return;
    }
    const raw = fs.readFileSync(CRED_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const stored: ProviderRecord[] = Array.isArray(parsed.providers) ? parsed.providers : [];
    const fc = getFieldCrypto();
    // Decrypt api_keys back to plaintext in memory; note any plaintext-at-rest
    // so we can migrate it. Legacy plaintext (pre-encryption files) is left
    // as-is here and re-saved encrypted below when a key is available.
    let plaintextOnDisk = false;
    for (const rec of stored) {
      if (!rec.api_key) continue;
      const wasEncrypted = looksEncryptedToken(rec.api_key);
      if (!wasEncrypted) plaintextOnDisk = true;
      if (fc && wasEncrypted) {
        try {
          rec.api_key = fc.decrypt(rec.api_key);
        } catch {
          logger.warn(`credentials: decrypt failed for ${rec.provider} (wrong FIELD_ENCRYPTION_KEY?); leaving as-is`);
        }
      }
    }
    credentials = stored;
    // Push every decrypted key into process.env under its canonical name. Skip
    // anything still in token form (no key available to decrypt) so ciphertext
    // never leaks into the environment.
    for (const rec of credentials) {
      const meta = PROVIDER_CATALOG.find(p => p.id === rec.provider);
      if (meta && rec.api_key && !looksEncryptedToken(rec.api_key)) {
        process.env[meta.env_var] = rec.api_key;
      }
    }
    logger.info(`credentials: loaded ${credentials.length} provider records${fc ? ' (encrypted-at-rest)' : ''}`);
    // One-time at-rest migration: encryption is available and the file held a
    // plaintext key — re-save so every key is encrypted on disk going forward.
    if (fc && plaintextOnDisk) {
      saveCredentials();
      logger.info('credentials: migrated plaintext api_keys to encrypted-at-rest');
    }
  } catch (e: any) {
    logger.warn(`credentials: load failed: ${e.message}`);
    credentials = [];
  }
}

function saveCredentials() {
  ensureDir();
  const fc = getFieldCrypto();
  // Encrypt api_key for storage when a key is configured; the in-memory array
  // stays plaintext. encryptField is idempotent (won't double-encrypt) and a
  // no-op when fc is null, preserving the pre-encryption plaintext behavior.
  const providers = fc
    ? credentials.map(rec => ({ ...rec, api_key: fc.encryptField(rec.api_key) }))
    : credentials;
  const tmp = CRED_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ updated_at: new Date().toISOString(), providers }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CRED_PATH);
  fs.chmodSync(CRED_PATH, 0o600);
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '****';
  return key.slice(0, 4) + '…' + key.slice(-4);
}

export function listMasked() {
  return PROVIDER_CATALOG.map(meta => {
    const rec = credentials.find(c => c.provider === meta.id);
    return {
      ...meta,
      configured: !!rec,
      email: rec?.email || '',
      api_key_masked: rec ? maskKey(rec.api_key) : '',
      base_url: rec?.base_url || meta.default_base_url,
      notes: rec?.notes || '',
      updated_at: rec?.updated_at || null,
    };
  });
}

export function setProvider(provider: string, fields: { email?: string; api_key?: string; base_url?: string; notes?: string }) {
  const meta = PROVIDER_CATALOG.find(p => p.id === provider);
  if (!meta) throw new Error(`unknown provider: ${provider}`);
  const existing = credentials.find(c => c.provider === provider);
  const merged: ProviderRecord = {
    provider,
    email: fields.email ?? existing?.email ?? '',
    api_key: fields.api_key ?? existing?.api_key ?? '',
    base_url: fields.base_url ?? existing?.base_url,
    notes: fields.notes ?? existing?.notes,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    credentials = credentials.map(c => c.provider === provider ? merged : c);
  } else {
    credentials.push(merged);
  }
  saveCredentials();
  if (merged.api_key) process.env[meta.env_var] = merged.api_key;
  logger.info(`credentials: updated ${provider} (key=${maskKey(merged.api_key)})`);
  return { provider, email: merged.email, api_key_masked: maskKey(merged.api_key) };
}

export function deleteProvider(provider: string) {
  const before = credentials.length;
  credentials = credentials.filter(c => c.provider !== provider);
  saveCredentials();
  const meta = PROVIDER_CATALOG.find(p => p.id === provider);
  if (meta) delete process.env[meta.env_var];
  return { removed: before !== credentials.length };
}

// Boot-time load
loadCredentials();
