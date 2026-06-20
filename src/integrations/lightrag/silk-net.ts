/**
 * Silk Net — free, open-source participation tier of the knitweb
 *
 * "Silk" is intentionally not called a testnet: posts published through a
 * silk node are real content that propagates into the full knitweb mesh via
 * bridge nodes. Silk nodes are permissionless (no staking, no DID required
 * to join the registry) and ephemeral (they must re-announce every 24 h or
 * be pruned). Bridge nodes run the full VPC stack and carry traffic between
 * the silk layer and the rest of the knitweb.
 *
 * Wiring: src/index.ts calls registerSilkRoutes() alongside the existing
 * micro-post routes. The silk gossip uses the same MicroPostStore so posts
 * accepted from silk peers are immediately visible on /api/posts.
 */

import * as crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { MicroPost, MicroPostStore } from './micro-post';
import logger from '../../utils/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

export const SILK_SCHEMA = 'vpc.silk-net/1' as const;

const MAX_SILK_NODES    = 1_000;
const NODE_TTL_MS       = 24 * 60 * 60 * 1_000;  // nodes expire if they don't re-announce
const GOSSIP_INTERVAL_MS = 45_000;
const GOSSIP_FANOUT     = 4;
const PUSH_TIMEOUT_MS   = 5_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SilkNode {
  readonly url: string;
  readonly nodeId: string;       // SHA-256 of canonical(url)
  readonly label: string;
  readonly silk: true;
  readonly joinedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  bridgesKnitweb: boolean;       // also runs full VPC stack → routes to main mesh
  postCount: number;
}

export interface SilkJoinRequest {
  url: string;
  label?: string;
  bridgesKnitweb?: boolean;
}

export type SilkResult = { ok: true } | { ok: false; reason: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

export function silkNodeId(url: string): string {
  return crypto.createHash('sha256')
    .update(url.trim().toLowerCase())
    .digest('hex');
}

function nowIso(): string { return new Date().toISOString(); }
function expIso(): string  { return new Date(Date.now() + NODE_TTL_MS).toISOString(); }

// ── SilkNodeRegistry ──────────────────────────────────────────────────────────

export class SilkNodeRegistry {
  private readonly nodes = new Map<string, SilkNode>();

  /**
   * Register or refresh a silk node.
   * Re-announcing resets the 24 h TTL, so long-running nodes just keep
   * calling this on a heartbeat interval.
   */
  join(req: SilkJoinRequest): SilkResult {
    const url = req.url?.trim();
    if (!url || !/^https?:\/\/.+/.test(url)) {
      return { ok: false, reason: 'url must be a valid http(s) URL' };
    }

    const id  = silkNodeId(url);
    const now = nowIso();

    const existing = this.nodes.get(id);
    if (existing) {
      existing.lastSeenAt = now;
      existing.expiresAt  = expIso();
      if (req.bridgesKnitweb !== undefined) existing.bridgesKnitweb = req.bridgesKnitweb;
      return { ok: true };
    }

    if (this.nodes.size >= MAX_SILK_NODES) {
      this._evict();
      if (this.nodes.size >= MAX_SILK_NODES) {
        return { ok: false, reason: 'silk network is at capacity — try again later' };
      }
    }

    this.nodes.set(id, {
      url,
      nodeId: id,
      label: ((req.label ?? '').trim().slice(0, 64)) || url.replace(/^https?:\/\//, '').slice(0, 32),
      silk: true,
      joinedAt: now,
      lastSeenAt: now,
      expiresAt: expIso(),
      bridgesKnitweb: req.bridgesKnitweb ?? false,
      postCount: 0,
    });
    return { ok: true };
  }

  list(onlyBridges = false): SilkNode[] {
    const now = Date.now();
    const result: SilkNode[] = [];
    for (const [id, node] of this.nodes) {
      if (new Date(node.expiresAt).getTime() < now) {
        this.nodes.delete(id);
        continue;
      }
      if (onlyBridges && !node.bridgesKnitweb) continue;
      result.push(node);
    }
    return result.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  get(id: string): SilkNode | undefined {
    const node = this.nodes.get(id);
    if (!node) return undefined;
    if (new Date(node.expiresAt).getTime() < Date.now()) {
      this.nodes.delete(id);
      return undefined;
    }
    return node;
  }

  incrementPostCount(url: string): void {
    const node = this.nodes.get(silkNodeId(url));
    if (node) node.postCount++;
  }

  size(): number { return this.nodes.size; }

  private _evict(): void {
    const now = Date.now();
    let oldest: [string, SilkNode] | null = null;
    for (const entry of this.nodes) {
      if (new Date(entry[1].expiresAt).getTime() < now) {
        this.nodes.delete(entry[0]);
        return;
      }
      if (!oldest || entry[1].lastSeenAt < oldest[1].lastSeenAt) oldest = entry;
    }
    if (oldest) this.nodes.delete(oldest[0]);
  }
}

// ── SilkGossip ────────────────────────────────────────────────────────────────

export class SilkGossip {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastGossipAt = 0;

  constructor(
    private readonly registry: SilkNodeRegistry,
    private readonly store: MicroPostStore,
    private readonly myUrl: string,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this._cycle(), GOSSIP_INTERVAL_MS);
    logger.info(`silk gossip started — fanout=${GOSSIP_FANOUT}, interval=${GOSSIP_INTERVAL_MS}ms`);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Push a freshly-published post to silk peers immediately (hot path). */
  async pushPost(post: MicroPost): Promise<void> {
    const peers = this._pick(GOSSIP_FANOUT);
    await Promise.allSettled(peers.map(p => this._push(p.url, [post])));
  }

  private async _cycle(): Promise<void> {
    const since = this.lastGossipAt;
    const posts = this.store.list(50, 0).filter(
      p => new Date(p.ts).getTime() > since,
    );
    if (!posts.length) return;
    this.lastGossipAt = Date.now();
    const peers = this._pick(GOSSIP_FANOUT);
    await Promise.allSettled(peers.map(p => this._push(p.url, posts)));
  }

  private _pick(n: number): SilkNode[] {
    const all = this.registry.list().filter(p => p.url !== this.myUrl);
    if (all.length <= n) return all;
    const out: SilkNode[] = [];
    const seen = new Set<number>();
    while (out.length < n) {
      const i = Math.floor(Math.random() * all.length);
      if (!seen.has(i)) { seen.add(i); out.push(all[i]); }
    }
    return out;
  }

  private async _push(url: string, posts: MicroPost[]): Promise<void> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PUSH_TIMEOUT_MS);
    try {
      await fetch(`${url}/api/silk/gossip/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ posts }),
        signal: ctrl.signal,
      });
    } catch {
      // best-effort; peer may be offline
    } finally {
      clearTimeout(t);
    }
  }
}

// ── REST routes ───────────────────────────────────────────────────────────────

export function registerSilkRoutes(
  app: Express,
  registry: SilkNodeRegistry,
  store: MicroPostStore,
  gossip: SilkGossip,
  myUrl: string,
): void {
  // POST /api/silk/join  — register or heartbeat a silk node
  app.post('/api/silk/join', (req: Request, res: Response) => {
    const result = registry.join(req.body as SilkJoinRequest);
    res.status(result.ok ? 200 : 400).json(result);
  });

  // GET /api/silk/nodes  — list all live silk nodes
  app.get('/api/silk/nodes', (_req: Request, res: Response) => {
    const nodes = registry.list();
    res.json({ nodes, total: nodes.length });
  });

  // GET /api/silk/bridges  — bridge nodes only (route to knitweb)
  app.get('/api/silk/bridges', (_req: Request, res: Response) => {
    res.json({ nodes: registry.list(true) });
  });

  // GET /api/silk/stats  — network overview
  app.get('/api/silk/stats', (_req: Request, res: Response) => {
    const nodes = registry.list();
    const bridges = nodes.filter(n => n.bridgesKnitweb);
    res.json({
      schema: SILK_SCHEMA,
      silk: {
        nodes: nodes.length,
        bridges: bridges.length,
        posts: store.size(),
        myUrl,
      },
      knitweb: {
        reachable: bridges.length > 0,
        bridgeUrls: bridges.map(n => n.url),
      },
    });
  });

  // POST /api/silk/gossip/push  — receive gossip from a silk peer
  app.post('/api/silk/gossip/push', (req: Request, res: Response) => {
    const posts: MicroPost[] = Array.isArray(req.body?.posts) ? req.body.posts : [];
    let accepted = 0;
    for (const p of posts) {
      if (store.add(p).ok) accepted++;
    }
    res.json({ ok: true, accepted, total: posts.length });
  });

  // POST /api/silk/post  — convenience: publish via silk (no DID required)
  // The post still goes through validatePost() in MicroPostStore.add()
  app.post('/api/silk/post', async (req: Request, res: Response) => {
    const { line1, line2 = '', author = 'did:silk:anonymous', signature = '', ts } = req.body ?? {};
    if (!line1) { res.status(400).json({ ok: false, reason: 'line1 is required' }); return; }

    const { computePostId, MICRO_POST_SCHEMA } = await import('./micro-post');
    const timestamp = ts ?? new Date().toISOString();
    const id = computePostId(line1, line2, author, timestamp);
    const post: MicroPost = {
      schema: MICRO_POST_SCHEMA,
      id, line1, line2, author, signature, ts: timestamp,
    };
    const result = store.add(post);
    if (!result.ok) { res.status(400).json(result); return; }

    // Track post count for the registering node (if the sender included their URL)
    const senderUrl = req.body?.senderUrl;
    if (senderUrl) registry.incrementPostCount(senderUrl);

    // Hot-push to silk peers
    gossip.pushPost(post).catch(() => {});
    res.status(201).json({ ok: true, id });
  });
}
