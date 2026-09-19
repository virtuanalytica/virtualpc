import { createHash } from 'node:crypto';

/**
 * Shared audit helper: a stable short hash of exactly what Jev scored, so the
 * audit trail can prove point-in-time scoring without storing full payloads.
 */
export function stateHash(state: unknown): string {
  const json = JSON.stringify(state, (_, value) => (typeof value === 'function' ? undefined : value));
  return createHash('sha256').update(json ?? '').digest('hex').slice(0, 16);
}
