import { retrievePointInTime, TextEmbedder } from '../../src/finance/radient-retrieval';

describe('Radient precedent retrieval boundary', () => {
  it('excludes future documents before embedding and ranks eligible precedents', async () => {
    const embed = jest.fn(async (_texts: string[]) => [[1, 0], [0.9, 0.1], [0, 1]]);
    const embedder: TextEmbedder = { embed };
    const results = await retrievePointInTime(embedder, 'query', [
      { id: 'near', text: 'near', publishedAt: '2025-01-01T00:00:00Z', availableAt: '2025-01-01T01:00:00Z' },
      { id: 'far', text: 'far', publishedAt: '2025-01-01T00:00:00Z', availableAt: '2025-01-01T02:00:00Z' },
      { id: 'future', text: 'leak', publishedAt: '2025-01-02T00:00:00Z', availableAt: '2025-01-02T01:00:00Z' },
    ], '2025-01-01T12:00:00Z');
    expect(results.map(result => result.id)).toEqual(['near', 'far']);
    expect(embed.mock.calls[0][0]).not.toContain('leak');
  });
});
