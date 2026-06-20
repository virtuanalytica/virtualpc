import {
  PulseWalletStore,
  KnotValidationStore,
  PulseEngine,
  VALIDATORS_REQUIRED,
  PULSE_POSTER_REWARD,
  PULSE_VALIDATOR_REWARD,
  BURN_INACTIVE_MS,
  MIN_PULSE_TO_VOTE,
  PULSE_SCHEMA,
} from '../../src/integrations/lightrag/pulse';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEngine() {
  const wallets = new PulseWalletStore();
  const knots   = new KnotValidationStore();
  const engine  = new PulseEngine(wallets, knots);
  return { engine, wallets, knots };
}

const POST_ID   = 'a'.repeat(64);
const POSTER    = 'did:key:poster';
const SPIDER_A  = 'did:key:spiderA';
const SPIDER_B  = 'did:key:spiderB';
const SPIDER_C  = 'did:key:spiderC';

// ── 1. PulseWalletStore ───────────────────────────────────────────────────────

describe('PulseWalletStore', () => {
  it('creates wallet on first access', () => {
    const s = new PulseWalletStore();
    const w = s.getOrCreate(POSTER);
    expect(w.did).toBe(POSTER);
    expect(w.balance).toBe(0);
  });

  it('earn increases balance and earnedTotal', () => {
    const s = new PulseWalletStore();
    s.earn(POSTER, 10);
    const w = s.get(POSTER)!;
    expect(w.balance).toBe(10);
    expect(w.earnedTotal).toBe(10);
  });

  it('earn is additive', () => {
    const s = new PulseWalletStore();
    s.earn(POSTER, 10);
    s.earn(POSTER, 3);
    expect(s.get(POSTER)!.balance).toBe(13);
    expect(s.get(POSTER)!.earnedTotal).toBe(13);
  });

  it('get returns undefined for unknown DID', () => {
    expect(new PulseWalletStore().get('did:key:unknown')).toBeUndefined();
  });

  it('isVotingEligible is false with zero balance', () => {
    const s = new PulseWalletStore();
    expect(s.isVotingEligible(POSTER)).toBe(false);
  });

  it('isVotingEligible is true once any PLS earned', () => {
    const s = new PulseWalletStore();
    s.earn(POSTER, MIN_PULSE_TO_VOTE);
    expect(s.isVotingEligible(POSTER)).toBe(true);
  });

  it('runBurn zeros inactive wallets and tracks burnedTotal', () => {
    const s = new PulseWalletStore();
    s.earn(POSTER, 100);
    // Backdate lastActivityAt past burn threshold
    const w = s.get(POSTER)!;
    (w as any).lastActivityAt = new Date(Date.now() - BURN_INACTIVE_MS - 1_000).toISOString();
    const result = s.runBurn();
    expect(result.walletsAffected).toBe(1);
    expect(result.microPlsBurned).toBe(100);
    expect(s.get(POSTER)!.balance).toBe(0);
    expect(s.get(POSTER)!.burnedTotal).toBe(100);
  });

  it('runBurn does not touch recently-active wallets', () => {
    const s = new PulseWalletStore();
    s.earn(POSTER, 50);
    const result = s.runBurn();
    expect(result.walletsAffected).toBe(0);
    expect(s.get(POSTER)!.balance).toBe(50);
  });

  it('runBurn does not touch zero-balance wallets', () => {
    const s = new PulseWalletStore();
    s.getOrCreate(POSTER);
    const w = s.get(POSTER)!;
    (w as any).lastActivityAt = new Date(0).toISOString();
    const result = s.runBurn();
    expect(result.walletsAffected).toBe(0);
  });

  it('stats reports circulating and earned correctly', () => {
    const s = new PulseWalletStore();
    s.earn(POSTER,   10);
    s.earn(SPIDER_A, 3);
    const st = s.stats();
    expect(st.wallets).toBe(2);
    expect(st.circulating).toBe(13);
    expect(st.earnedAllTime).toBe(13);
  });

  it('list returns wallets sorted by balance descending', () => {
    const s = new PulseWalletStore();
    s.earn(SPIDER_A, 3);
    s.earn(POSTER,   10);
    const list = s.list();
    expect(list[0].did).toBe(POSTER);
    expect(list[1].did).toBe(SPIDER_A);
  });
});

// ── 2. KnotValidationStore ────────────────────────────────────────────────────

describe('KnotValidationStore', () => {
  it('rejects self-validation', () => {
    const s = new KnotValidationStore();
    const r = s.validate(POST_ID, POSTER, POSTER);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/own/);
  });

  it('records first validation, not yet confirmed', () => {
    const s = new KnotValidationStore();
    const r = s.validate(POST_ID, POSTER, SPIDER_A);
    expect(r.ok).toBe(true);
    expect((r as any).newlyConfirmed).toBe(false);
    expect(s.get(POST_ID)!.validations.length).toBe(1);
  });

  it('rejects duplicate validation from same spider', () => {
    const s = new KnotValidationStore();
    s.validate(POST_ID, POSTER, SPIDER_A);
    const r = s.validate(POST_ID, POSTER, SPIDER_A);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/already/);
  });

  it(`confirms on the ${VALIDATORS_REQUIRED}rd unique validator`, () => {
    const s = new KnotValidationStore();
    s.validate(POST_ID, POSTER, SPIDER_A);
    s.validate(POST_ID, POSTER, SPIDER_B);
    const r = s.validate(POST_ID, POSTER, SPIDER_C);
    expect(r.ok).toBe(true);
    expect((r as any).newlyConfirmed).toBe(true);
    expect(s.get(POST_ID)!.confirmed).toBe(true);
    expect(s.get(POST_ID)!.confirmedAt).toBeTruthy();
  });

  it('rejects further validations after confirmation', () => {
    const s = new KnotValidationStore();
    s.validate(POST_ID, POSTER, SPIDER_A);
    s.validate(POST_ID, POSTER, SPIDER_B);
    s.validate(POST_ID, POSTER, SPIDER_C);
    const r = s.validate(POST_ID, POSTER, 'did:key:d');
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/already confirmed/);
  });

  it('markRewardPaid sets flag', () => {
    const s = new KnotValidationStore();
    s.validate(POST_ID, POSTER, SPIDER_A);
    s.validate(POST_ID, POSTER, SPIDER_B);
    s.validate(POST_ID, POSTER, SPIDER_C);
    s.markRewardPaid(POST_ID);
    expect(s.get(POST_ID)!.rewardPaid).toBe(true);
  });

  it('get returns undefined for unknown postId', () => {
    expect(new KnotValidationStore().get('notapost')).toBeUndefined();
  });
});

// ── 3. PulseEngine — mining flow ──────────────────────────────────────────────

describe('PulseEngine', () => {
  it('validation before confirmation returns event=validated, earned=0', () => {
    const { engine } = makeEngine();
    const r = engine.validate(POST_ID, POSTER, SPIDER_A);
    expect(r.ok).toBe(true);
    expect((r as any).event).toBe('validated');
    expect((r as any).earned).toBe(0);
  });

  it('third validator triggers confirmation and mints Pulse', () => {
    const { engine, wallets } = makeEngine();
    engine.validate(POST_ID, POSTER, SPIDER_A);
    engine.validate(POST_ID, POSTER, SPIDER_B);
    const r = engine.validate(POST_ID, POSTER, SPIDER_C);
    expect(r.ok).toBe(true);
    expect((r as any).event).toBe('confirmed');
    expect((r as any).earned).toBe(PULSE_POSTER_REWARD);

    // Poster earned poster reward
    expect(wallets.get(POSTER)!.balance).toBe(PULSE_POSTER_REWARD);
    // Each validator earned validator reward
    expect(wallets.get(SPIDER_A)!.balance).toBe(PULSE_VALIDATOR_REWARD);
    expect(wallets.get(SPIDER_B)!.balance).toBe(PULSE_VALIDATOR_REWARD);
    expect(wallets.get(SPIDER_C)!.balance).toBe(PULSE_VALIDATOR_REWARD);
  });

  it('poster becomes voting-eligible after knot is confirmed', () => {
    const { engine, wallets } = makeEngine();
    expect(wallets.isVotingEligible(POSTER)).toBe(false);
    engine.validate(POST_ID, POSTER, SPIDER_A);
    engine.validate(POST_ID, POSTER, SPIDER_B);
    engine.validate(POST_ID, POSTER, SPIDER_C);
    expect(wallets.isVotingEligible(POSTER)).toBe(true);
  });

  it('validators become voting-eligible after confirming a knot', () => {
    const { engine, wallets } = makeEngine();
    engine.validate(POST_ID, POSTER, SPIDER_A);
    engine.validate(POST_ID, POSTER, SPIDER_B);
    engine.validate(POST_ID, POSTER, SPIDER_C);
    expect(wallets.isVotingEligible(SPIDER_A)).toBe(true);
    expect(wallets.isVotingEligible(SPIDER_B)).toBe(true);
    expect(wallets.isVotingEligible(SPIDER_C)).toBe(true);
  });

  it('self-validation is rejected by engine', () => {
    const { engine } = makeEngine();
    const r = engine.validate(POST_ID, POSTER, POSTER);
    expect(r.ok).toBe(false);
  });

  it('duplicate validation is rejected', () => {
    const { engine } = makeEngine();
    engine.validate(POST_ID, POSTER, SPIDER_A);
    const r = engine.validate(POST_ID, POSTER, SPIDER_A);
    expect(r.ok).toBe(false);
  });

  it('reward is only paid once (markRewardPaid prevents re-entry)', () => {
    const { engine, wallets } = makeEngine();
    engine.validate(POST_ID, POSTER, SPIDER_A);
    engine.validate(POST_ID, POSTER, SPIDER_B);
    engine.validate(POST_ID, POSTER, SPIDER_C);
    // The 4th spider should be rejected (already confirmed)
    engine.validate(POST_ID, POSTER, 'did:key:d');
    expect(wallets.get(POSTER)!.balance).toBe(PULSE_POSTER_REWARD);  // paid exactly once
  });

  it('two different knots mine independently', () => {
    const { engine, wallets } = makeEngine();
    const POST2 = 'b'.repeat(64);

    // Knot 1 confirmed
    engine.validate(POST_ID, POSTER,              SPIDER_A);
    engine.validate(POST_ID, POSTER,              SPIDER_B);
    engine.validate(POST_ID, POSTER,              SPIDER_C);

    // Knot 2 by different poster
    engine.validate(POST2, 'did:key:poster2', SPIDER_A);
    engine.validate(POST2, 'did:key:poster2', SPIDER_B);
    engine.validate(POST2, 'did:key:poster2', SPIDER_C);

    expect(wallets.get(POSTER)!.balance).toBe(PULSE_POSTER_REWARD);
    expect(wallets.get('did:key:poster2')!.balance).toBe(PULSE_POSTER_REWARD);
    // SPIDER_A validated both → earned twice
    expect(wallets.get(SPIDER_A)!.balance).toBe(PULSE_VALIDATOR_REWARD * 2);
  });

  it('startGc / stopGc do not throw', () => {
    const { engine } = makeEngine();
    engine.startGc();
    engine.startGc(); // double-start safe
    engine.stopGc();
  });
});

// ── 4. Constants sanity ───────────────────────────────────────────────────────

describe('Pulse constants', () => {
  it('VALIDATORS_REQUIRED is 3', () => {
    expect(VALIDATORS_REQUIRED).toBe(3);
  });

  it('PULSE_SCHEMA has expected value', () => {
    expect(PULSE_SCHEMA).toBe('vpc.pulse/1');
  });

  it('burn threshold is 90 days', () => {
    const days = BURN_INACTIVE_MS / (24 * 60 * 60 * 1_000);
    expect(days).toBe(90);
  });

  it('poster reward > validator reward', () => {
    expect(PULSE_POSTER_REWARD).toBeGreaterThan(PULSE_VALIDATOR_REWARD);
  });
});
