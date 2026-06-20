/**
 * Internal write-endpoint guard (research item #19).
 *
 * A small set of mutation endpoints — governance/register, wiki, corpus/ingest,
 * mcp/call, kami/queue, backlog/items — were wide open: any local process could
 * POST to them with no authentication. In practice they are only ever called by
 * localhost scripts (scripts/*.js) and the server itself. This middleware
 * authorises those writes when the caller is either:
 *   - loopback / localhost (mirrors the existing privilegedActor() trust
 *     boundary used for the commercialization endpoints), OR
 *   - presenting a shared service token (INTERNAL_WRITE_SERVICE_TOKEN) via
 *     `X-Api-Key` or `Authorization: ApiKey <token>`, constant-time compared.
 *
 * It defaults to WARN mode (INTERNAL_WRITE_ENFORCE != 'true'): an unauthorized
 * write is logged but still allowed, so the guard can ship ahead of any caller
 * changes with zero breakage and the logs reveal whether any legitimate caller
 * is non-local. Flip INTERNAL_WRITE_ENFORCE=true to actually reject.
 *
 * It is mounted ONCE, globally, and is a no-op for every request except a POST
 * to one of the protected paths — so there is no per-route wiring to drift, and
 * it deliberately depends on nothing instantiated later in startup (the write
 * routes are registered at module load, long before ApiKeyManager / the audit
 * logger exist).
 *
 * Note: req.ip is the direct socket address because the app sets no `trust
 * proxy`. If this is ever deployed behind a reverse proxy, configure
 * `app.set('trust proxy', …)` AND have the proxy strip client X-Forwarded-For,
 * or the loopback check could be spoofed — see breaks_if in the design.
 */

import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import logger from '../utils/logger';

/** The exact paths this guard protects (matched on POST only). */
export const PROTECTED_WRITE_PATHS: ReadonlySet<string> = new Set([
  '/api/governance/register',
  '/api/wiki',
  '/api/corpus/ingest',
  '/api/mcp/call',
  '/api/kami/queue',
  '/api/backlog/items',
]);

function isLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** Length-safe constant-time string compare (timingSafeEqual throws on length mismatch). */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function presentedToken(req: Request): string | undefined {
  const direct = req.get('x-api-key');
  if (direct) return direct;
  const auth = req.get('authorization');
  if (auth && auth.startsWith('ApiKey ')) return auth.slice('ApiKey '.length).trim() || undefined;
  return undefined;
}

export interface InternalWriteAuthOptions {
  /** Reject unauthorized writes (403) when true; log-and-allow when false (default). */
  enforce?: boolean;
  /** Shared service token; a matching X-Api-Key authorises a non-local caller. */
  serviceToken?: string;
  /** Override the protected path set (defaults to PROTECTED_WRITE_PATHS). */
  protectedPaths?: ReadonlySet<string>;
}

/**
 * Build the guard middleware. Reads INTERNAL_WRITE_ENFORCE /
 * INTERNAL_WRITE_SERVICE_TOKEN from the environment unless overridden via opts.
 */
export function internalWriteAuth(opts: InternalWriteAuthOptions = {}) {
  const enforce = opts.enforce ?? (process.env.INTERNAL_WRITE_ENFORCE || '').toLowerCase() === 'true';
  const serviceToken = opts.serviceToken ?? process.env.INTERNAL_WRITE_SERVICE_TOKEN ?? '';
  const protectedPaths = opts.protectedPaths ?? PROTECTED_WRITE_PATHS;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Normalise the path the SAME way Express routes it, or the guard can be
    // bypassed: Express matches routes case-insensitively (caseSensitive off)
    // and ignores a trailing slash (strict off), so `POST /API/wiki/` reaches
    // the /api/wiki handler while a raw req.path lookup would miss the Set.
    // Lower-case and strip trailing slash(es) before matching.
    const normalizedPath = (req.path || '').toLowerCase().replace(/\/+$/, '') || '/';
    if (req.method !== 'POST' || !protectedPaths.has(normalizedPath)) {
      next();
      return;
    }

    const local = isLoopback(req.ip);
    const token = presentedToken(req);
    const tokenOk = !!serviceToken && !!token && constantTimeEqual(token, serviceToken);

    if (local || tokenOk) {
      next();
      return;
    }

    // Unauthorized write to a protected endpoint.
    logger.warn(
      `[internal-write-auth] unauthorized POST ${req.path} from ip=${req.ip} ` +
        `enforce=${enforce} tokenPresented=${!!token}`,
    );
    if (enforce) {
      res.status(403).json({
        success: false,
        error: 'internal write endpoint: localhost origin or a valid service token is required',
      });
      return;
    }
    next(); // WARN mode — allowed, but recorded above.
  };
}

export default internalWriteAuth;
