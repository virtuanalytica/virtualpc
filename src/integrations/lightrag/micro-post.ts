/**
 * P2P Micro-Post Network
 *
 * Atomic content unit: exactly 2 lines of text, content-addressed by
 * SHA-256. Posts are immutable — changing any character yields a new id.
 *
 * Optional TTL: a post may carry an expiresAt timestamp. After that moment
 * every node is free to drop it. An optional chain anchor records proof
 * that the commitment existed on-chain before expiry (not the content —
 * the hash only; privacy preserved).
 *
 * DAO governance: the network can vote on parameters (line length, TTL
 * bounds, node cap). A quorum of DID-signed yes-votes activates a proposal.
 * Parameters live in DaoParamStore and are consulted on every add().
 *
 * P2P propagation: new posts are gossiped to known peers via
 * POST /api/posts/gossip/push (same pattern as p2p-gossip.ts).
 */

import * as crypto from 'node:crypto';
import { join } from 'node:path';
import type { Express, Request, Response } from 'express';
import { FileSnapshotStorage, type SnapshotStorage } from './storage-port';
import logger from '../../utils/logger';

// ── Schema tag ────────────────────────────────────────────────────────────────

export const MICRO_POST_SCHEMA = 'vpc.micro-post/1' as const;

// ── DAO-governed parameters ───────────────────────────────────────────────────

export interface DaoParams {
  readonly maxLines: 2;              // immutable — the 2-line contract
  maxLineLength: number;             // chars per line (default 140)
  maxTtlMs: number;                  // longest allowed TTL (default 30 days)
  minTtlMs: number;                  // shortest allowed TTL (default 1 hour)
  requireTtl: boolean;               // every post must carry a TTL
  maxStoredPosts: number;            // per-node LRU cap (default 10 000)
  quorumFraction: number;            // fraction of voters needed to pass a proposal
}

export const DEFAULT_DAO_PARAMS: DaoParams = {
  maxLines: 2,
  maxLineLength: 140,
  maxTtlMs: 30 * 24 * 60 * 60 * 1_000,
  minTtlMs: 60 * 60 * 1_000,
  requireTtl: false,
  maxStoredPosts: 10_000,
  quorumFraction: 0.51,
};

// ── Data model ────────────────────────────────────────────────────────────────

export interface ChainAnchor {
  network: string;    // 'vpc-mainnet' | 'ethereum' | 'bitcoin' | …
  txHash: string;     // commitment hash on that chain (hash of post.id, not content)
  minedAt?: string;   // ISO-8601, set once confirmed
}

export interface PostTtl {
  expiresAt: string;           // ISO-8601 UTC hard-expiry
  chainAnchor?: ChainAnchor;   // optional on-chain proof
}

export interface MicroPost {
  schema: typeof MICRO_POST_SCHEMA;
  id: string;         // SHA-256 hex of canonical body — content address
  line1: string;      // required, trimmed, ≤ maxLineLength chars
  line2: string;      // second line (empty string when absent)
  author: string;     // DID of publisher
  signature: string;  // DID signature over id (empty string = unsigned)
  ts: string;         // ISO-8601 UTC producer timestamp
  ttl?: PostTtl;      // optional self-destruct / chain anchor
}

// ── Hashing ───────────────────────────────────────────────────────────────────

export function canonicalBody(line1: string, line2: string, author: string, ts: string): string {
  return JSON.stringify({ line1, line2, author, ts });
}

export function computePostId(line1: string, line2: string, author: string, ts: string): string {
  return crypto.createHash('sha256').update(canonicalBody(line1, line2, author, ts)).digest('hex');
}

// ── Validation ────────────────────────────────────────────────────────────────

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validatePost(post: MicroPost, params: DaoParams = DEFAULT_DAO_PARAMS): ValidationResult {
  const l1 = post.line1?.trim() ?? '';
  const l2 = post.line2 ?? '';

  if (!l1) return { ok: false, reason: 'line1 is required and cannot be blank' };
  if (l1.length > params.maxLineLength)
    return { ok: false, reason: `line1 exceeds ${params.maxLineLength} chars (got ${l1.length})` };
  if (l2.length > params.maxLineLength)
    return { ok: false, reason: `line2 exceeds ${params.maxLineLength} chars (got ${l2.length})` };

  const expectedId = computePostId(l1, l2, post.author ?? '', post.ts ?? '');
  if (post.id !== expectedId)
    return { ok: false, reason: `id mismatch: expected ${expectedId}` };

  if (params.requireTtl && !post.ttl)
    return { ok: false, reason: 'DAO params require every post to carry a TTL' };

  if (post.ttl) {
    const expiresAt = new Date(post.ttl.expiresAt);
    if (isNaN(expiresAt.getTime()))
      return { ok: false, reason: 'ttl.expiresAt is not a valid ISO-8601 date' };

    const postTs = new Date(post.ts).getTime();
    const ttlMs = expiresAt.getTime() - postTs;

    if (ttlMs < params.minTtlMs)
      return { ok: false, reason: `TTL too short: ${ttlMs} ms (min ${params.minTtlMs} ms)` };
    if (ttlMs > params.maxTtlMs)
      return { ok: false, reason: `TTL too long: ${ttlMs} ms (max ${params.maxTtlMs} ms)` };
    if (expiresAt.getTime() <= Date.now())
      return { ok: false, reason: 'post has already expired' };
  }

  return { ok: true };
}

// ── Content-addressed store with TTL eviction ─────────────────────────────────

export const STORE_SNAPSHOT_VERSION = 1;

export interface StoreSnapshot {
  version: typeof STORE_SNAPSHOT_VERSION;
  savedAt: string;
  posts: MicroPost[];
}

export class MicroPostStore {
  private readonly posts = new Map<string, MicroPost>();
  private readonly order: string[] = [];   // insertion order for LRU
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _params: DaoParams;
  private readonly storage: SnapshotStorage | null;
  private readonly debounceMs: number;

  constructor(
    params: DaoParams = DEFAULT_DAO_PARAMS,
    opts: { storage?: string | SnapshotStorage; debounceMs?: number } = {},
  ) {
    this._params = { ...params };
    this.debounceMs = opts.debounceMs ?? 2_000;
    if (opts.storage === undefined) {
      this.storage = null;
    } else {
      this.storage = typeof opts.storage === 'string'
        ? new FileSnapshotStorage(opts.storage)
        : opts.storage;
    }
  }

  get params(): Readonly<DaoParams> { return this._params; }

  applyParams(delta: Partial<Omit<DaoParams, 'maxLines'>>): void {
    Object.assign(this._params, delta);
  }

  /** Add a post. Idempotent — adding the same id twice is a no-op. */
  add(post: MicroPost): ValidationResult {
    const v = validatePost(post, this._params);
    if (!v.ok) return v;
    if (this.posts.has(post.id)) return { ok: true };

    while (this.order.length >= this._params.maxStoredPosts) {
      const evicted = this.order.shift()!;
      this.posts.delete(evicted);
    }

    this.posts.set(post.id, post);
    this.order.push(post.id);
    this._scheduleSave();
    return { ok: true };
  }

  /** Retrieve by content hash; returns undefined if not found or expired. */
  get(id: string): MicroPost | undefined {
    const post = this.posts.get(id);
    if (!post) return undefined;
    if (post.ttl && new Date(post.ttl.expiresAt) <= new Date()) {
      this._evict(id);
      return undefined;
    }
    return post;
  }

  /** Attach a chain anchor to an existing post (called once tx is mined). */
  setChainAnchor(id: string, anchor: ChainAnchor): boolean {
    const post = this.get(id);
    if (!post || !post.ttl) return false;
    this.posts.set(id, { ...post, ttl: { ...post.ttl, chainAnchor: anchor } });
    return true;
  }

  /** List live (non-expired) posts, newest first. */
  list(limit = 50, offset = 0): MicroPost[] {
    const now = new Date();
    const live: MicroPost[] = [];
    for (let i = this.order.length - 1; i >= 0; i--) {
      const p = this.posts.get(this.order[i]);
      if (p && (!p.ttl || new Date(p.ttl.expiresAt) > now)) {
        live.push(p);
        if (live.length === offset + limit) break;
      }
    }
    return live.slice(offset, offset + limit);
  }

  size(): number { return this.posts.size; }

  private _evict(id: string): void {
    this.posts.delete(id);
    const i = this.order.indexOf(id);
    if (i !== -1) this.order.splice(i, 1);
  }

  /** Start periodic GC sweep for expired TTL posts. */
  startGc(intervalMs = 60_000): void {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => {
      const now = new Date();
      for (const [id, post] of this.posts) {
        if (post.ttl && new Date(post.ttl.expiresAt) <= now) this._evict(id);
      }
    }, intervalMs);
    (this.gcTimer as any).unref?.();
  }

  stopGc(): void {
    if (this.gcTimer) { clearInterval(this.gcTimer); this.gcTimer = null; }
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  private _scheduleSave(): void {
    if (!this.storage || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, this.debounceMs);
    (this.saveTimer as any).unref?.();
  }

  saveNow(): void {
    if (!this.storage) return;
    try {
      const snapshot: StoreSnapshot = {
        version: STORE_SNAPSHOT_VERSION,
        savedAt: new Date().toISOString(),
        posts: [...this.posts.values()],
      };
      this.storage.write(JSON.stringify(snapshot));
    } catch (e: any) {
      logger.warn(`micro-post store: save failed — ${e.message}`);
    }
  }

  flush(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.saveNow();
  }

  /** Load from snapshot. Call before startGc() and before wiring routes. */
  load(): { loaded: number; skipped: number } | null {
    if (!this.storage) return null;
    let raw: string | null;
    try { raw = this.storage.read(); } catch { return null; }
    if (!raw) return null;

    let snap: StoreSnapshot;
    try { snap = JSON.parse(raw); } catch (e: any) {
      logger.error(`micro-post store: snapshot corrupt — ${e.message}`);
      return null;
    }
    if (snap.version !== STORE_SNAPSHOT_VERSION) {
      logger.error(`micro-post store: unsupported snapshot version ${snap.version}`);
      return null;
    }

    let loaded = 0; let skipped = 0;
    const now = new Date();
    for (const post of snap.posts ?? []) {
      if (post.ttl && new Date(post.ttl.expiresAt) <= now) { skipped++; continue; }
      const r = this.add(post);
      if (r.ok) loaded++; else skipped++;
    }
    logger.info(`micro-post store: loaded ${loaded} posts (${skipped} expired/invalid)`);
    return { loaded, skipped };
  }
}

// ── DAO parameter governance ──────────────────────────────────────────────────

export interface DaoProposal {
  id: string;
  proposer: string;          // DID
  changes: Partial<Omit<DaoParams, 'maxLines'>>;
  reason: string;
  ts: string;
  expiresAt: string;         // voting deadline
  votes: { yes: string[]; no: string[] };
  status: 'open' | 'accepted' | 'rejected';
}

export class DaoParamStore {
  private readonly proposals = new Map<string, DaoProposal>();
  private readonly voters = new Set<string>();   // registered DIDs

  constructor(private readonly store: MicroPostStore) {}

  registerVoter(did: string): void { this.voters.add(did); }
  voterCount(): number { return this.voters.size; }

  propose(proposer: string, changes: DaoProposal['changes'], reason: string, ttlMs = 7 * 24 * 60 * 60 * 1_000): DaoProposal {
    const id = crypto.randomUUID();
    const now = new Date();
    const proposal: DaoProposal = {
      id,
      proposer,
      changes,
      reason,
      ts: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      votes: { yes: [], no: [] },
      status: 'open',
    };
    this.proposals.set(id, proposal);
    return proposal;
  }

  vote(proposalId: string, voter: string, approve: boolean): { ok: boolean; reason?: string } {
    const p = this.proposals.get(proposalId);
    if (!p) return { ok: false, reason: 'proposal not found' };
    if (p.status !== 'open') return { ok: false, reason: 'proposal is not open' };
    if (new Date(p.expiresAt) <= new Date()) {
      p.status = 'rejected';
      return { ok: false, reason: 'voting period expired' };
    }
    if (p.votes.yes.includes(voter) || p.votes.no.includes(voter))
      return { ok: false, reason: 'already voted' };

    (approve ? p.votes.yes : p.votes.no).push(voter);
    this._tally(p);
    return { ok: true };
  }

  getProposal(id: string): DaoProposal | undefined { return this.proposals.get(id); }

  listProposals(status?: DaoProposal['status']): DaoProposal[] {
    const all = [...this.proposals.values()];
    return status ? all.filter(p => p.status === status) : all;
  }

  private _tally(p: DaoProposal): void {
    const total = this.voters.size || (p.votes.yes.length + p.votes.no.length);
    const quorum = this.store.params.quorumFraction;
    if (p.votes.yes.length / total > quorum) {
      p.status = 'accepted';
      this.store.applyParams(p.changes);
      logger.info(`dao: proposal ${p.id} accepted — params updated`);
    } else if (p.votes.no.length / total > quorum) {
      p.status = 'rejected';
    }
  }
}

// ── P2P peer gossip ───────────────────────────────────────────────────────────

export interface GossipPeer {
  url: string;       // base URL of the peer node
  lastSeenAt?: string;
}

export class MicroPostGossip {
  private peers: GossipPeer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private stats = { pushed: 0, received: 0, errors: 0 };
  private lastPushedAt: number = Date.now();

  constructor(
    private readonly store: MicroPostStore,
    peers: string[] = [],
    private readonly intervalMs = 30_000,
  ) {
    this.peers = peers.map(url => ({ url }));
  }

  addPeer(url: string): void {
    if (!this.peers.find(p => p.url === url)) this.peers.push({ url });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this._gossipRound(), this.intervalMs);
    (this.timer as any).unref?.();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  getStats() { return { ...this.stats, peers: this.peers.length }; }

  private async _gossipRound(): Promise<void> {
    if (!this.peers.length) return;
    const since = this.lastPushedAt;
    this.lastPushedAt = Date.now();

    const posts = this.store.list(100, 0).filter(
      p => new Date(p.ts).getTime() >= since,
    );
    if (!posts.length) return;

    const peer = this.peers[Math.floor(Math.random() * this.peers.length)];
    try {
      const res = await fetch(`${peer.url}/api/posts/gossip/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ posts }),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        this.stats.pushed += posts.length;
        peer.lastSeenAt = new Date().toISOString();
      }
    } catch {
      this.stats.errors++;
    }
  }
}

// ── REST routes ───────────────────────────────────────────────────────────────

export function registerMicroPostRoutes(
  app: Express,
  store: MicroPostStore,
  dao: DaoParamStore,
  gossip?: MicroPostGossip,
): void {
  // ── Posts ──────────────────────────────────────────────────────────────────

  /** Publish a new micro-post. */
  app.post('/api/posts', (req: Request, res: Response) => {
    const body = req.body as Record<string, any>;
    const line1: string = (body.line1 ?? '').trim();
    const line2: string = (body.line2 ?? '').trim();
    const author: string = body.author ?? '';

    if (!line1 || !author) {
      res.status(400).json({ error: 'line1 and author are required' });
      return;
    }

    const ts = body.ts ?? new Date().toISOString();
    const id = computePostId(line1, line2, author, ts);

    const post: MicroPost = {
      schema: MICRO_POST_SCHEMA,
      id,
      line1,
      line2,
      author,
      signature: body.signature ?? '',
      ts,
      ...(body.ttl ? { ttl: body.ttl as PostTtl } : {}),
    };

    const result = store.add(post);
    if (!result.ok) {
      res.status(422).json({ error: result.reason });
      return;
    }

    logger.debug(`micro-post published: ${id} by ${author}`);
    res.status(201).json({ id, post });
  });

  /** Fetch a post by content hash. */
  app.get('/api/posts/:id', (req: Request, res: Response) => {
    const post = store.get(req.params.id);
    if (!post) { res.status(404).json({ error: 'not found or expired' }); return; }
    res.json(post);
  });

  /** List live posts. */
  app.get('/api/posts', (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json({ posts: store.list(limit, offset), total: store.size() });
  });

  /** Attach a chain anchor to an existing post once a tx is mined. */
  app.post('/api/posts/:id/anchor', (req: Request, res: Response) => {
    const anchor = req.body as ChainAnchor;
    if (!anchor.network || !anchor.txHash) {
      res.status(400).json({ error: 'network and txHash are required' });
      return;
    }
    const ok = store.setChainAnchor(req.params.id, anchor);
    if (!ok) { res.status(404).json({ error: 'post not found, has no TTL, or is expired' }); return; }
    res.json({ anchored: true });
  });

  // ── P2P gossip receive ─────────────────────────────────────────────────────

  /** Peer push: accept gossiped posts from a peer node. */
  app.post('/api/posts/gossip/push', (req: Request, res: Response) => {
    const posts: MicroPost[] = Array.isArray(req.body?.posts) ? req.body.posts : [];
    let accepted = 0;
    for (const p of posts) {
      if (store.add(p).ok) { accepted++; gossip?.getStats(); }
    }
    res.json({ accepted, total: posts.length });
  });

  /** Add a peer to this node's gossip ring. */
  app.post('/api/posts/gossip/peers', (req: Request, res: Response) => {
    const url: string = req.body?.url ?? '';
    if (!url.startsWith('http')) { res.status(400).json({ error: 'url required' }); return; }
    gossip?.addPeer(url);
    res.json({ added: url, stats: gossip?.getStats() ?? null });
  });

  // ── DAO parameter governance ───────────────────────────────────────────────

  /** Current DAO network parameters. */
  app.get('/api/posts/dao/params', (_req: Request, res: Response) => {
    res.json(store.params);
  });

  /** Propose a parameter change. */
  app.post('/api/posts/dao/propose', (req: Request, res: Response) => {
    const { proposer, changes, reason, ttlMs } = req.body as any;
    if (!proposer || !changes || !reason) {
      res.status(400).json({ error: 'proposer, changes, and reason are required' });
      return;
    }
    const proposal = dao.propose(proposer, changes, reason, ttlMs);
    res.status(201).json(proposal);
  });

  /** Cast a vote on an open proposal. */
  app.post('/api/posts/dao/proposals/:id/vote', (req: Request, res: Response) => {
    const { voter, approve } = req.body as any;
    if (!voter || typeof approve !== 'boolean') {
      res.status(400).json({ error: 'voter (DID) and approve (boolean) are required' });
      return;
    }
    const result = dao.vote(req.params.id, voter, approve);
    if (!result.ok) { res.status(422).json({ error: result.reason }); return; }
    res.json({ voted: true, proposal: dao.getProposal(req.params.id) });
  });

  /** List proposals (optionally filtered by status). */
  app.get('/api/posts/dao/proposals', (req: Request, res: Response) => {
    const status = req.query.status as DaoProposal['status'] | undefined;
    res.json(dao.listProposals(status));
  });

  /** Register a DID as a DAO voter. */
  app.post('/api/posts/dao/voters', (req: Request, res: Response) => {
    const did: string = req.body?.did ?? '';
    if (!did.startsWith('did:')) { res.status(400).json({ error: 'valid DID required' }); return; }
    dao.registerVoter(did);
    res.json({ registered: did, voters: dao.voterCount() });
  });
}
