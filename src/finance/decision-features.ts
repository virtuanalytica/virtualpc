import { JevAnswer, JevDecisionClient, JevQuestion, JevResponse } from './jev-client';

export interface EvidenceItem {
  source: string;
  publishedAt: string;
  availableAt: string;
  text: string;
  url?: string;
}

export interface FinanceDecisionState {
  assetId: string;
  decisionAt: string;
  numericSnapshot?: Record<string, number | null>;
  evidence: EvidenceItem[];
  retrievedPrecedents?: Array<{ id: string; similarity: number; outcome?: number; text: string }>;
}

export const FINANCE_JEV_QUESTIONS: Record<string, JevQuestion> = {
  event_direction: {
    type: 'choice',
    instructions: 'What is the likely directional effect of `evidence` on `assetId` over the stated prediction horizon?',
    criteria: {
      bullish: 'Evidence supports a positive excess return.',
      neutral: 'Evidence is immaterial, balanced, or already expected.',
      bearish: 'Evidence supports a negative excess return.',
      other: 'The evidence does not support these categories.',
    },
  },
  accounting_risk: {
    type: 'noul',
    instructions: 'Does `evidence` contain a concrete accounting-quality, fraud, restatement, or disclosure-risk signal?',
    criteria: { true: 'A concrete warning signal is present.', false: 'No concrete warning signal is present.' },
  },
  liquidity_stress: {
    type: 'noul',
    instructions: 'Does `evidence` indicate material refinancing, covenant, cash-flow, or near-term liquidity stress?',
  },
  management_confidence: {
    type: 'score',
    instructions: 'How strongly does management language in `evidence` support confidence in executing stated plans?',
    criteria: [
      'No management evidence or materially evasive language.',
      'Cautious language without measurable commitments.',
      'Specific commitments with mixed supporting evidence.',
      'Specific commitments supported by delivered milestones or raised guidance.',
    ],
  },
  revenue_outlook: {
    type: 'score',
    instructions: 'What revenue-outlook change is supported by `evidence` relative to prior expectations?',
    criteria: [
      'Material deterioration or guidance cut.',
      'Mild deterioration.',
      'No evidenced change.',
      'Mild improvement.',
      'Material improvement or guidance raise.',
    ],
  },
  regime: {
    type: 'choice',
    instructions: 'Which market regime is most directly evidenced by `evidence`?',
    criteria: {
      risk_on: 'Risk appetite, growth expectations, or liquidity conditions improve.',
      neutral: 'No clear regime shift is evidenced.',
      risk_off: 'Risk aversion, contraction, or liquidity stress dominates.',
      other: 'The evidence does not fit these regimes.',
    },
  },
  novelty: {
    type: 'score',
    instructions: 'How novel and decision-relevant is `evidence` compared with `retrievedPrecedents`?',
    criteria: [
      'Duplicate or stale information.',
      'Mostly known information with a minor update.',
      'Material new information.',
      'Unexpected information likely to change forecasts materially.',
    ],
  },
};

function parseTime(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be an ISO-8601 timestamp`);
  return timestamp;
}

/** Rejects publication or ingestion data that was unavailable at decision time. */
export function assertPointInTime(state: FinanceDecisionState): void {
  const decisionAt = parseTime(state.decisionAt, 'decisionAt');
  for (const item of state.evidence) {
    const publishedAt = parseTime(item.publishedAt, 'publishedAt');
    const availableAt = parseTime(item.availableAt, 'availableAt');
    if (publishedAt > availableAt) throw new Error(`Evidence from ${item.source} is available before publication`);
    if (availableAt > decisionAt) throw new Error(`Look-ahead leakage: ${item.source} was unavailable at decisionAt`);
  }
}

function finiteProbability(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} is not a probability`);
  return value;
}

function addAnswerFeatures(target: Record<string, number>, id: string, answer: JevAnswer): void {
  const prefix = `jev.${id}`;
  if (answer.type === 'noul') {
    const value = finiteProbability(answer.noul, prefix);
    target[`${prefix}.p_true`] = value;
    target[`${prefix}.uncertainty`] = 1 - Math.abs(2 * value - 1);
    return;
  }
  target[`${prefix}.confidence`] = finiteProbability(answer.confidence, `${prefix}.confidence`);
  for (const [option, probability] of Object.entries(answer.probabilities)) {
    target[`${prefix}.p.${option}`] = finiteProbability(probability, `${prefix}.${option}`);
  }
  if (answer.type === 'score') {
    const levels = Object.keys(answer.legend).length;
    target[`${prefix}.normalized_score`] = levels > 1 ? answer.score / (levels - 1) : 0;
  }
}

export function responseToFeatures(response: JevResponse): Record<string, number> {
  const features: Record<string, number> = {};
  for (const [id, answer] of Object.entries(response.answers)) addAnswerFeatures(features, id, answer);
  features['jev.usage.input_tokens'] = response.usage.input_tokens;
  features['jev.usage.output_tokens'] = response.usage.output_tokens;
  return features;
}

export async function buildJevFinanceFeatures(
  client: JevDecisionClient,
  state: FinanceDecisionState,
  questions: Record<string, JevQuestion> = FINANCE_JEV_QUESTIONS,
): Promise<{ model: string; features: Record<string, number>; raw: JevResponse }> {
  assertPointInTime(state);
  const raw = await client.evaluate({ state, questions });
  return { model: raw.model, features: responseToFeatures(raw), raw };
}
