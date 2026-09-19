/**
 * Proof suite for the Kafka-style task router: Jev scores the incoming task,
 * the router dispatches to the one handler serving the confident lane, and
 * escalates to the mixture-of-models on low confidence or an explicit
 * `uncertain` label. FIFO queue ordering is pinned too.
 * Run: npx jest tests/unit/jev-router.test.ts
 */
import { JevAnswer, JevDecisionClient, JevRequest, JevResponse } from '../../src/jev/client';
import { TaskCategory, TaskHandler, TaskRouter } from '../../src/jev/router';

function routingClient(label: string, confidence: number): JevDecisionClient {
  const probabilities: Record<string, number> = { coding: 0.1, reasoning: 0.1, classification: 0.1, uncertain: 0.1 };
  probabilities[label] = confidence;
  const evaluate = jest.fn(async (request: JevRequest): Promise<JevResponse> => ({
    model: 'jev-test',
    answers: { classification: { type: 'choice', choice: label, probabilities, confidence } },
    usage: { input_tokens: 12, output_tokens: 8 },
  }));
  return { evaluate };
}

function handler(name: string, categories: readonly TaskCategory[]): TaskHandler & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    name,
    categories,
    calls,
    async handle(task, category) {
      calls.push({ task: task.payload, category });
      return `${name}:${category}`;
    },
  };
}

describe('Kafka-style task router', () => {
  it('dispatches a confident coding task to the coder handler only', async () => {
    const coder = handler('qwen-coder', ['coding']);
    const reasoner = handler('reasoner-xl', ['reasoning']);
    const router = new TaskRouter({ client: routingClient('coding', 0.92), handlers: [coder, reasoner] });
    const decision = await router.route({ payload: { kind: 'pr', title: 'fix off-by-one' } });

    expect(decision.category).toBe('coding');
    expect(decision.dispatchedTo).toBe('qwen-coder');
    expect(decision.mixture).toBe(false);
    expect(coder.calls).toHaveLength(1);
    expect(reasoner.calls).toHaveLength(0);
    expect(decision.audit[0]).toMatchObject({ kind: 'route', outcome: 'routed', target: 'qwen-coder' });
  });

  it('escalates low-confidence tasks to the mixture of all handlers', async () => {
    const coder = handler('qwen-coder', ['coding']);
    const reasoner = handler('reasoner-xl', ['reasoning']);
    const router = new TaskRouter({ client: routingClient('reasoning', 0.3), handlers: [coder, reasoner], minConfidence: 0.6 });
    const decision = await router.route({ payload: 'sort of both?' });

    expect(decision.mixture).toBe(true);
    expect(decision.category).toBe('uncertain');
    expect(decision.dispatchedTo).toBeNull();
    const votes = (decision.output as { votes: unknown[] }).votes;
    expect(votes).toHaveLength(2);
    expect(decision.audit[0]).toMatchObject({ outcome: 'mixture' });
  });

  it('escalates on an explicit uncertain label even at high confidence', async () => {
    const coder = handler('qwen-coder', ['coding']);
    const router = new TaskRouter({ client: routingClient('uncertain', 0.97), handlers: [coder] });
    const decision = await router.route({ payload: 'hello world???' });
    expect(decision.mixture).toBe(true);
    expect(coder.calls).toHaveLength(1); // mixture fan-out includes every handler
  });

  it('falls back to the mixture when no handler serves the confident lane', async () => {
    const onlyReasoner = handler('reasoner-xl', ['reasoning']);
    const router = new TaskRouter({ client: routingClient('coding', 0.95), handlers: [onlyReasoner] });
    const decision = await router.route({ payload: 'write tests' });
    expect(decision.mixture).toBe(true);
  });

  it('respects an injected mixture aggregator', async () => {
    const coder = handler('qwen-coder', ['coding']);
    const router = new TaskRouter({
      client: routingClient('uncertain', 0.8),
      handlers: [coder],
      aggregateMixture: votes => `agreed:${votes.length}`,
    });
    const decision = await router.route({ payload: 'x' });
    expect(decision.output).toBe('agreed:1');
  });

  it('processes the queue in FIFO order', async () => {
    const seen: string[] = [];
    const slow = handler('slow', ['reasoning']);
    slow.handle = async task => {
      await new Promise(resolve => setTimeout(resolve, 20));
      seen.push(String((task.payload as { n: number }).n));
      return 'ok';
    };
    const router = new TaskRouter({ client: routingClient('reasoning', 0.9), handlers: [slow] });
    const results = await Promise.all([1, 2, 3].map(n => router.submit({ payload: { n } })));
    expect(seen).toEqual(['1', '2', '3']);
    expect(results.every(r => r.dispatchedTo === 'slow')).toBe(true);
    expect(router.queueDepth).toBe(0);
  });

  it('requires a client to route', () => {
    expect(() => new TaskRouter({ client: undefined as unknown as JevDecisionClient, handlers: [handler('h', ['coding'])] }))
      .toThrow();
  });
});
