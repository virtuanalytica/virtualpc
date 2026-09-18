import { HttpJevClient } from '../../src/finance/jev-client';

describe('TypeSafe System One HTTP client', () => {
  it('uses the documented endpoint, bearer token, and request shape', async () => {
    const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      model: 'jev-latest', answers: { signal: { type: 'noul', noul: 0.7 } },
      usage: { input_tokens: 10, output_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new HttpJevClient({ apiKey: 'secret', fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.evaluate({ state: { text: 'news' }, questions: { signal: { type: 'noul', instructions: 'Is it material?' } } });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer secret' });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'jev-latest', state: { text: 'news' } });
  });

  it('rejects an invalid response instead of silently creating features', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {}, usage: {} }), { status: 200 }));
    const client = new HttpJevClient({ apiKey: 'secret', fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
    await expect(client.evaluate({ state: 'x', questions: {} })).rejects.toThrow('Invalid TypeSafe response');
  });
});
