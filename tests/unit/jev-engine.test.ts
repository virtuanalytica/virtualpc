/**
 * Proof suite for the generalized Jev engine: classification with abstention,
 * heuristic yes/no gating, and the rule-based workflow executor (tool
 * allow-list, sandboxed code steps, audit trail).
 *
 * Jev is a probability source, never an unconditional oracle — every test
 * below pins that discipline. Run: npx jest tests/unit/jev-engine.test.ts
 */
import { JevAnswer, JevDecisionClient, JevRequest, JevResponse } from '../../src/jev/client';
import { classify } from '../../src/jev/classify';
import { decide } from '../../src/jev/heuristics';
import { WorkflowRunner, WorkflowStep } from '../../src/jev/workflow';

function fakeClient(answerFor: (request: JevRequest) => Record<string, JevAnswer>): JevDecisionClient {
  const evaluate = jest.fn(async (request: JevRequest): Promise<JevResponse> => ({
    model: 'jev-test',
    answers: answerFor(request),
    usage: { input_tokens: 10, output_tokens: 5 },
  }));
  return { evaluate };
}

const choiceAnswer = (choice: string, probabilities: Record<string, number>, confidence: number): JevAnswer =>
  ({ type: 'choice', choice, probabilities, confidence });
const noulAnswer = (noul: number): JevAnswer => ({ type: 'noul', noul });

describe('Jev classification', () => {
  it('picks the argmax label and renormalises over the declared classes only', async () => {
    const client = fakeClient(() => ({
      classification: choiceAnswer('feature', { bug: 0.5, feature: 0.9, question: 0.2, hallucinated: 3 }, 0.8),
    }));
    const result = await classify(client, {
      state: { title: 'add dark mode' },
      instructions: 'Classify the ticket.',
      classes: { bug: 'defect', feature: 'new capability', question: 'needs info' },
    });
    expect(result.label).toBe('feature');
    expect(result.abstained).toBe(false);
    const total = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    expect((result.probabilities as Record<string, number>).hallucinated).toBeUndefined();
  });

  it('abstains instead of guessing below the confidence floor', async () => {
    const client = fakeClient(() => ({
      classification: choiceAnswer('bug', { bug: 0.7, feature: 0.3 }, 0.4),
    }));
    const result = await classify(client, {
      state: 'x',
      instructions: 'Classify.',
      classes: { bug: 'defect', feature: 'capability' },
      minConfidence: 0.6,
    });
    expect(result.abstained).toBe(true);
    expect(result.label).toBeNull();
  });

  it('refuses to classify a single-label contract', async () => {
    const client = fakeClient(() => ({ classification: choiceAnswer('only', { only: 1 }, 1) }));
    await expect(classify(client, { state: 'x', instructions: 'c', classes: { only: 'everything' } }))
      .rejects.toThrow('at least two labels');
  });
});

describe('Jev heuristic decisions', () => {
  it('returns yes above the floor and no below 0.5 once confident', async () => {
    const yes = fakeClient(() => ({ decision: noulAnswer(0.9) }));
    expect((await decide(yes, { state: 'x', instructions: 'Ship?' })).verdict).toBe('yes');
    const no = fakeClient(() => ({ decision: noulAnswer(0.4) }));
    expect((await decide(no, { state: 'x', instructions: 'Ship?' })).verdict).toBe('no');
  });

  it('abstains inside the uncertainty band instead of forcing a verdict', async () => {
    const client = fakeClient(() => ({ decision: noulAnswer(0.55) }));
    const result = await decide(client, { state: 'x', instructions: 'Ship?' });
    expect(result.verdict).toBe('abstain');
    expect(result.abstained).toBe(true);
  });

  it('rejects a response whose answer type does not match the question', async () => {
    const client = fakeClient(() => ({
      decision: choiceAnswer('yes', { yes: 1 }, 1),
    }));
    await expect(decide(client, { state: 'x', instructions: 'Ship?' })).rejects.toThrow('noul answer');
  });
});

describe('rule-based workflow executor', () => {
  const gateClient = (noul: number) => fakeClient(() => ({ gate: noulAnswer(noul) }));

  it('executes declared steps in order, enforcing the tool allow-list', async () => {
    const tool = jest.fn(() => 42);
    const runner = new WorkflowRunner({
      tools: { compute: tool },
      client: gateClient(0.9),
    });
    const steps: WorkflowStep[] = [
      { id: 's1', kind: 'code', code: 'state.count = (state.count || 0) + 1; result = state.count' , save: 'first' },
      { id: 's2', kind: 'tool', tool: 'compute', args: { n: 1 }, save: 'answer' },
    ];
    const result = await runner.run(steps, { count: 0 });
    expect(result.status).toBe('completed');
    expect(result.state.first).toBe(1);
    expect(result.state.answer).toBe(42);
    expect(tool).toHaveBeenCalledWith({ n: 1 }, expect.anything());
  });

  it('fails the workflow on an unknown tool instead of skipping silently', async () => {
    const runner = new WorkflowRunner({ tools: {} });
    const result = await runner.run([{ id: 't', kind: 'tool', tool: 'rm_rf' }]);
    expect(result.status).toBe('failed');
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].error).toContain('allow-list');
  });

  it('keeps code steps sandboxed: no process, no require, hard timeout', async () => {
    const runner = new WorkflowRunner({ defaultCodeTimeoutMs: 100 });
    const escape = await runner.run([{ id: 'bad', kind: 'code', code: 'result = typeof process' }]);
    expect(escape.state).toBeDefined();
    expect(escape.steps[0].result).toBe('undefined');

    const infinite = await runner.run([{ id: 'loop', kind: 'code', code: 'while (true) {}', timeoutMs: 50, optional: true }]);
    expect(infinite.steps[0].status).toBe('failed');
    expect(infinite.steps[0].error).toMatch(/timed out/i);
  });

  it('closes low-confidence gates and opens confident ones, with an audit trail', async () => {
    const steps: WorkflowStep[] = [
      { id: 'risky', kind: 'tool', tool: 'deploy', gate: { question: { type: 'noul', instructions: 'Green build?' }, minConfidence: 0.8 }, save: 'out' },
    ];
    const tool = jest.fn(() => 'deployed');
    const closed = await new WorkflowRunner({ tools: { deploy: tool }, client: gateClient(0.5) }).run(steps, {});
    expect(closed.steps[0].status).toBe('skipped-gate');
    expect(tool).not.toHaveBeenCalled();
    expect(closed.audit).toHaveLength(1);
    expect(closed.audit[0]).toMatchObject({ kind: 'gate', stepId: 'risky', outcome: 'closed' });

    const opened = await new WorkflowRunner({ tools: { deploy: tool }, client: gateClient(0.95) }).run(steps, {});
    expect(opened.steps[0].status).toBe('executed');
    expect(opened.audit[0].outcome).toBe('open');
    expect(opened.audit[0].stateHash).toHaveLength(16);
  });

  it('records decision steps with an abstention policy', async () => {
    const client = fakeClient(() => ({ decision: noulAnswer(0.55) }));
    const runner = new WorkflowRunner({ client });
    const result = await runner.run([
      { id: 'd', kind: 'decision', question: { type: 'noul', instructions: 'Escalate?' }, minConfidence: 0.8, save: 'escalate', onAbstain: 'default', defaultValue: 'human-review' },
    ], {});
    expect(result.state.escalate).toBe('human-review');
    expect(result.steps[0].status).toBe('skipped-abstain');
    expect(result.audit[0].outcome).toBe('abstain:default');
  });

  it('honours plain rule-based conditions and dry-run (no tools, no Jev calls)', async () => {
    const tool = jest.fn(() => 'ran');
    const runner = new WorkflowRunner({ tools: { doIt: tool }, client: gateClient(0.9) });
    const result = await runner.run([
      { id: 'cond', kind: 'tool', tool: 'doIt', when: state => state.go === true },
      { id: 'never', kind: 'tool', tool: 'doIt', when: state => state.go === 'nope' },
    ], { go: true });
    expect(result.steps[0].status).toBe('executed');
    expect(result.steps[1].status).toBe('skipped-condition');
    expect(tool).toHaveBeenCalledTimes(1);

    const dryTool = jest.fn(() => 'ran');
    const dryRunner = new WorkflowRunner({ tools: { doIt: dryTool }, dryRun: true });
    const dryResult = await dryRunner.run([{ id: 't', kind: 'tool', tool: 'doIt' }], {});
    expect(dryResult.status).toBe('dry-run');
    expect(dryTool).not.toHaveBeenCalled();
  });
});
