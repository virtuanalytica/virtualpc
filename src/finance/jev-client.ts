import { z } from 'zod';

export type JevQuestion =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] };

export interface JevRequest {
  state: unknown;
  questions: Record<string, JevQuestion>;
  model?: string;
}

const probability = z.number().min(0).max(1);
const probabilityMap = z.record(z.string(), probability);
const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: probability }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: probabilityMap,
    confidence: probability,
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    legend: z.record(z.string(), z.string()),
    probabilities: probabilityMap,
    confidence: probability,
  }),
]);

const responseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
});

export type JevAnswer = z.infer<typeof answerSchema>;
export type JevResponse = z.infer<typeof responseSchema>;

export interface JevDecisionClient {
  evaluate(request: JevRequest): Promise<JevResponse>;
}

export interface HttpJevClientOptions {
  apiKey: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

/** Direct implementation of TypeSafe's documented System One HTTP API. */
export class HttpJevClient implements JevDecisionClient {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpJevClientOptions) {
    if (!options.apiKey) throw new Error('A TypeSafe API key is required');
    this.endpoint = options.endpoint ?? 'https://api.typesafe.ai/v1/systemone';
    this.model = options.model ?? 'jev-latest';
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async evaluate(request: JevRequest): Promise<JevResponse> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ...request, model: request.model ?? this.model }),
          signal: controller.signal,
        });
        if (response.ok) return responseSchema.parse(await response.json());

        const detail = (await response.text()).slice(0, 1000);
        const retryable = response.status === 429 || response.status === 529;
        if (!retryable || attempt === this.maxRetries) {
          throw new Error(`TypeSafe API ${response.status}: ${detail}`);
        }
        lastError = new Error(`TypeSafe API ${response.status}: ${detail}`);
      } catch (error) {
        if (error instanceof z.ZodError) throw new Error(`Invalid TypeSafe response: ${error.message}`);
        if (error instanceof Error && error.message.startsWith('TypeSafe API ')) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === this.maxRetries) break;
      } finally {
        clearTimeout(timer);
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(250 * (2 ** attempt), 2_000)));
    }
    throw lastError ?? new Error('TypeSafe request failed');
  }
}
