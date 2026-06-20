/**
 * Dev tournament — the single source of truth for VirtualPC's 3-developer
 * competing-branch regime (2026-06-04).
 *
 * How the org works:
 *  - PRODUCT OWNER / Coordinator / Scrum Master (Claude Opus, max effort) steers,
 *    reads the reviewer's reviews, and picks exactly ONE winning development per
 *    feature. The other two branches are discarded.
 *  - PhD REVIEWER (Codex / GPT-5.5, xhigh effort) reviews each developer's
 *    branch as the most-senior engineer and enforces coding standards.
 *  - THREE DEVELOPER LEGS each build the SAME feature in parallel, each on its
 *    own branch, each with its own junior team, its own scrum, and its own
 *    development resources:
 *      1. gpt       — senior Codex/GPT-5.5 xhigh, juniors Codex/GPT-5.4
 *      2. claude    — senior Claude Opus 4.8 xhigh, juniors Claude Sonnet
 *      3. virtualpc — senior + juniors on VirtualPC's own local/LiteLLM stack
 *
 * All activity flows through backlog items: every item is planning-poker pointed
 * by all three teams BEFORE development, and every step is recorded. This file
 * is the pure model + rules (no I/O); see ./dev-tournament-store for persistence
 * and the routes.
 */

export type Provider = 'codex' | 'anthropic' | 'litellm';
export type Effort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelSpec {
  provider: Provider;
  /** Model id or alias (e.g. gpt-5.5, claude-opus-4-8, qwen-coder-32b). */
  model: string;
  effort: Effort;
}

export interface DeveloperLeg {
  id: 'gpt' | 'claude' | 'virtualpc';
  label: string;
  /** The senior developer that owns the leg. */
  senior: ModelSpec;
  /** The junior team — lower-tier models doing the leg's own scrum. */
  juniors: ModelSpec;
  /** How many juniors report to the senior on this leg. */
  juniorCount: number;
  /** Git branch namespace this leg builds on (one branch per feature). */
  branchPrefix: string;
}

/** How many juniors each senior leads (each team runs its own scrum). */
export const JUNIORS_PER_LEG = 2;

/** Coordinator / Product Owner / Scrum Master — selects the winner. */
export const COORDINATOR: ModelSpec & { role: string } = {
  role: 'Product Owner · Coordinator · Scrum Master',
  provider: 'anthropic', model: 'claude-opus-4-8', effort: 'max',
};

/** The single PhD-level reviewer that reviews every leg's branch. */
export const REVIEWER: ModelSpec & { role: string } = {
  role: 'Principal Reviewer · senior PhD-level engineer',
  provider: 'codex', model: 'gpt-5.5', effort: 'xhigh',
};

export const DEV_LEGS: DeveloperLeg[] = [
  {
    id: 'gpt', label: 'GPT-5.5 leg (Codex)',
    senior:  { provider: 'codex', model: 'gpt-5.5', effort: 'xhigh' },
    juniors: { provider: 'codex', model: 'gpt-5.4', effort: 'high' },
    juniorCount: JUNIORS_PER_LEG,
    branchPrefix: 'dev/gpt',
  },
  {
    id: 'claude', label: 'Claude Opus 4.8 leg',
    senior:  { provider: 'anthropic', model: 'claude-opus-4-8', effort: 'xhigh' },
    juniors: { provider: 'anthropic', model: 'claude-sonnet-4-6', effort: 'high' },
    juniorCount: JUNIORS_PER_LEG,
    branchPrefix: 'dev/claude',
  },
  {
    id: 'virtualpc', label: 'VirtualPC native leg (local/LiteLLM)',
    senior:  { provider: 'litellm', model: 'qwen-coder-32b', effort: 'high' },
    juniors: { provider: 'litellm', model: 'devstral', effort: 'medium' },
    juniorCount: JUNIORS_PER_LEG,
    branchPrefix: 'dev/virtualpc',
  },
];

export interface TeamMember {
  agent: string;          // e.g. "gpt-senior", "gpt-junior-1"
  seat: 'senior' | 'junior';
  spec: ModelSpec;
}

/** The full roster for a leg: one senior + its juniors (each runs the scrum). */
export function teamRoster(leg: DeveloperLeg): TeamMember[] {
  const members: TeamMember[] = [{ agent: `${leg.id}-senior`, seat: 'senior', spec: leg.senior }];
  for (let i = 1; i <= leg.juniorCount; i++) {
    members.push({ agent: `${leg.id}-junior-${i}`, seat: 'junior', spec: leg.juniors });
  }
  return members;
}

export const LEG_IDS = DEV_LEGS.map(l => l.id);

/** Planning-poker scale (modified Fibonacci) the three teams estimate on. */
export const POKER_SCALE = [0, 1, 2, 3, 5, 8, 13, 21] as const;
export type PokerPoint = typeof POKER_SCALE[number];

export interface TeamEstimate {
  leg: DeveloperLeg['id'];
  /** Story points from POKER_SCALE; null = abstain / "?". */
  points: PokerPoint | null;
}

export interface PokerResult {
  estimates: TeamEstimate[];
  /** All three teams estimated (none abstained). */
  complete: boolean;
  /** Estimates agree closely enough to commit without a re-vote. */
  agreed: boolean;
  /** Consensus points (median of the cast votes, snapped to the scale). */
  consensus: PokerPoint | null;
  low: PokerPoint | null;
  high: PokerPoint | null;
}

function snapToScale(v: number): PokerPoint {
  return POKER_SCALE.reduce((best, p) => Math.abs(p - v) < Math.abs(best - v) ? p : best, POKER_SCALE[0]);
}

/**
 * Combine the three teams' planning-poker votes. Scrum rule: if the spread is
 * more than one step on the scale, the teams must discuss and re-vote (agreed =
 * false), otherwise the consensus (median) is committed to the backlog item.
 */
export function pokerConsensus(estimates: TeamEstimate[]): PokerResult {
  const cast = estimates.filter(e => e.points !== null).map(e => e.points as number).sort((a, b) => a - b);
  const complete = estimates.length >= LEG_IDS.length && estimates.every(e => e.points !== null);
  if (cast.length === 0) {
    return { estimates, complete: false, agreed: false, consensus: null, low: null, high: null };
  }
  const low = cast[0] as PokerPoint;
  const high = cast[cast.length - 1] as PokerPoint;
  const median = cast.length % 2 ? cast[(cast.length - 1) / 2] : (cast[cast.length / 2 - 1] + cast[cast.length / 2]) / 2;
  const consensus = snapToScale(median);
  // Agreed when low and high are at most one scale-step apart.
  const li = POKER_SCALE.indexOf(low), hi = POKER_SCALE.indexOf(high);
  const agreed = complete && (hi - li) <= 1;
  return { estimates, complete, agreed, consensus, low, high };
}

export type FeatureStage =
  | 'backlog'        // created, not yet estimated
  | 'estimated'      // poker consensus reached
  | 'building'       // the three legs are developing on their branches
  | 'review'         // reviewer is reviewing the branches
  | 'selected'       // PO picked a winner
  | 'merged'         // winner merged, losers discarded
  | 'rejected';      // no leg passed review

export interface LegBuild {
  leg: DeveloperLeg['id'];
  branch: string;
  status: 'pending' | 'in_progress' | 'ready' | 'failed';
}

/** One backlog item flowing through the tournament. */
export interface FeatureItem {
  id: string;
  backlogRef: string;
  title: string;
  stage: FeatureStage;
  poker?: PokerResult;
  builds: LegBuild[];
  /** The reviewer's per-leg verdicts (filled at the review stage). */
  reviews?: ReviewVerdict[];
  winner?: DeveloperLeg['id'];
  /** Append-only audit trail — every stage transition is recorded. */
  log: Array<{ at: string; event: string }>;
}

/** Produce the per-leg branch assignments for a feature (one branch per leg). */
export function planBuilds(feature: { id: string }): LegBuild[] {
  return DEV_LEGS.map(l => ({
    leg: l.id,
    branch: `${l.branchPrefix}/${feature.id}`,
    status: 'pending' as const,
  }));
}

export interface ReviewVerdict {
  leg: DeveloperLeg['id'];
  /** Did the branch pass the reviewer's gate (works + standards + tests)? */
  passed: boolean;
  /** Reviewer's quality score 0-100. */
  score: number;
  notes?: string;
}

export interface Selection {
  winner: DeveloperLeg['id'] | null;
  reason: string;
  rejected: DeveloperLeg['id'][];
}

/**
 * The PO's selection rule: exactly one development wins. Among the legs that
 * PASSED the reviewer's gate, pick the highest score; ties break by DEV_LEGS
 * order (gpt > claude > virtualpc) for determinism. If none passed, nothing
 * merges and the feature is rejected for rework.
 */
export function selectWinner(verdicts: ReviewVerdict[]): Selection {
  const passing = verdicts.filter(v => v.passed);
  if (passing.length === 0) {
    return { winner: null, reason: 'no leg passed review', rejected: verdicts.map(v => v.leg) };
  }
  const order = (id: DeveloperLeg['id']) => LEG_IDS.indexOf(id);
  const best = passing.slice().sort((a, b) => (b.score - a.score) || (order(a.leg) - order(b.leg)))[0];
  return {
    winner: best.leg,
    reason: `highest review score (${best.score}) among ${passing.length} passing leg(s)`,
    rejected: verdicts.filter(v => v.leg !== best.leg).map(v => v.leg),
  };
}
