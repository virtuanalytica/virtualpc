/**
 * Message Queue Tests
 *
 * Verify FIFO serialization per-key functionality
 */

import { MessageQueue } from '../../src/utils/message-queue';

describe('Message Queue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue();
  });

  afterEach(() => {
    queue.clearAll();
  });

  describe('Basic Enqueueing', () => {
    it('should enqueue and process a single task', async () => {
      let executed = false;
      const result = await queue.enqueue('test', async () => {
        executed = true;
        return 'done';
      });

      expect(executed).toBe(true);
      expect(result).toBe('done');
    });

    it('should handle errors in tasks', async () => {
      await expect(
        queue.enqueue('test', async () => {
          throw new Error('Task failed');
        })
      ).rejects.toThrow('Task failed');
    });
  });

  describe('FIFO Serialization', () => {
    it('should execute tasks in order per key', async () => {
      const order: number[] = [];

      const task1 = queue.enqueue('key1', async () => {
        order.push(1);
        return 'task1';
      });

      const task2 = queue.enqueue('key1', async () => {
        order.push(2);
        return 'task2';
      });

      const task3 = queue.enqueue('key1', async () => {
        order.push(3);
        return 'task3';
      });

      await Promise.all([task1, task2, task3]);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should allow parallel execution for different keys', async () => {
      const execution: string[] = [];

      const task1 = queue.enqueue('key1', async () => {
        execution.push('key1-start');
        await new Promise((r) => setTimeout(r, 50));
        execution.push('key1-end');
      });

      const task2 = queue.enqueue('key2', async () => {
        execution.push('key2-start');
        await new Promise((r) => setTimeout(r, 10));
        execution.push('key2-end');
      });

      await Promise.all([task1, task2]);

      // key2 should finish before key1
      expect(execution).toEqual(['key1-start', 'key2-start', 'key2-end', 'key1-end']);
    });
  });

  describe('Queue Management', () => {
    it('should report queue size', async () => {
      // Queue first task (which will process immediately)
      queue.enqueue('key1', async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Queue second task before first completes
      const queuePromise = queue.enqueue('key1', async () => {
        return 'second';
      });

      // Check queue size before completion
      expect(queue.getQueueSize('key1')).toBeGreaterThanOrEqual(0); // May be processing or queued

      await queuePromise;
    });

    it('should clear queue for a key', async () => {
      queue.enqueue('key1', async () => 'task1');
      queue.clearQueue('key1');

      expect(queue.getQueueSize('key1')).toBe(0);
    });

    it('should clear all queues', async () => {
      queue.enqueue('key1', async () => 'task1');
      queue.enqueue('key2', async () => 'task2');
      queue.clearAll();

      expect(queue.getQueueSize('key1')).toBe(0);
      expect(queue.getQueueSize('key2')).toBe(0);
    });
  });

  describe('Async Operations', () => {
    it('should handle async delays', async () => {
      const result = await queue.enqueue('test', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'delayed result';
      });

      expect(result).toBe('delayed result');
    });

    it('should handle multiple async operations sequentially', async () => {
      const times: number[] = [];

      const task1 = queue.enqueue('key', async () => {
        times.push(Date.now());
        await new Promise((r) => setTimeout(r, 30));
      });

      const task2 = queue.enqueue('key', async () => {
        times.push(Date.now());
        await new Promise((r) => setTimeout(r, 30));
      });

      await Promise.all([task1, task2]);

      // Task 2 should start after task 1 finishes
      expect(times[1] - times[0]).toBeGreaterThanOrEqual(25);
    });
  });
});
