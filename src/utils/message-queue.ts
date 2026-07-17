/**
 * Generic Message Queue
 *
 * Per-key FIFO queue for serializing async operations.
 * Ensures operations for the same key execute sequentially, not in parallel.
 *
 * Ported from ClaudeClaw's message-queue.ts (55 lines, no dependencies).
 */

type QueueItem<T> = {
  key: string;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
};

export class MessageQueue {
  private queues: Map<string, QueueItem<any>[]> = new Map();
  private processing: Map<string, boolean> = new Map();

  /**
   * Enqueue an async operation for a given key.
   * Ensures operations with the same key execute sequentially.
   */
  async enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const item: QueueItem<T> = { key, task, resolve, reject };

      // Initialize queue if needed
      if (!this.queues.has(key)) {
        this.queues.set(key, []);
      }

      // Add to queue
      this.queues.get(key)!.push(item);

      // Process if not already processing
      if (!this.processing.get(key)) {
        this.processQueue(key);
      }
    });
  }

  /**
   * Process all items in a queue sequentially
   */
  private async processQueue(key: string): Promise<void> {
    this.processing.set(key, true);

    while (true) {
      const queue = this.queues.get(key);
      if (!queue || queue.length === 0) break;

      const item = queue.shift()!;

      try {
        const result = await item.task();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    this.processing.set(key, false);
  }

  /**
   * Get queue size for a key
   */
  getQueueSize(key: string): number {
    return this.queues.get(key)?.length ?? 0;
  }

  /**
   * Clear queue for a key
   */
  clearQueue(key: string): void {
    this.queues.delete(key);
    this.processing.delete(key);
  }

  /**
   * Clear all queues
   */
  clearAll(): void {
    this.queues.clear();
    this.processing.clear();
  }
}

// Singleton instance
export const messageQueue = new MessageQueue();
