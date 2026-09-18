import { compareClassificationModels, compareDecisionModels } from '../../src/finance/decision-experiment';

describe('paired finance decision experiment', () => {
  it('selects the Jev-feature challenger when its out-of-sample RMSE is lower', () => {
    const report = compareDecisionModels([
      { id: 'a', predictionAt: '2026-01-01T00:00:00Z', targetAvailableAt: '2026-01-02T00:00:00Z', target: 1, baseline: 0, challenger: 0.8 },
      { id: 'b', predictionAt: '2026-01-02T00:00:00Z', targetAvailableAt: '2026-01-03T00:00:00Z', target: -1, baseline: 0.5, challenger: -0.7 },
      { id: 'c', predictionAt: '2026-01-03T00:00:00Z', targetAvailableAt: '2026-01-04T00:00:00Z', target: 0.5, baseline: -0.2, challenger: 0.4 },
    ]);
    expect(report.winner).toBe('challenger');
    expect(report.challenger.rmse).toBeLessThan(report.baseline.rmse);
    expect(report.challenger.directionalAccuracy).toBe(1);
    expect(report.challenger.spearman).toBeCloseTo(1);
  });

  it('rejects a target known at prediction time', () => {
    expect(() => compareDecisionModels([
      { id: 'a', predictionAt: '2026-01-02T00:00:00Z', targetAvailableAt: '2026-01-01T00:00:00Z', target: 1, baseline: 0, challenger: 1 },
      { id: 'b', predictionAt: '2026-01-03T00:00:00Z', targetAvailableAt: '2026-01-04T00:00:00Z', target: 1, baseline: 0, challenger: 1 },
    ])).toThrow('target must become available after prediction');
  });
});

describe('probabilistic Jev classification experiment', () => {
  it('scores calibration as well as threshold accuracy', () => {
    const report = compareClassificationModels([
      { id: 'a', target: 1, baselineProbability: 0.55, challengerProbability: 0.9 },
      { id: 'b', target: 0, baselineProbability: 0.45, challengerProbability: 0.1 },
      { id: 'c', target: 1, baselineProbability: 0.4, challengerProbability: 0.8 },
      { id: 'd', target: 0, baselineProbability: 0.6, challengerProbability: 0.2 },
    ]);
    expect(report.winnerByBrier).toBe('challenger');
    expect(report.challenger.brier).toBeLessThan(report.baseline.brier);
    expect(report.challenger.auroc).toBe(1);
  });
});
