/**
 * Risk-Knot staking — Pulse locked on uncertain knowledge claims
 *
 * A risk knot is any knot whose truth is contested or unknown (e.g.
 * "coordinates of the centre of Mars").  Spiders stake Pulse on YES
 * (claim is correct) or NO (claim is incorrect).  Pulse is locked
 * (not burned, not spendable) while the knot is open.
 *
 * Locking levels set a minimum stake per position:
 *   L1 =     10 µPLS  (casual opinion)
 *   L2 =    100 µPLS  (confident assertion)
 *   L3 =  1 000 µPLS  (strong conviction)
 *
 * Resolution fires when votes reach RISK_VOTE_THRESHOLD and one side
 * holds ≥ RISK_CONSENSUS_FRACTION of the vote weight.
 *
 * Reward formula for correct stakers:
 *   multiplier = voteCount / VALIDATORS_REQUIRED   (≥ 1.0)
 *   reward     = stakedAmount × multiplier
 *              + proportional share of the losing pool
 *              − BURN_FRACTION burned from losing pool (deflationary)
 *
 * Wrong stakers lose their locked stake entirely.
 *
 * Pulse stays HIGH by design:  staking locks, not spends.  A spider
 * with 10 000 µPLS staked across 50 open risk knots keeps all 10 000
 * in their total balance — only spendable balance drops.
 */

import * as crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { PulseWalletStore } from './pulse';
import logger from '../../utils/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

export const RISK_SCHEMA            = 'vpc.risk-knot/1' as const;

export const LOCK_LEVELS = {
  1: 10,      // µPLS
  2: 100,
  3: 1_000,
} as const;
export type LockLevel = keyof typeof LOCK_LEVELS;

export const RISK_VOTE_THRESHOLD     = 5;     // min votes before resolution
export const RISK_CONSENSUS_FRACTION = 2 / 3; // fraction needed to resolve
export const BURN_FRACTION           = 0.1;   // 10% of losing pool burned (deflationary)
export const VALIDATORS_REQUIRED     = 3;     // base for multiplier calculation

// ── Types ─────────────────────────────────────────────────────────────────────

export type Position = 'yes' | 'no';

export interface RiskStake {
  readonly stakerDid: string;
  readonly position: Position;
  readonly amount: number;        // µPLS locked
  readonly level: LockLevel;
  readonly stakedAt: string;
}

export interface RiskVote {
  readonly voterDid: string;
  readonly position: Position;
  readonly ts: string;
}

export type RiskKnotStatus = 'open' | 'resolved';

export interface RiskKnot {
  readonly id: string;            // SHA-256 of (knotId + openedAt)
  readonly knotId: string;        // linked micro-post id
  readonly question: string;      // what is being staked on (≤ 280 chars)
  readonly openedBy: string;      // DID of spider who opened the risk
  readonly openedAt: string;
  status: RiskKnotStatus;
  closedAt?: string;
  outcome?: Position;             // 'yes' | 'no' after resolution
  stakes: RiskStake[];
  votes: RiskVote[];
  // Computed at resolution
  multiplier?: number;
  yesPool: number;                // total µPLS staked YES
  noPool: number;                 // total µPLS staked NO
}

export type RiskResult =
  | { ok: true; event: 'staked' | 'voted' | 'resolved'; riskId: string; detail?: string }
  | { ok: false; reason: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string { return new Date().toISOString(); }

function riskId(knotId: string, openedAt: string): string {
  return crypto.createHash('sha256').update(`${knotId}:${openedAt}`).digest('hex');
}

function totalPool(rk: RiskKnot): number { return rk.yesPool + rk.noPool; }

function votesFor(rk: RiskKnot, pos: Position): number {
  return rk.votes.filter(v => v.position === pos).length;
}

// ── RiskKnotStore ─────────────────────────────────────────────────────────────

export class RiskKnotStore {
  private readonly knots = new Map<string, RiskKnot>();

  /**
   * Open a new risk knot on an existing micro-post.
   * The opener must be able to lock at least LOCK_LEVELS[level] µPLS.
   */
  open(
    knotId: string,
    question: string,
    openedBy: string,
    level: LockLevel,
    wallets: PulseWalletStore,
  ): { ok: true; riskId: string } | { ok: false; reason: string } {
    if (!question.trim()) return { ok: false, reason: 'question is required' };
    if (question.length > 280) return { ok: false, reason: 'question exceeds 280 chars' };

    const openedAt = nowIso();
    const id       = riskId(knotId, openedAt);
    const minStake = LOCK_LEVELS[level];

    if (!wallets.lock(openedBy, minStake)) {
      return { ok: false, reason: `insufficient balance — L${level} requires ${minStake} µPLS` };
    }

    const rk: RiskKnot = {
      id,
      knotId,
      question: question.trim().slice(0, 280),
      openedBy,
      openedAt,
      status: 'open',
      stakes: [{ stakerDid: openedBy, position: 'yes', amount: minStake, level, stakedAt: openedAt }],
      votes: [],
      yesPool: minStake,
      noPool: 0,
    };
    this.knots.set(id, rk);
    logger.info(`risk-knot opened: ${id.slice(0, 12)}… — "${question.slice(0, 40)}" by ${openedBy.slice(0, 20)}…`);
    return { ok: true, riskId: id };
  }

  /**
   * Spider stakes Pulse on a position.
   * Stakes can accumulate — a spider may stake multiple times at different levels.
   */
  stake(
    riskId: string,
    stakerDid: string,
    position: Position,
    level: LockLevel,
    wallets: PulseWalletStore,
  ): RiskResult {
    const rk = this.knots.get(riskId);
    if (!rk)       return { ok: false, reason: 'risk knot not found' };
    if (rk.status !== 'open') return { ok: false, reason: 'risk knot is already resolved' };

    const amount = LOCK_LEVELS[level];
    if (!wallets.lock(stakerDid, amount)) {
      return { ok: false, reason: `insufficient balance — L${level} requires ${amount} µPLS` };
    }

    rk.stakes.push({ stakerDid, position, amount, level, stakedAt: nowIso() });
    if (position === 'yes') rk.yesPool += amount;
    else                    rk.noPool  += amount;

    return { ok: true, event: 'staked', riskId, detail: `${amount} µPLS locked on ${position}` };
  }

  /**
   * Spider casts a vote (separate from staking — free to vote, requires no stake).
   * Votes count toward the multiplier and toward resolution consensus.
   * A spider can vote AND stake independently.
   */
  vote(
    riskId: string,
    voterDid: string,
    position: Position,
    wallets: PulseWalletStore,
  ): RiskResult {
    const rk = this.knots.get(riskId);
    if (!rk)               return { ok: false, reason: 'risk knot not found' };
    if (rk.status !== 'open') return { ok: false, reason: 'risk knot already resolved' };
    if (rk.votes.some(v => v.voterDid === voterDid)) {
      return { ok: false, reason: 'already voted on this risk knot' };
    }

    rk.votes.push({ voterDid, position, ts: nowIso() });

    // Check if resolution threshold is reached
    const totalVotes = rk.votes.length;
    if (totalVotes >= RISK_VOTE_THRESHOLD) {
      const yesVotes = votesFor(rk, 'yes');
      const noVotes  = votesFor(rk, 'no');
      const yFrac    = yesVotes / totalVotes;
      const nFrac    = noVotes  / totalVotes;

      if (yFrac >= RISK_CONSENSUS_FRACTION || nFrac >= RISK_CONSENSUS_FRACTION) {
        const outcome: Position = yFrac >= RISK_CONSENSUS_FRACTION ? 'yes' : 'no';
        this._resolve(rk, outcome, totalVotes, wallets);
        return { ok: true, event: 'resolved', riskId, detail: `resolved ${outcome} with ${totalVotes} votes` };
      }
    }

    return { ok: true, event: 'voted', riskId };
  }

  private _resolve(
    rk: RiskKnot,
    outcome: Position,
    voteCount: number,
    wallets: PulseWalletStore,
  ): void {
    rk.status   = 'resolved';
    rk.outcome  = outcome;
    rk.closedAt = nowIso();

    // multiplier = voteCount / VALIDATORS_REQUIRED (min 1.0)
    const multiplier = Math.max(1.0, voteCount / VALIDATORS_REQUIRED);
    rk.multiplier    = multiplier;

    const losingPos: Position = outcome === 'yes' ? 'no' : 'yes';
    const losingPool = outcome === 'yes' ? rk.noPool : rk.yesPool;
    const burnAmt    = Math.floor(losingPool * BURN_FRACTION);
    const distribute = losingPool - burnAmt;

    // Winning pool total (for proportional share calculation)
    const winningPool = outcome === 'yes' ? rk.yesPool : rk.noPool;

    // Process losers — slash all locked stakes on the wrong side
    for (const s of rk.stakes.filter(s => s.position === losingPos)) {
      wallets.slashLocked(s.stakerDid, s.amount);
    }

    // Process winners — unlock stake + multiplier reward + proportional share of losing pool
    for (const s of rk.stakes.filter(s => s.position === outcome)) {
      // 1. Unlock original stake back to spendable
      wallets.unlock(s.stakerDid, s.amount);
      // 2. Multiplier bonus minted on top of original stake
      const bonus = Math.floor(s.amount * (multiplier - 1));
      if (bonus > 0) wallets.earn(s.stakerDid, bonus);
      // 3. Proportional share of losing pool (minus burn fraction)
      if (winningPool > 0) {
        const share = Math.floor(distribute * (s.amount / winningPool));
        if (share > 0) wallets.earn(s.stakerDid, share);
      }
    }

    logger.info(
      `risk-knot resolved: ${rk.id.slice(0, 12)}… → ${outcome} | ` +
      `votes=${voteCount} multiplier=${multiplier.toFixed(2)}x | ` +
      `losing pool=${losingPool} burned=${burnAmt} distributed=${distribute}`,
    );
  }

  get(id: string): RiskKnot | undefined { return this.knots.get(id); }

  list(status?: RiskKnotStatus): RiskKnot[] {
    const all = [...this.knots.values()];
    return status ? all.filter(rk => rk.status === status) : all;
  }

  size(): number { return this.knots.size; }
}

// ── REST routes ───────────────────────────────────────────────────────────────

export function registerRiskRoutes(
  app: Express,
  store: RiskKnotStore,
  wallets: PulseWalletStore,
): void {
  // GET /api/pulse/risk  — list risk knots
  app.get('/api/pulse/risk', (req: Request, res: Response) => {
    const status = req.query.status as RiskKnotStatus | undefined;
    res.json({ riskKnots: store.list(status), total: store.size() });
  });

  // GET /api/pulse/risk/:id  — single risk knot
  app.get('/api/pulse/risk/:id', (req: Request, res: Response) => {
    const rk = store.get(req.params.id);
    if (!rk) { res.status(404).json({ ok: false, reason: 'not found' }); return; }
    res.json(rk);
  });

  // POST /api/pulse/risk/open  — open a new risk knot
  // Body: { knotId, question, openedBy, level }
  app.post('/api/pulse/risk/open', (req: Request, res: Response) => {
    const { knotId, question, openedBy, level = 1 } = req.body ?? {};
    if (!knotId || !openedBy) {
      res.status(400).json({ ok: false, reason: 'knotId and openedBy are required' });
      return;
    }
    const lvl = (Number(level) as LockLevel);
    if (!(lvl in LOCK_LEVELS)) {
      res.status(400).json({ ok: false, reason: 'level must be 1, 2 or 3' });
      return;
    }
    const result = store.open(knotId, question, openedBy, lvl, wallets);
    res.status(result.ok ? 201 : 400).json(result);
  });

  // POST /api/pulse/risk/:id/stake  — add stake on open risk knot
  // Body: { stakerDid, position, level }
  app.post('/api/pulse/risk/:id/stake', (req: Request, res: Response) => {
    const { stakerDid, position, level = 1 } = req.body ?? {};
    if (!stakerDid || !position) {
      res.status(400).json({ ok: false, reason: 'stakerDid and position (yes|no) required' });
      return;
    }
    if (position !== 'yes' && position !== 'no') {
      res.status(400).json({ ok: false, reason: 'position must be yes or no' });
      return;
    }
    const lvl = (Number(level) as LockLevel);
    if (!(lvl in LOCK_LEVELS)) {
      res.status(400).json({ ok: false, reason: 'level must be 1, 2 or 3' });
      return;
    }
    const result = store.stake(req.params.id, stakerDid, position as Position, lvl, wallets);
    res.status(result.ok ? 200 : 400).json(result);
  });

  // POST /api/pulse/risk/:id/vote  — cast a vote (no stake required)
  // Body: { voterDid, position }
  app.post('/api/pulse/risk/:id/vote', (req: Request, res: Response) => {
    const { voterDid, position } = req.body ?? {};
    if (!voterDid || !position) {
      res.status(400).json({ ok: false, reason: 'voterDid and position required' });
      return;
    }
    if (position !== 'yes' && position !== 'no') {
      res.status(400).json({ ok: false, reason: 'position must be yes or no' });
      return;
    }
    const result = store.vote(req.params.id, voterDid, position as Position, wallets);
    res.status(result.ok ? 200 : 400).json(result);
  });
}
