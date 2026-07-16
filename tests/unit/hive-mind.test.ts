/**
 * Hive Mind Tests
 *
 * Verify shared agent memory logging, filtering, and inter-agent task coordination
 */

import { HiveMind } from '../../src/orchestration/hive-mind';

describe('Hive Mind', () => {
  let hiveMind: HiveMind;

  beforeEach(() => {
    // Use in-memory instance for testing
    hiveMind = new HiveMind('/tmp/hive-mind-test');
  });

  describe('Hive Mind Logging', () => {
    it('should log a new hive-mind entry', () => {
      const entryId = hiveMind.logHiveMind('kai', 'deploy', 'Deployed backend v1.2.3', { service: 'api' });

      expect(entryId).toMatch(/^hm_/);
      const entries = hiveMind.getRecentHiveMind();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].agentId).toBe('kai');
      expect(entries[0].actionType).toBe('deploy');
    });

    it('should include metadata in entry', () => {
      hiveMind.logHiveMind('zip', 'design', 'Updated dashboard', { version: 2, status: 'approved' });

      const entries = hiveMind.getRecentHiveMind();
      expect(entries[0].metadata).toEqual({ version: 2, status: 'approved' });
    });

    it('should store entries in chronological order (newest first)', async () => {
      hiveMind.logHiveMind('kai', 'action1', 'First');
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 10));
      hiveMind.logHiveMind('mira', 'action2', 'Second');
      await new Promise(r => setTimeout(r, 10));
      hiveMind.logHiveMind('luna', 'action3', 'Third');

      const entries = hiveMind.getRecentHiveMind(3);
      expect(entries[0].summary).toBe('Third');
      expect(entries[1].summary).toBe('Second');
      expect(entries[2].summary).toBe('First');
    });
  });

  describe('Filtering by Agent', () => {
    beforeEach(() => {
      hiveMind.logHiveMind('kai', 'deploy', 'Deploy action 1');
      hiveMind.logHiveMind('zip', 'design', 'Design action 1');
      hiveMind.logHiveMind('kai', 'deploy', 'Deploy action 2');
      hiveMind.logHiveMind('mira', 'test', 'Test action 1');
    });

    it('should filter by agent', () => {
      const kaiEntries = hiveMind.getHiveByAgent('kai');
      const zipEntries = hiveMind.getHiveByAgent('zip');

      expect(kaiEntries.length).toBe(2);
      expect(zipEntries.length).toBe(1);
      expect(kaiEntries.every((e) => e.agentId === 'kai')).toBe(true);
      expect(zipEntries.every((e) => e.agentId === 'zip')).toBe(true);
    });

    it('should respect limit', () => {
      const recent = hiveMind.getRecentHiveMind(2);
      expect(recent.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Inter-Agent Tasks', () => {
    it('should create an inter-agent task', () => {
      const task = hiveMind.createInterAgentTask('kai', 'luna', 'Run tests', 'Test the deployment', 'high');

      expect(task.id).toMatch(/^iat_/);
      expect(task.fromAgentId).toBe('kai');
      expect(task.toAgentId).toBe('luna');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('high');
    });

    it('should default to medium priority', () => {
      const task = hiveMind.createInterAgentTask('kai', 'zip', 'Some task', 'Description');

      expect(task.priority).toBe('medium');
    });

    it('should track task status', () => {
      const task = hiveMind.createInterAgentTask('kai', 'mira', 'Task 1', 'Do something');
      expect(task.status).toBe('pending');

      hiveMind.completeInterAgentTask(task.id, 'Task completed successfully', 'completed');

      const tasks = hiveMind.getInterAgentTasks({ status: 'completed' });
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].status).toBe('completed');
      expect(tasks[0].result).toBe('Task completed successfully');
    });

    it('should support task completion with failed status', () => {
      const task = hiveMind.createInterAgentTask('kai', 'luna', 'Risky task', 'Something that might fail');
      hiveMind.completeInterAgentTask(task.id, 'Failed: connection timeout', 'failed');

      const tasks = hiveMind.getInterAgentTasks({ status: 'failed' });
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].result).toContain('timeout');
    });
  });

  describe('Inter-Agent Task Filtering', () => {
    beforeEach(() => {
      hiveMind.createInterAgentTask('kai', 'luna', 'Task 1', 'Description 1', 'high');
      hiveMind.createInterAgentTask('kai', 'zip', 'Task 2', 'Description 2', 'medium');
      hiveMind.createInterAgentTask('zip', 'luna', 'Task 3', 'Description 3', 'low');
    });

    it('should filter by sender agent', () => {
      const tasks = hiveMind.getInterAgentTasks({ fromAgent: 'kai' });
      expect(tasks.length).toBe(2);
      expect(tasks.every((t) => t.fromAgentId === 'kai')).toBe(true);
    });

    it('should filter by receiver agent', () => {
      const tasks = hiveMind.getInterAgentTasks({ toAgent: 'luna' });
      expect(tasks.length).toBe(2);
      expect(tasks.every((t) => t.toAgentId === 'luna')).toBe(true);
    });

    it('should combine filters', () => {
      const tasks = hiveMind.getInterAgentTasks({ fromAgent: 'kai', toAgent: 'luna' });
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('should sort by creation time (newest first)', () => {
      const tasks = hiveMind.getInterAgentTasks();
      if (tasks.length >= 2) {
        const date1 = new Date(tasks[0].createdAt).getTime();
        const date2 = new Date(tasks[1].createdAt).getTime();
        expect(date1).toBeGreaterThanOrEqual(date2);
      }
    });
  });

  describe('Timestamps and Metadata', () => {
    it('should use ISO 8601 timestamps', () => {
      const entryId = hiveMind.logHiveMind('kai', 'action', 'Test');
      const entries = hiveMind.getRecentHiveMind();
      const entry = entries.find((e) => e.id === entryId);

      expect(entry?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const date = new Date(entry?.timestamp || '');
      expect(date).toBeInstanceOf(Date);
    });

    it('should store task creation timestamp', () => {
      const task = hiveMind.createInterAgentTask('kai', 'luna', 'Task', 'Description');

      expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const date = new Date(task.createdAt);
      expect(date).toBeInstanceOf(Date);
    });

    it('should store task completion timestamp', () => {
      const task = hiveMind.createInterAgentTask('kai', 'luna', 'Task', 'Description');
      hiveMind.completeInterAgentTask(task.id, 'Done', 'completed');

      const completed = hiveMind.getInterAgentTasks({ status: 'completed' })[0];
      expect(completed.completedAt).toBeDefined();
      expect(completed.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
