import { predictiveFactorsToFeatures } from '../../src/finance/predictive-factors';

describe('experimental JEPA-Anything factor hand-off', () => {
  const snapshot = {
    artifactId: 'finance-opf-v1', observedAt: '2026-01-01T08:00:00Z', availableAt: '2026-01-01T09:00:00Z',
    latentDimension: 4, factorCount: 2, coordinatesPerFactor: 2, factors: [[0.1, 0.2], [0.3, 0.4]],
  };

  it('requires an explicit experimental switch', () => {
    expect(() => predictiveFactorsToFeatures(snapshot, '2026-01-01T10:00:00Z', false)).toThrow('disabled');
  });

  it('uses neutral coordinate names and validates OPF geometry', () => {
    expect(predictiveFactorsToFeatures(snapshot, '2026-01-01T10:00:00Z', true)).toEqual({
      'jepa.pc_000.000': 0.1, 'jepa.pc_000.001': 0.2,
      'jepa.pc_001.000': 0.3, 'jepa.pc_001.001': 0.4,
    });
  });
});
