import { assertPointInTime, buildJevFinanceFeatures, responseToFeatures } from '../../src/finance/decision-features';
import { JevDecisionClient, JevRequest, JevResponse } from '../../src/finance/jev-client';

const response: JevResponse = {
  model: 'jev-test',
  answers: {
    accounting_risk: { type: 'noul', noul: 0.8 },
    event_direction: {
      type: 'choice', choice: 'bullish', confidence: 0.6,
      probabilities: { bullish: 0.7, neutral: 0.2, bearish: 0.1 },
    },
    revenue_outlook: {
      type: 'score', score: 3, confidence: 0.75,
      legend: { '0': 'cut', '1': 'down', '2': 'flat', '3': 'up', '4': 'raise' },
      probabilities: { '0': 0, '1': 0.1, '2': 0.1, '3': 0.6, '4': 0.2 },
    },
  },
  usage: { input_tokens: 120, output_tokens: 30 },
};

describe('Jev finance features', () => {
  it('flattens probability distributions without discarding uncertainty', () => {
    const features = responseToFeatures(response);
    expect(features['jev.accounting_risk.p_true']).toBe(0.8);
    expect(features['jev.accounting_risk.uncertainty']).toBeCloseTo(0.4);
    expect(features['jev.event_direction.p.bullish']).toBe(0.7);
    expect(features['jev.revenue_outlook.normalized_score']).toBe(0.75);
    expect(features['jev.usage.input_tokens']).toBe(120);
  });

  it('rejects evidence that arrived after the decision', () => {
    expect(() => assertPointInTime({
      assetId: 'ABC', decisionAt: '2026-01-01T10:00:00Z',
      evidence: [{ source: 'filing', publishedAt: '2026-01-01T09:00:00Z', availableAt: '2026-01-01T11:00:00Z', text: 'late' }],
    })).toThrow('Look-ahead leakage');
  });

  it('fans all questions out in one client call', async () => {
    const requests: JevRequest[] = [];
    const client: JevDecisionClient = { evaluate: async request => { requests.push(request); return response; } };
    const result = await buildJevFinanceFeatures(client, {
      assetId: 'ABC', decisionAt: '2026-01-01T10:00:00Z',
      evidence: [{ source: 'filing', publishedAt: '2026-01-01T08:00:00Z', availableAt: '2026-01-01T09:00:00Z', text: 'guidance raised' }],
    });
    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0].questions).length).toBeGreaterThan(5);
    expect(result.model).toBe('jev-test');
  });
});
