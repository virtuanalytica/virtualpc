import {
  DEV_LEGS, LEG_IDS, COORDINATOR, REVIEWER, JUNIORS_PER_LEG,
  pokerConsensus, planBuilds, selectWinner, teamRoster,
  TeamEstimate, ReviewVerdict,
} from '../../src/org/dev-tournament';

/**
 * Unit tests for the 3-developer competing-branch tournament model.
 */

describe('org wiring', () => {
  it('has exactly three developer legs with distinct branch namespaces', () => {
    expect(LEG_IDS).toEqual(['gpt', 'claude', 'virtualpc']);
    const prefixes = DEV_LEGS.map(l => l.branchPrefix);
    expect(new Set(prefixes).size).toBe(3);
  });
  it('puts the reviewer on Codex/GPT-5.5 xhigh and the PO on Claude Opus max', () => {
    expect(REVIEWER.provider).toBe('codex');
    expect(REVIEWER.model).toBe('gpt-5.5');
    expect(REVIEWER.effort).toBe('xhigh');
    expect(COORDINATOR.model).toBe('claude-opus-4-8');
    expect(COORDINATOR.effort).toBe('max');
  });
  it('gives each leg a senior + 2 juniors running their own scrum', () => {
    expect(JUNIORS_PER_LEG).toBe(2);
    for (const leg of DEV_LEGS) {
      const roster = teamRoster(leg);
      expect(roster).toHaveLength(3);                       // 1 senior + 2 juniors
      expect(roster.filter(m => m.seat === 'senior')).toHaveLength(1);
      expect(roster.filter(m => m.seat === 'junior')).toHaveLength(2);
      expect(roster[0].agent).toBe(`${leg.id}-senior`);
      expect(roster[0].spec).toEqual(leg.senior);
      expect(roster[2].spec).toEqual(leg.juniors);
    }
  });
  it('seniors run hotter than their junior teams', () => {
    const gpt = DEV_LEGS.find(l => l.id === 'gpt')!;
    expect(gpt.senior.model).toBe('gpt-5.5');
    expect(gpt.juniors.model).toBe('gpt-5.4');
    const claude = DEV_LEGS.find(l => l.id === 'claude')!;
    expect(claude.senior.model).toBe('claude-opus-4-8');
    expect(claude.juniors.model).toBe('claude-sonnet-4-6');
  });
});

describe('planning poker', () => {
  const est = (gpt: any, claude: any, vpc: any): TeamEstimate[] => [
    { leg: 'gpt', points: gpt }, { leg: 'claude', points: claude }, { leg: 'virtualpc', points: vpc },
  ];

  it('agrees and takes the median when the three teams are within one step', () => {
    const r = pokerConsensus(est(3, 5, 5));
    expect(r.complete).toBe(true);
    expect(r.agreed).toBe(true);
    expect(r.consensus).toBe(5);
    expect(r.low).toBe(3);
    expect(r.high).toBe(5);
  });
  it('flags disagreement when the spread is more than one step (needs re-vote)', () => {
    const r = pokerConsensus(est(2, 8, 13));
    expect(r.complete).toBe(true);
    expect(r.agreed).toBe(false);            // 2..13 is far apart
    expect(r.consensus).toBe(8);             // median still computed
  });
  it('is incomplete if any team abstains', () => {
    const r = pokerConsensus(est(3, null, 5));
    expect(r.complete).toBe(false);
    expect(r.agreed).toBe(false);
  });
});

describe('planBuilds', () => {
  it('creates one branch per leg under the leg namespace', () => {
    const builds = planBuilds({ id: 'feat-42' });
    expect(builds.map(b => b.leg)).toEqual(['gpt', 'claude', 'virtualpc']);
    expect(builds.find(b => b.leg === 'gpt')!.branch).toBe('dev/gpt/feat-42');
    expect(builds.every(b => b.status === 'pending')).toBe(true);
  });
});

describe('selectWinner — exactly one wins', () => {
  const v = (leg: any, passed: boolean, score: number): ReviewVerdict => ({ leg, passed, score });

  it('picks the highest-scoring passing leg', () => {
    const s = selectWinner([v('gpt', true, 80), v('claude', true, 92), v('virtualpc', false, 95)]);
    expect(s.winner).toBe('claude');
    expect(s.rejected.sort()).toEqual(['gpt', 'virtualpc']);
  });
  it('breaks score ties by leg order (gpt first)', () => {
    const s = selectWinner([v('gpt', true, 90), v('claude', true, 90), v('virtualpc', true, 90)]);
    expect(s.winner).toBe('gpt');
  });
  it('rejects the feature when no leg passes review', () => {
    const s = selectWinner([v('gpt', false, 40), v('claude', false, 55), v('virtualpc', false, 30)]);
    expect(s.winner).toBeNull();
    expect(s.rejected.length).toBe(3);
  });
});
