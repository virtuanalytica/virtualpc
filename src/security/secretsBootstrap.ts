/**
 * Secrets bootstrap — wires the SecretsManager into app startup.
 *
 * `loadSecrets()` returns a fully-loaded SecretsManager when Infisical
 * bootstrap creds are present, or `null` when they are not. Open-source
 * VirtualPC never reads `.env` files; production secrets must come from a
 * secret manager, managed identity, or encrypted local credential store.
 */

import { SecretsManager, InfisicalSecretsProvider, SecretLayer } from './secrets';
import FieldCrypto from './fieldCrypto';
import logger from '../utils/logger';

/** True when the Infisical machine-identity bootstrap creds are all present. */
export function isInfisicalConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.INFISICAL_CLIENT_ID && env.INFISICAL_CLIENT_SECRET && env.INFISICAL_PROJECT_ID);
}

/**
 * Build + load all secret layers from Infisical. Returns null (with a warning)
 * when Infisical is not configured, rather than throwing. Non-secret runtime
 * configuration may still come from injected process environment variables,
 * but application secrets should be provisioned through the secret manager.
 */
export async function loadSecrets(env: NodeJS.ProcessEnv = process.env): Promise<SecretsManager | null> {
  if (!isInfisicalConfigured(env)) {
    logger.warn(
      '⚠️ Infisical not configured (INFISICAL_* unset). ' +
        'Provision Infisical or another managed secret source for production secrets.'
    );
    return null;
  }
  const manager = new SecretsManager(InfisicalSecretsProvider.fromEnv(env));
  await manager.loadAll();
  logger.info('✓ Secrets loaded from Infisical across all layers (no .env)');
  return manager;
}

/**
 * Resolve a FieldCrypto from the infra-layer FIELD_ENCRYPTION_KEY using the
 * infra-scoped accessor (enforces the per-agent access model). Returns
 * undefined when the key is absent (field encryption stays off, as today).
 */
export function resolveFieldCrypto(secrets: SecretsManager): FieldCrypto | undefined {
  const key = secrets.for('infra').get('infra', 'FIELD_ENCRYPTION_KEY');
  return key ? new FieldCrypto(key) : undefined;
}

/**
 * One read of a secret for a given agent role + layer, for migrating a single
 * `process.env.X` call site. Returns undefined when unset.
 */
export function readSecret(
  secrets: SecretsManager,
  agent: Parameters<SecretsManager['for']>[0],
  layer: SecretLayer,
  key: string
): string | undefined {
  return secrets.for(agent).get(layer, key);
}

/**
 * Process-wide active SecretsManager, set once at startup. Lets scattered call
 * sites read secrets without threading the manager through every constructor.
 */
let _active: SecretsManager | null = null;
export function setActiveSecrets(secrets: SecretsManager | null): void {
  _active = secrets;
}
export function getActiveSecrets(): SecretsManager | null {
  return _active;
}

/**
 * Trusted-core secret read: prefer the active SecretsManager (Infisical), and
 * fall back to process.env for injected deployment/runtime values. Do not use
 * `.env` files in the open-source repository.
 *
 * Unscoped on purpose — the core server process is trusted and may hold all
 * layers; the per-agent access model (`SecretsManager.for(role)`) is what gates
 * secrets DELEGATED to sub-agents (e.g. a scraper). Returns undefined if unset.
 */
export function secretOrEnv(layer: SecretLayer, key: string): string | undefined {
  const fromVault = _active?.get(layer, key);
  if (fromVault !== undefined) return fromVault;
  return process.env[key];
}
