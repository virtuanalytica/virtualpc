import { JevAnswer } from './client';

/**
 * Answer math shared by the heuristics, classification, and workflow layers.
 * Everything here is deterministic and side-effect free so the proof tests can
 * pin the semantics: noul answers are a true-probability, choice answers carry
 * a full distribution plus a separate confidence, and score answers reuse the
 * distribution+confidence shape.
 */

/** The model's self-reported confidence in the answer (noul: the probability itself). */
export function answerConfidence(answer: JevAnswer): number {
  return answer.type === 'noul' ? answer.noul : answer.confidence;
}

/** Probability distribution over the declared labels (noul collapses to true/false). */
export function answerProbabilities(answer: JevAnswer): Record<string, number> {
  if (answer.type === 'noul') return { true: answer.noul, false: 1 - answer.noul };
  return { ...answer.probabilities };
}

/** The label Jev picked, when the answer type expresses one. */
export function chosenLabel(answer: JevAnswer): string | null {
  if (answer.type === 'choice') return answer.choice;
  if (answer.type === 'noul') return answer.noul >= 0.5 ? 'true' : 'false';
  return null;
}

/**
 * Restrict a raw distribution to the declared labels, renormalise, and keep it
 * finite: stray keys from the model are dropped, missing keys get 0. The
 * result always sums to ~1 so callers can compare across questions.
 */
export function normalizeOverLabels(
  probabilities: Record<string, number>,
  labels: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (const label of labels) {
    const p = probabilities[label];
    const safe = typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : 0;
    out[label] = safe;
    total += safe;
  }
  if (total <= 0) {
    const uniform = 1 / labels.length;
    for (const label of labels) out[label] = uniform;
    return out;
  }
  for (const label of labels) out[label] = out[label] / total;
  return out;
}

export function argmax(probabilities: Record<string, number>): { label: string; probability: number } {
  let label = '';
  let probability = -1;
  for (const [key, value] of Object.entries(probabilities)) {
    if (value > probability) {
      label = key;
      probability = value;
    }
  }
  return { label, probability };
}
