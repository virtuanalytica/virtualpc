import { JevAnswer, JevDecisionClient, JevQuestion } from './client';
import { answerConfidence } from './answers';

/**
 * Heuristic yes/no decisions with an explicit confidence floor.
 *
 * A `noul` question asks Jev whether a statement holds for the given state;
 * the engine converts the probability into a verdict but refuses to decide
 * when the model's own confidence is below the floor. Abstention is a first
 * class outcome — callers branch on it (human review, default policy, abort),
 * and every caller logs it (the audit trail lives with the decision).
 */
export interface DecideInput {
  state: unknown;
  instructions: string;
  criteria?: { true: string; false: string };
  /** Minimum self-reported confidence to act; below this the engine abstains. */
  minConfidence?: number;
  questionKey?: string;
}

export interface Decision {
  verdict: 'yes' | 'no' | 'abstain';
  probability: number;
  confidence: number;
  abstained: boolean;
  answer: JevAnswer;
  model: string;
}

export async function decide(client: JevDecisionClient, input: DecideInput): Promise<Decision> {
  const minConfidence = input.minConfidence ?? 0.6;
  const question: JevQuestion = { type: 'noul', instructions: input.instructions, criteria: input.criteria };
  const key = input.questionKey ?? 'decision';
  const response = await client.evaluate({ state: input.state, questions: { [key]: question } });
  const answer = response.answers[key];
  if (!answer || answer.type !== 'noul') {
    throw new Error(`Jev response is missing the '${key}' noul answer`);
  }

  const probability = answer.noul;
  // noul answers have no separate confidence field: decision confidence is the
  // distance from the 0.5 boundary, so a confident NO at p=0.1 is as decisive
  // as a confident YES at p=0.9.
  const confidence = Math.max(probability, 1 - probability);
  if (confidence < minConfidence) {
    return { verdict: 'abstain', probability, confidence, abstained: true, answer, model: response.model };
  }
  return {
    verdict: probability >= 0.5 ? 'yes' : 'no',
    probability,
    confidence,
    abstained: false,
    answer,
    model: response.model,
  };
}
