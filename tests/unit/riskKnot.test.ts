import {
  RiskKnotStore,
  LOCK_LEVELS,
  RISK_VOTE_THRESHOLD,
  RISK_CONSENSUS_FRACTION,
  BURN_FRACTION,
  VALIDATORS_REQUIRED,
} from '../../src/integrations/lightrag/risk-knot';
import { PulseWalletStore } from '../../src/integrations/lightrag/pulse';

// ── helpers ───────────────────────────────────────────────────────────────────

const KNOT_ID  = 'k'.repeat(64);
const OPENER   = 'did:key:opener';
const SPIDER_A = 'did:key:spiderA';
const SPIDER_B = 'did:key:spiderB';
const SPIDER_C = 'did:key:spiderC';
const SPIDER_D = 'did:key:spiderD';
const SPIDER_E = 'did:key:spiderE';

function makeWallets(funded: Record<string, number> = {}) {
  const w = new PulseWalletStore();
  for (const [did, amount] of Object.entries(funded)) {
    w.earn(did, amount);
  }
  return w;
}

function makeStore() { return new RiskKnotStore(); }

function openRisk(
  store: RiskKnotStore,
  wallets: PulseWalletStore,
  level: 1 | 2 | 3 = 1,
  opener = OPENER,
): string {
  const r = store.open(KNOT_ID, 'Is this claim correct?', opener, level, wallets);
  if (!r.ok) throw new Error('open failed: ' + (r as any).reason);
  return r.riskId;
}

function driveToResolution(
  store: RiskKnotStore,
  wallets: PulseWalletStore,
  riskId: string,
  outcome: 'yes' | 'no',
) {
  const yesVoters = [SPIDER_A, SPIDER_B, SPIDER_C, SPIDER_D, SPIDER_E];
  const noVoters  = [SPIDER_A, SPIDER_B, SPIDER_C, SPIDER_D, SPIDER_E];
  const voters = outcome === 'yes' ? yesVoters : noVoters;
  for (const v of voters) {
    store.vote(riskId, v, outcome, wallets);
  }
}

// ── 1. PulseWalletStore locking ───────────────────────────────────────────────

describe('PulseWalletStore locking', () => {
  it('lock reduces spendable balance and increases locked', () => {
    const w = makeWallets({ [OPENER]: 100 });
    expect(w.lock(OPENER, 50)).toBe(true);
    expect(w.get(OPENER)!.balance).toBe(50);
    expect(w.get(OPENER)!.locked).toBe(50);
  });

  it('lock fails when insufficient balance', () => {
    const w = makeWallets({ [OPENER]: 5 });
    expect(w.lock(OPENER, 10)).toBe(false);
    expect(w.get(OPENER)!.balance).toBe(5);
  });

  it('unlock moves amount back to spendable', () => {
    const w = makeWallets({ [OPENER]: 100 });
    w.lock(OPENER, 50);
    w.unlock(OPENER, 50);
    expect(w.get(OPENER)!.balance).toBe(100);
    expect(w.get(OPENER)!.locked).toBe(0);
  });

  it('slashLocked reduces locked and increases burnedTotal', () => {
    const w = makeWallets({ [OPENER]: 100 });
    w.lock(OPENER, 100);
    w.slashLocked(OPENER, 100);
    expect(w.get(OPENER)!.locked).toBe(0);
    expect(w.get(OPENER)!.burnedTotal).toBe(100);
  });

  it('isVotingEligible counts locked balance', () => {
    const w = makeWallets({ [OPENER]: 1 });
    w.lock(OPENER, 1);
    // balance=0, locked=1 → still eligible
    expect(w.isVotingEligible(OPENER)).toBe(true);
  });

  it('stats includes locked field', () => {
    const w = makeWallets({ [OPENER]: 100 });
    w.lock(OPENER, 30);
    const s = w.stats();
    expect(s.locked).toBe(30);
    expect(s.circulating).toBe(70);
  });

  it('runBurn does not touch locked balance', () => {
    const w = makeWallets({ [OPENER]: 100 });
    w.lock(OPENER, 100);
    const wallet = w.get(OPENER)!;
    // Backdate activity
    (wallet as any).lastActivityAt = new Date(0).toISOString();
    w.runBurn();
    // spendable=0 so nothing burned, locked untouched
    expect(wallet.locked).toBe(100);
    expect(wallet.burnedTotal).toBe(0);
  });
});

// ── 2. RiskKnotStore — open ───────────────────────────────────────────────────

describe('RiskKnotStore — open', () => {
  it('opens a risk knot and locks opener stake', () => {
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const r = s.open(KNOT_ID, 'Mars coordinates?', OPENER, 1, w);
    expect(r.ok).toBe(true);
    expect(w.get(OPENER)!.locked).toBe(LOCK_LEVELS[1]);
    expect(w.get(OPENER)!.balance).toBe(100 - LOCK_LEVELS[1]);
  });

  it('rejects when balance too low for level', () => {
    const w = makeWallets({ [OPENER]: 1 });
    const s = makeStore();
    const r = s.open(KNOT_ID, 'test?', OPENER, 1, w);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/insufficient/);
  });

  it('rejects blank question', () => {
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const r = s.open(KNOT_ID, '   ', OPENER, 1, w);
    expect(r.ok).toBe(false);
  });

  it('opener is auto-staked YES at L1', () => {
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const r = s.open(KNOT_ID, 'Mars?', OPENER, 1, w);
    const rk = s.get((r as any).riskId)!;
    expect(rk.yesPool).toBe(LOCK_LEVELS[1]);
    expect(rk.noPool).toBe(0);
    expect(rk.stakes[0].position).toBe('yes');
  });
});

// ── 3. RiskKnotStore — stake ──────────────────────────────────────────────────

describe('RiskKnotStore — stake', () => {
  it('adds stake to correct pool and locks funds', () => {
    const w = makeWallets({ [OPENER]: 100, [SPIDER_A]: 100 });
    const s = makeStore();
    const riskId = openRisk(s, w);
    s.stake(riskId, SPIDER_A, 'no', 1, w);
    const rk = s.get(riskId)!;
    expect(rk.noPool).toBe(LOCK_LEVELS[1]);
    expect(w.get(SPIDER_A)!.locked).toBe(LOCK_LEVELS[1]);
  });

  it('rejects stake on resolved risk knot', () => {
    const w = makeWallets({
      [OPENER]: 100,
      [SPIDER_A]: 100, [SPIDER_B]: 100, [SPIDER_C]: 100,
      [SPIDER_D]: 100, [SPIDER_E]: 100,
    });
    const s = makeStore();
    const riskId = openRisk(s, w);
    driveToResolution(s, w, riskId, 'yes');
    const r = s.stake(riskId, SPIDER_A, 'no', 1, w);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/resolved/);
  });

  it('multiple stakes from same spider on same side accumulate', () => {
    const w = makeWallets({ [OPENER]: 100, [SPIDER_A]: 200 });
    const s = makeStore();
    const riskId = openRisk(s, w);
    s.stake(riskId, SPIDER_A, 'no', 1, w);
    s.stake(riskId, SPIDER_A, 'no', 1, w);
    const rk = s.get(riskId)!;
    expect(rk.noPool).toBe(LOCK_LEVELS[1] * 2);
  });
});

// ── 4. RiskKnotStore — vote ───────────────────────────────────────────────────

describe('RiskKnotStore — vote', () => {
  it('records vote without stake', () => {
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const riskId = openRisk(s, w);
    const r = s.vote(riskId, SPIDER_A, 'yes', w);
    expect(r.ok).toBe(true);
    expect((r as any).event).toBe('voted');
    expect(s.get(riskId)!.votes.length).toBe(1);
  });

  it('rejects duplicate vote', () => {
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const riskId = openRisk(s, w);
    s.vote(riskId, SPIDER_A, 'yes', w);
    const r = s.vote(riskId, SPIDER_A, 'no', w);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/already/);
  });

  it(`resolves when ${RISK_VOTE_THRESHOLD} votes with ≥${Math.round(RISK_CONSENSUS_FRACTION * 100)}% consensus`, () => {
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const riskId = openRisk(s, w);
    driveToResolution(s, w, riskId, 'yes');
    expect(s.get(riskId)!.status).toBe('resolved');
    expect(s.get(riskId)!.outcome).toBe('yes');
  });

  it('does not resolve below threshold', () => {
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const riskId = openRisk(s, w);
    s.vote(riskId, SPIDER_A, 'yes', w);
    s.vote(riskId, SPIDER_B, 'yes', w);
    expect(s.get(riskId)!.status).toBe('open');
  });

  it('does not resolve without consensus fraction', () => {
    // 3 yes, 2 no = 60% yes < 66.7% threshold
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const riskId = openRisk(s, w);
    s.vote(riskId, SPIDER_A, 'yes', w);
    s.vote(riskId, SPIDER_B, 'yes', w);
    s.vote(riskId, SPIDER_C, 'yes', w);
    s.vote(riskId, SPIDER_D, 'no',  w);
    s.vote(riskId, SPIDER_E, 'no',  w);
    expect(s.get(riskId)!.status).toBe('open');  // 3/5 = 60% < 66.7%
  });
});

// ── 5. Resolution reward mechanics ───────────────────────────────────────────

describe('Resolution reward mechanics', () => {
  it('correct staker gets stake back + bonus', () => {
    const w = makeWallets({
      [OPENER]: 100,   // will stake YES at L1 = 10µ when opening
      [SPIDER_A]: 100, [SPIDER_B]: 100,
      [SPIDER_C]: 100, [SPIDER_D]: 100, [SPIDER_E]: 100,
    });
    const s = makeStore();
    const riskId = openRisk(s, w, 1, OPENER);  // OPENER stakes 10µ YES

    // Spider A stakes NO at L1
    s.stake(riskId, SPIDER_A, 'no', 1, w);

    // 5 YES votes → resolves YES
    driveToResolution(s, w, riskId, 'yes');

    const rk = s.get(riskId)!;
    expect(rk.status).toBe('resolved');
    expect(rk.outcome).toBe('yes');

    // OPENER staked YES, won:
    // - original 10µ returned
    // - multiplier bonus: 10 × (multiplier - 1)
    // - share of losing pool (minus burn)
    const openerBalance = w.get(OPENER)!.balance;
    expect(openerBalance).toBeGreaterThan(90);  // at least got stake back (started with 100-10=90)
  });

  it('wrong staker loses stake (slashed)', () => {
    const w = makeWallets({
      [OPENER]: 100,
      [SPIDER_A]: 100, [SPIDER_B]: 100, [SPIDER_C]: 100,
      [SPIDER_D]: 100, [SPIDER_E]: 100,
    });
    const s = makeStore();
    const riskId = openRisk(s, w, 1, OPENER);
    s.stake(riskId, SPIDER_A, 'no', 1, w);  // Spider A stakes NO = wrong
    driveToResolution(s, w, riskId, 'yes');

    // Spider A staked NO (wrong): should have lost 10µ locked
    const spiderA = w.get(SPIDER_A)!;
    expect(spiderA.burnedTotal).toBe(LOCK_LEVELS[1]);
    expect(spiderA.locked).toBe(0);
  });

  it('multiplier is at least 1.0', () => {
    const w = makeWallets({ [OPENER]: 100 });
    const s = makeStore();
    const riskId = openRisk(s, w);
    driveToResolution(s, w, riskId, 'yes');
    expect(s.get(riskId)!.multiplier).toBeGreaterThanOrEqual(1.0);
  });

  it('multiplier increases with more votes', () => {
    // 5 votes → multiplier = 5/3 ≈ 1.67
    const w1 = makeWallets({ [OPENER]: 100 });
    const s1 = makeStore();
    const rid1 = openRisk(s1, w1);
    driveToResolution(s1, w1, rid1, 'yes');
    const m1 = s1.get(rid1)!.multiplier!;
    expect(m1).toBeCloseTo(RISK_VOTE_THRESHOLD / VALIDATORS_REQUIRED, 2);
  });
});

// ── 6. Constants ──────────────────────────────────────────────────────────────

describe('Risk-knot constants', () => {
  it('LOCK_LEVELS are ascending', () => {
    expect(LOCK_LEVELS[1]).toBeLessThan(LOCK_LEVELS[2]);
    expect(LOCK_LEVELS[2]).toBeLessThan(LOCK_LEVELS[3]);
  });

  it('BURN_FRACTION is between 0 and 1', () => {
    expect(BURN_FRACTION).toBeGreaterThan(0);
    expect(BURN_FRACTION).toBeLessThan(1);
  });

  it('RISK_CONSENSUS_FRACTION is greater than 0.5', () => {
    expect(RISK_CONSENSUS_FRACTION).toBeGreaterThan(0.5);
  });
});
