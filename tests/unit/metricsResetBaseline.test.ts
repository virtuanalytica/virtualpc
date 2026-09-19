import * as path from 'path';
import * as os from 'os';

/**
 * Reset-baseline truth contract.
 *
 * With autonomous ticks disabled and no real work-log/artifact events, the
 * engine must not fabricate in-progress work: seeded tasks stay pending,
 * hasRealActivityEvidence() is false (so the API reports 0 active/busy
 * agents), task counts are preserved, and throughput counters start at zero.
 */
describe('reset-baseline metrics contract (no ticks, no evidence)', () => {
  let taskEngine: typeof import('../../src/task-engine');

  beforeAll(() => {
    jest.useFakeTimers();
    delete process.env.VIRTUALPC_AUTONOMOUS_TICKS;
    process.env.VIRTUALPC_NEW_RESET = '1';
    process.env.VIRTUALPC_STATE_DIR = path.join(
      os.tmpdir(),
      `vpc-reset-baseline-test-${process.pid}`
    );
    taskEngine = require('../../src/task-engine');
  });

  afterAll(() => {
    jest.useRealTimers();
    delete process.env.VIRTUALPC_NEW_RESET;
  });

  it('reports no activity evidence when ticks are off and no work is logged', () => {
    expect(taskEngine.hasRealActivityEvidence()).toBe(false);
  });

  it('seeds only pending tasks — no fabricated in-progress state or progress', () => {
    const items = taskEngine.getBacklogItems();
    const inProgress = items.filter(
      (i: any) => i.status === 'in-progress' || i.status === 'in_progress'
    );
    expect(inProgress).toHaveLength(0);
    for (const item of items as any[]) {
      expect(item.progress || 0).toBe(0);
    }
  });

  it('preserves task counts (4 seeded tasks per agent) with zero reset counters', () => {
    const stats = taskEngine.getGameStats();
    const items = taskEngine.getBacklogItems();
    expect(items.length).toBe(stats.agentCount * 4);
    expect(stats.tasksCompleted).toBe(0);
    expect(stats.tasksInProgress).toBe(0);
    expect(stats.completedLastMinute).toBe(0);
    expect(stats.completedLastHour).toBe(0);
    expect(stats.completedLast24h).toBe(0);
    expect(stats.lastCompletionTs).toBeNull();
  });

  it('reports every agent as idle via getAgentProgress (route status source)', () => {
    for (const [, backlog] of Object.entries(taskEngine.getPerPersonBacklog())) {
      expect((backlog as any).active).toBe(0);
    }
  });

  it('flips evidence to true only after a real work-log event', () => {
    taskEngine.logWork('Zip', 'T-1', 'evidence test', 'sub-1', 'subtask_completed', 1);
    expect(taskEngine.hasRealActivityEvidence()).toBe(true);
  });
});
