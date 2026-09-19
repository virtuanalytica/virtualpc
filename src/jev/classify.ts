import { JevAnswer, JevDecisionClient, JevQuestion } from './client';
import { answerConfidence, argmax, normalizeOverLabels } from './answers';

/**
 * Confidence-based classification over a declared label set.
 *
 * The declared labels are the contract: Jev sees one `choice` question with a
 * criterion per class, and the engine renormalises the returned distribution
 * over exactly those labels. When the self-reported confidence is below
 * `minConfidence` the classifier abstains (label = null) instead of guessing —
 * the same measured-calibration discipline as the finance experiment.
 */
export interface ClassifyInput<Labels extends string> {
  state: unknown;
  instructions: string;
  classes: Record<Labels, string>;
  minConfidence?: number;
  questionKey?: string;
}

export interface Classification<Labels extends string> {
  label: Labels | null;
  probabilities: Record<Labels, number>;
  confidence: number;
  abstained: boolean;
  answer: JevAnswer;
  model: string;
}

export async function classify<Labels extends string>(
  client: JevDecisionClient,
  input: ClassifyInput<Labels>,
): Promise<Classification<Labels>> {
  const minConfidence = input.minConfidence ?? 0.6;
  const labels = Object.keys(input.classes) as Labels[];
  if (labels.length < 2) throw new Error('classification needs at least two labels');

  const criteria = input.classes as Record<string, string>;
  const question: JevQuestion = { type: 'choice', instructions: input.instructions, criteria };
  const key = input.questionKey ?? 'classification';
  const response = await client.evaluate({ state: input.state, questions: { [key]: question } });
  const answer = response.answers[key];
  if (!answer) throw new Error(`Jev response is missing the '${key}' answer`);

  const probabilities = normalizeOverLabels(answerProb(answer), labels);
  const confidence = answerConfidence(answer);
  const abstained = confidence < minConfidence;
  const top = argmax(probabilities);

  return {
    label: abstained ? null : (top.label as Labels),
    probabilities,
    confidence,
    abstained,
    answer,
    model: response.model,
  };
}

function answerProb(answer: JevAnswer): Record<string, number> {
  if (answer.type === 'noul') return { true: answer.noul, false: 1 - answer.noul };
  return { ...answer.probabilities, ...(answer.type === 'choice' ? { [answer.choice]: answer.probabilities[answer.choice] ?? answer.confidence } : {}) };
}
