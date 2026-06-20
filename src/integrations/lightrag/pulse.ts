/**
 * Pulse (PLS) — utility token economy of the knitweb
 *
 * Mining: a knot (post) confirmed by 3 unique validators earns Pulse for
 * the poster and for each validator. No staking or payment required — good
 * content + honest validation is the only work required.
 *
 * Voting: any spider with a non-zero Pulse balance is voting-eligible.
 * Free silk spiders start non-voting; they graduate the moment their first
 * knot is confirmed (or when they have validated 3 knots of others).
 *
 * Burn: Pulse in a wallet with no activity for 3 months is burned. This
 * makes PLS a pure utility token — it circulates or it disappears.
 *
 * Founders: the validation mechanism itself is the founder reward. Laying
 * the first knots in an empty network is the earliest mining opportunity.
 * No special allocation; no pre-mine.
 */

import * as crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { MicroPostStore } from './micro-post';
import logger from '../../utils/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

export const PULSE_SCHEMA           = 'vpc.pulse/1' as const;
export const VALIDATORS_REQUIRED    = 3;
export const PULSE_POSTER_REWARD    = 10;   // micro-PLS to poster on confirmation
export const PULSE_VALIDATOR_REWARD = 3;    // micro-PLS to each validator on confirmation
export const BURN_INACTIVE_MS       = 90 * 24 * 60 * 60 * 1_000;  // 3 months
export const MIN_PULSE_TO_VOTE      = 1;    // any balance ≥ 1 micro-PLS → eligible
export const GC_INTERVAL_MS         = 60 * 60 * 1_000;             // hourly burn sweep

// ── Data types ────────────────────────────────────────────────────────────────

export interface PulseBalance {
  readonly did: string;
  balance: number;            // spendable micro-PLS
  locked: number;             // frozen in open risk-knot stakes
  earnedTotal: number;        // lifetime earned (never decremented)
  burnedTotal: number;        // lifetime burned (inactive sweep + lost stakes)
  lastActivityAt: string;     // ISO-8601 — any earn/spend/stake resets this
  createdAt: string;
}

export interface KnotValidation {
  readonly postId: string;
  readonly posterDid: string;
  validations: Array<{ validatorDid: string; ts: string }>;
  confirmed: boolean;
  confirmedAt?: string;
  rewardPaid: boolean;
}

export type PulseResult =
  | { ok: true; event: 'validated' | 'confirmed'; earned?: number }
  | { ok: false; reason: string };

// ── PulseWalletStore ──────────────────────────────────────────────────────────

export class PulseWalletStore {
  private readonly wallets = new Map<string, PulseBalance>();
  private totalBurned = 0;

  getOrCreate(did: string): PulseBalance {
    let w = this.wallets.get(did);
    if (!w) {
      const now = new Date().toISOString();
      w = { did, balance: 0, locked: 0, earnedTotal: 0, burnedTotal: 0, lastActivityAt: now, createdAt: now };
      this.wallets.set(did, w);
    }
    return w;
  }

  /** Lock µPLS into a risk stake. Returns false if insufficient spendable balance. */
  lock(did: string, amount: number): boolean {
    const w = this.getOrCreate(did);
    if (w.balance < amount) return false;
    w.balance        -= amount;
    w.locked         += amount;
    w.lastActivityAt  = new Date().toISOString();
    return true;
  }

  /** Release locked µPLS back to spendable (on stake resolution). */
  unlock(did: string, amount: number): void {
    const w = this.getOrCreate(did);
    const release     = Math.min(amount, w.locked);
    w.locked         -= release;
    w.balance        += release;
    w.lastActivityAt  = new Date().toISOString();
  }

  /** Burn locked µPLS (wrong-stake penalty). */
  slashLocked(did: string, amount: number): void {
    const w = this.getOrCreate(did);
    const slash       = Math.min(amount, w.locked);
    w.locked         -= slash;
    w.burnedTotal    += slash;
    this.totalBurned += slash;
    w.lastActivityAt  = new Date().toISOString();
  }

  get(did: string): PulseBalance | undefined {
    return this.wallets.get(did);
  }

  earn(did: string, amount: number): void {
    const w = this.getOrCreate(did);
    w.balance        += amount;
    w.earnedTotal    += amount;
    w.lastActivityAt  = new Date().toISOString();
  }

  isVotingEligible(did: string): boolean {
    const w = this.wallets.get(did);
    // locked Pulse counts — you remain eligible while staked on a risk knot
    return !!w && (w.balance + w.locked) >= MIN_PULSE_TO_VOTE;
  }

  /**
   * Sweep wallets inactive for ≥ BURN_INACTIVE_MS and zero their balance.
   * Returns summary of what was burned.
   */
  runBurn(): { walletsAffected: number; microPlsBurned: number } {
    const cutoff = Date.now() - BURN_INACTIVE_MS;
    let walletsAffected = 0;
    let microPlsBurned  = 0;

    for (const w of this.wallets.values()) {
      // Only sweep spendable balance; locked stakes belong to open risk knots
      if (w.balance > 0 && new Date(w.lastActivityAt).getTime() < cutoff) {
        microPlsBurned  += w.balance;
        w.burnedTotal   += w.balance;
        w.balance        = 0;
        walletsAffected++;
        this.totalBurned += microPlsBurned;
        logger.info(`pulse burn: ${w.did.slice(0, 24)}… — ${w.burnedTotal} µPLS burned`);
      }
    }
    return { walletsAffected, microPlsBurned };
  }

  stats(): {
    wallets: number;
    circulating: number;
    locked: number;
    earnedAllTime: number;
    burnedAllTime: number;
  } {
    let circulating = 0;
    let locked      = 0;
    let earnedAllTime = 0;
    for (const w of this.wallets.values()) {
      circulating   += w.balance;
      locked        += w.locked;
      earnedAllTime += w.earnedTotal;
    }
    return { wallets: this.wallets.size, circulating, locked, earnedAllTime, burnedAllTime: this.totalBurned };
  }

  list(): PulseBalance[] {
    return [...this.wallets.values()].sort((a, b) => b.balance - a.balance);
  }
}

// ── KnotValidationStore ───────────────────────────────────────────────────────

export class KnotValidationStore {
  private readonly knots = new Map<string, KnotValidation>();

  /**
   * Record a spider's validation of a knot.
   *
   * Rules:
   *  - A spider cannot validate their own knot.
   *  - A spider can only validate a given knot once.
   *  - Confirmation fires on the 3rd unique validator.
   *
   * Returns: { newlyConfirmed: true } when this vote triggers confirmation.
   */
  validate(
    postId: string,
    posterDid: string,
    validatorDid: string,
  ): { ok: true; newlyConfirmed: boolean } | { ok: false; reason: string } {
    if (validatorDid === posterDid) {
      return { ok: false, reason: 'cannot validate your own knot' };
    }

    let kv = this.knots.get(postId);
    if (!kv) {
      kv = { postId, posterDid, validations: [], confirmed: false, rewardPaid: false };
      this.knots.set(postId, kv);
    }

    if (kv.confirmed) {
      return { ok: false, reason: 'knot already confirmed — no further validations needed' };
    }

    if (kv.validations.some(v => v.validatorDid === validatorDid)) {
      return { ok: false, reason: 'already validated this knot' };
    }

    kv.validations.push({ validatorDid, ts: new Date().toISOString() });

    if (kv.validations.length >= VALIDATORS_REQUIRED) {
      kv.confirmed    = true;
      kv.confirmedAt  = new Date().toISOString();
      return { ok: true, newlyConfirmed: true };
    }

    return { ok: true, newlyConfirmed: false };
  }

  get(postId: string): KnotValidation | undefined {
    return this.knots.get(postId);
  }

  markRewardPaid(postId: string): void {
    const kv = this.knots.get(postId);
    if (kv) kv.rewardPaid = true;
  }

  size(): number { return this.knots.size; }
}

// ── PulseEngine ───────────────────────────────────────────────────────────────

export class PulseEngine {
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly wallets: PulseWalletStore,
    readonly knots: KnotValidationStore,
  ) {}

  /**
   * A spider validates a knot. If this is the 3rd unique validation:
   *  - poster earns PULSE_POSTER_REWARD
   *  - each of the 3 validators earns PULSE_VALIDATOR_REWARD
   */
  validate(postId: string, posterDid: string, validatorDid: string): PulseResult {
    const result = this.knots.validate(postId, posterDid, validatorDid);
    if (!result.ok) return result;

    if (!result.newlyConfirmed) {
      const kv    = this.knots.get(postId)!;
      const count = kv.validations.length;
      return {
        ok: true,
        event: 'validated',
        earned: 0,
      };
    }

    // Confirmation — mint Pulse
    const kv = this.knots.get(postId)!;
    this.wallets.earn(posterDid, PULSE_POSTER_REWARD);
    for (const v of kv.validations) {
      this.wallets.earn(v.validatorDid, PULSE_VALIDATOR_REWARD);
    }
    this.knots.markRewardPaid(postId);

    logger.info(
      `pulse mined: knot ${postId.slice(0, 12)}… confirmed — ` +
      `poster +${PULSE_POSTER_REWARD} µPLS, validators +${PULSE_VALIDATOR_REWARD} µPLS each`,
    );

    return { ok: true, event: 'confirmed', earned: PULSE_POSTER_REWARD };
  }

  startGc(): void {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => {
      const result = this.wallets.runBurn();
      if (result.walletsAffected > 0) {
        logger.info(`pulse gc: burned ${result.microPlsBurned} µPLS across ${result.walletsAffected} inactive wallets`);
      }
    }, GC_INTERVAL_MS);
  }

  stopGc(): void {
    if (this.gcTimer) { clearInterval(this.gcTimer); this.gcTimer = null; }
  }
}

// ── REST routes ───────────────────────────────────────────────────────────────

export function registerPulseRoutes(
  app: Express,
  engine: PulseEngine,
  store: MicroPostStore,
): void {
  // GET /api/pulse/stats  — token economy overview
  app.get('/api/pulse/stats', (_req: Request, res: Response) => {
    res.json({
      schema: PULSE_SCHEMA,
      economy: engine.wallets.stats(),
      constants: {
        validatorsRequired: VALIDATORS_REQUIRED,
        posterReward:       PULSE_POSTER_REWARD,
        validatorReward:    PULSE_VALIDATOR_REWARD,
        burnAfterMonths:    3,
        minPulseToVote:     MIN_PULSE_TO_VOTE,
      },
    });
  });

  // GET /api/pulse/wallet/:did  — wallet balance + eligibility
  app.get('/api/pulse/wallet/:did', (req: Request, res: Response) => {
    const did = req.params.did;
    const w   = engine.wallets.get(did);
    if (!w) {
      res.json({
        did,
        balance:         0,
        locked:          0,
        earnedTotal:     0,
        burnedTotal:     0,
        votingEligible:  false,
        lastActivityAt:  null,
        createdAt:       null,
      });
      return;
    }
    res.json({ ...w, votingEligible: engine.wallets.isVotingEligible(did) });
  });

  // GET /api/pulse/eligible/:did  — quick voting eligibility check
  app.get('/api/pulse/eligible/:did', (req: Request, res: Response) => {
    const eligible = engine.wallets.isVotingEligible(req.params.did);
    res.json({ did: req.params.did, votingEligible: eligible });
  });

  // GET /api/pulse/wallets  — leaderboard (top 50 by balance)
  app.get('/api/pulse/wallets', (_req: Request, res: Response) => {
    res.json({ wallets: engine.wallets.list().slice(0, 50) });
  });

  // GET /api/pulse/knot/:postId  — validation status of a knot
  app.get('/api/pulse/knot/:postId', (req: Request, res: Response) => {
    const kv = engine.knots.get(req.params.postId);
    if (!kv) {
      res.json({
        postId:     req.params.postId,
        validations: 0,
        confirmed:  false,
        rewardPaid: false,
      });
      return;
    }
    res.json({
      postId:       kv.postId,
      posterDid:    kv.posterDid,
      validations:  kv.validations.length,
      validators:   kv.validations.map(v => v.validatorDid),
      confirmed:    kv.confirmed,
      confirmedAt:  kv.confirmedAt,
      rewardPaid:   kv.rewardPaid,
      needed:       Math.max(0, VALIDATORS_REQUIRED - kv.validations.length),
    });
  });

  // POST /api/pulse/validate/:postId  — spider validates a knot
  // Body: { validatorDid: string }
  app.post('/api/pulse/validate/:postId', (req: Request, res: Response) => {
    const postId = req.params.postId;
    const { validatorDid } = req.body ?? {};
    if (!validatorDid) {
      res.status(400).json({ ok: false, reason: 'validatorDid is required' });
      return;
    }

    const post = store.get(postId);
    if (!post) {
      res.status(404).json({ ok: false, reason: 'knot not found in store' });
      return;
    }

    const result = engine.validate(postId, post.author, validatorDid);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }

    const kv = engine.knots.get(postId)!;
    res.json({
      ...result,
      validations:  kv.validations.length,
      confirmed:    kv.confirmed,
      needed:       Math.max(0, VALIDATORS_REQUIRED - kv.validations.length),
      posterDid:    post.author,
    });
  });
}
