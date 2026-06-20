import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import FieldCrypto from '../../src/security/fieldCrypto';

/**
 * Proof for TOP_100 #31 — wire FieldCrypto to the credentials store.
 *
 * api_keys were stored in plaintext in credentials.json (world-readable on a
 * shared disk). They are now encrypted at rest with FieldCrypto (AES-256-GCM),
 * while the in-memory store and process.env stay plaintext so nothing else
 * changes. Encryption is keyed off FIELD_ENCRYPTION_KEY and migrates any legacy
 * plaintext file on first load.
 *
 * The module loads credentials at import time, so the env + a seed file must be
 * in place before require(). We isolate module state per case with
 * jest.isolateModules and a unique temp state dir.
 */
describe('credentials encryption at rest (TOP_100 #31)', () => {
  const KEY = 'a'.repeat(64); // 64-char hex → used as the raw 32-byte AES key
  let stateDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpc-cred-test-'));
    savedEnv.FIELD_ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY;
    savedEnv.VIRTUALPC_STATE_DIR = process.env.VIRTUALPC_STATE_DIR;
    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    process.env.VIRTUALPC_STATE_DIR = stateDir;
    process.env.FIELD_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  function readDisk(): any {
    return JSON.parse(fs.readFileSync(path.join(stateDir, 'credentials.json'), 'utf8'));
  }

  it('migrates a legacy plaintext file to encrypted-at-rest on load', () => {
    const PLAINTEXT = 'sk-ant-legacy-plaintext-key-123456';
    // Seed a legacy plaintext credentials.json (pre-encryption format).
    fs.writeFileSync(
      path.join(stateDir, 'credentials.json'),
      JSON.stringify({
        updated_at: '2026-01-01T00:00:00Z',
        providers: [{ provider: 'anthropic', email: 'a@b.com', api_key: PLAINTEXT, updated_at: '2026-01-01T00:00:00Z' }],
      })
    );

    jest.isolateModules(() => {
      // require triggers boot-time loadCredentials() → migration runs.
      require('../../src/credentials');
    });

    const disk = readDisk();
    const storedKey = disk.providers[0].api_key;
    // On disk it is now an encrypted token, not the plaintext.
    expect(storedKey).not.toBe(PLAINTEXT);
    expect(storedKey.startsWith('v1:')).toBe(true);
    // It decrypts back to the original with the same key.
    expect(new FieldCrypto(KEY).decrypt(storedKey)).toBe(PLAINTEXT);
    // The canonical env var holds the plaintext key for the rest of the app.
    expect(process.env.ANTHROPIC_API_KEY).toBe(PLAINTEXT);
  });

  it('round-trips: setProvider stores ciphertext, exposes plaintext + mask', () => {
    let cred: typeof import('../../src/credentials');
    jest.isolateModules(() => {
      cred = require('../../src/credentials');
    });

    const PLAINTEXT = 'sk-openai-fresh-key-abcdefghijklmnop';
    const res = cred!.setProvider('openai', { email: 'x@y.com', api_key: PLAINTEXT });

    // Masked return — never the raw key.
    expect(res.api_key_masked).toContain('…');
    expect(res.api_key_masked).not.toBe(PLAINTEXT);

    // On disk: encrypted.
    const disk = readDisk();
    const stored = disk.providers.find((p: any) => p.provider === 'openai').api_key;
    expect(stored.startsWith('v1:')).toBe(true);
    expect(new FieldCrypto(KEY).decrypt(stored)).toBe(PLAINTEXT);

    // In memory / env: plaintext, so downstream callers are unaffected.
    expect(process.env.OPENAI_API_KEY).toBe(PLAINTEXT);
    const masked = cred!.listMasked().find(p => p.id === 'openai');
    expect(masked?.configured).toBe(true);
  });

  it('survives a reload: encrypted file decrypts back to plaintext', () => {
    const PLAINTEXT = 'sk-grok-reload-key-zzzzzzzzzzzzzzzz';
    jest.isolateModules(() => {
      const cred = require('../../src/credentials');
      cred.setProvider('grok', { api_key: PLAINTEXT });
    });
    delete process.env.XAI_API_KEY; // prove the reload repopulates it

    // Fresh module instance reads the encrypted file written above.
    let cred2: typeof import('../../src/credentials');
    jest.isolateModules(() => {
      cred2 = require('../../src/credentials');
    });
    expect(process.env.XAI_API_KEY).toBe(PLAINTEXT);
    expect(cred2!.listMasked().find(p => p.id === 'grok')?.configured).toBe(true);
  });

  it('without a key, stores plaintext (graceful degradation, unchanged behavior)', () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    const PLAINTEXT = 'sk-nokey-plaintext-mode-1234567890';
    jest.isolateModules(() => {
      const cred = require('../../src/credentials');
      cred.setProvider('mistral', { api_key: PLAINTEXT });
    });
    const disk = readDisk();
    const stored = disk.providers.find((p: any) => p.provider === 'mistral').api_key;
    // No encryption key → plaintext on disk, exactly as before #31.
    expect(stored).toBe(PLAINTEXT);
  });
});
