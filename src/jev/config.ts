import { HttpJevClient } from './client';

/**
 * Environment-driven Jev configuration, shared by the finance module and the
 * general engine. Secrets never leave this file's callers; /api/jev/status
 * reports only booleans and model aliases.
 */
export interface JevConfig {
  apiKey?: string;
  model: string;
  endpoint?: string;
}

export function jevConfigFromEnv(env: NodeJS.ProcessEnv = process.env): JevConfig {
  return {
    apiKey: env.TYPESAFE_API_KEY || undefined,
    model: env.TYPESAFE_MODEL || 'jev-latest',
    endpoint: env.TYPESAFE_API_URL || undefined,
  };
}

/** Configured client, or null when TYPESAFE_API_KEY is absent (dry-run mode). */
export function createJevClient(env: NodeJS.ProcessEnv = process.env): HttpJevClient | null {
  const config = jevConfigFromEnv(env);
  if (!config.apiKey) return null;
  return new HttpJevClient({ apiKey: config.apiKey, model: config.model, endpoint: config.endpoint });
}
