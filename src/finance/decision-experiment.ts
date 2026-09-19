export interface PredictionObservation {
  id: string;
  predictionAt: string;
  targetAvailableAt: string;
  target: number;
  baseline: number;
  challenger: number;
}

export interface ModelMetrics {
  rmse: number;
  mae: number;
  directionalAccuracy: number;
  pearson: number | null;
  spearman: number | null;
}

export interface ExperimentReport {
  n: number;
  baseline: ModelMetrics;
  challenger: ModelMetrics;
  rmseImprovement: number;
  rmseImprovementPct: number | null;
  winner: 'baseline' | 'challenger' | 'tie';
}

export interface ClassificationObservation {
  id: string;
  target: 0 | 1;
  baselineProbability: number;
  challengerProbability: number;
}

export interface ClassificationMetrics {
  brier: number;
  logLoss: number;
  accuracy: number;
  expectedCalibrationError: number;
  auroc: number | null;
}

function ensureFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite`);
}

function correlation(left: number[], right: number[]): number | null {
  const meanLeft = left.reduce((a, b) => a + b, 0) / left.length;
  const meanRight = right.reduce((a, b) => a + b, 0) / right.length;
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] - meanLeft;
    const r = right[index] - meanRight;
    numerator += l * r;
    leftSquare += l * l;
    rightSquare += r * r;
  }
  const denominator = Math.sqrt(leftSquare * rightSquare);
  return denominator === 0 ? null : numerator / denominator;
}

function ranks(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end += 1;
    const rank = (start + end - 1) / 2 + 1;
    for (let cursor = start; cursor < end; cursor += 1) result[sorted[cursor].index] = rank;
    start = end;
  }
  return result;
}

function metrics(targets: number[], predictions: number[]): ModelMetrics {
  const errors = predictions.map((prediction, index) => prediction - targets[index]);
  return {
    rmse: Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length),
    mae: errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length,
    directionalAccuracy: predictions.filter((prediction, index) => Math.sign(prediction) === Math.sign(targets[index])).length / errors.length,
    pearson: correlation(targets, predictions),
    spearman: correlation(ranks(targets), ranks(predictions)),
  };
}

/** Scores paired, already out-of-sample predictions; it deliberately does no fitting. */
export function compareDecisionModels(rows: PredictionObservation[]): ExperimentReport {
  if (rows.length < 2) throw new Error('At least two paired out-of-sample observations are required');
  for (const row of rows) {
    ensureFinite(row.target, `${row.id}.target`);
    ensureFinite(row.baseline, `${row.id}.baseline`);
    ensureFinite(row.challenger, `${row.id}.challenger`);
    const predictionAt = Date.parse(row.predictionAt);
    const targetAvailableAt = Date.parse(row.targetAvailableAt);
    if (!Number.isFinite(predictionAt) || !Number.isFinite(targetAvailableAt)) throw new Error(`${row.id} has an invalid timestamp`);
    if (targetAvailableAt <= predictionAt) throw new Error(`${row.id} target must become available after prediction`);
  }
  const targets = rows.map(row => row.target);
  const baseline = metrics(targets, rows.map(row => row.baseline));
  const challenger = metrics(targets, rows.map(row => row.challenger));
  const improvement = baseline.rmse - challenger.rmse;
  return {
    n: rows.length,
    baseline,
    challenger,
    rmseImprovement: improvement,
    rmseImprovementPct: baseline.rmse === 0 ? null : improvement / baseline.rmse,
    winner: Math.abs(improvement) < 1e-12 ? 'tie' : improvement > 0 ? 'challenger' : 'baseline',
  };
}

function classificationMetrics(targets: number[], probabilities: number[], bins = 10): ClassificationMetrics {
  const clipped = probabilities.map(value => Math.min(1 - 1e-15, Math.max(1e-15, value)));
  const brier = probabilities.reduce((sum, probability, index) => sum + (probability - targets[index]) ** 2, 0) / targets.length;
  const logLoss = -clipped.reduce((sum, probability, index) => (
    sum + targets[index] * Math.log(probability) + (1 - targets[index]) * Math.log(1 - probability)
  ), 0) / targets.length;
  const accuracy = probabilities.filter((probability, index) => Number(probability >= 0.5) === targets[index]).length / targets.length;
  let expectedCalibrationError = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const members = probabilities.map((probability, index) => ({ probability, target: targets[index] }))
      .filter(item => item.probability >= bin / bins && (bin === bins - 1 ? item.probability <= 1 : item.probability < (bin + 1) / bins));
    if (members.length === 0) continue;
    const meanProbability = members.reduce((sum, item) => sum + item.probability, 0) / members.length;
    const observedRate = members.reduce((sum, item) => sum + item.target, 0) / members.length;
    expectedCalibrationError += (members.length / targets.length) * Math.abs(meanProbability - observedRate);
  }
  const positives = targets.filter(value => value === 1).length;
  const negatives = targets.length - positives;
  let auroc: number | null = null;
  if (positives > 0 && negatives > 0) {
    const probabilityRanks = ranks(probabilities);
    const positiveRankSum = probabilityRanks.reduce((sum, rank, index) => sum + (targets[index] === 1 ? rank : 0), 0);
    auroc = (positiveRankSum - positives * (positives + 1) / 2) / (positives * negatives);
  }
  return { brier, logLoss, accuracy, expectedCalibrationError, auroc };
}

export function compareClassificationModels(rows: ClassificationObservation[]): {
  n: number;
  baseline: ClassificationMetrics;
  challenger: ClassificationMetrics;
  winnerByBrier: 'baseline' | 'challenger' | 'tie';
} {
  if (rows.length < 2) throw new Error('At least two paired classification observations are required');
  rows.forEach(row => {
    if ((row.target !== 0 && row.target !== 1) || row.baselineProbability < 0 || row.baselineProbability > 1 ||
        row.challengerProbability < 0 || row.challengerProbability > 1) {
      throw new Error(`${row.id} must contain a binary target and probabilities in [0, 1]`);
    }
  });
  const targets = rows.map(row => row.target);
  const baseline = classificationMetrics(targets, rows.map(row => row.baselineProbability));
  const challenger = classificationMetrics(targets, rows.map(row => row.challengerProbability));
  const delta = baseline.brier - challenger.brier;
  return {
    n: rows.length, baseline, challenger,
    winnerByBrier: Math.abs(delta) < 1e-12 ? 'tie' : delta > 0 ? 'challenger' : 'baseline',
  };
}
