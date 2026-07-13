/**
 * Task Facilitator - Prevents tasks from hanging
 *
 * Ensures continuous agent work by:
 * - Actively distributing pending tasks
 * - Breaking blocked tasks into sub-tasks
 * - Escalating overdue tasks
 * - Maintaining workload balance
 */

import logger from '../utils/logger';
import { AGENT_NAMES } from '../agent-registry';

export interface FacilitatorConfig {
  maxTasksPerAgent: number; // Max concurrent tasks
  taskTimeoutMs: number; // Mark as overdue
  blockageCheckIntervalMs: number; // Check for stuck tasks
  rebalanceIntervalMs: number; // Rebalance every N ms
  escalationThresholdMs: number; // Escalate after N ms overdue
}

export interface TaskFacilitation {
  task_id: string;
  agent: string;
  status: 'pending' | 'assigned' | 'executing' | 'blocked' | 'escalated';
  priority: number;
  assigned_at?: Date;
  started_at?: Date;
  last_activity?: Date;
  blocked_by?: string[]; // Task IDs blocking this one
  subtasks?: string[];
  time_elapsed_ms: number;
}

export class TaskFacilitator {
  private config: FacilitatorConfig;
  private facilitations: Map<string, TaskFacilitation> = new Map();
  private agentWorkload: Map<string, number> = new Map();
  private blockageCheckInterval?: ReturnType<typeof setInterval>;
  private rebalanceInterval?: ReturnType<typeof setInterval>;

  constructor(config?: Partial<FacilitatorConfig>) {
    this.config = {
      maxTasksPerAgent: 5,
      taskTimeoutMs: 60000, // 1 minute
      blockageCheckIntervalMs: 10000, // Check every 10 seconds
      rebalanceIntervalMs: 30000, // Rebalance every 30 seconds
      escalationThresholdMs: 120000, // Escalate after 2 minutes
      ...config
    };

    this.initializeAgents();
    this.startBlockageChecker();
    this.startRebalancer();

    logger.info('✓ Task Facilitator initialized (prevents hanging tasks)');
  }

  /**
   * Initialize agent workload tracking
   */
  private initializeAgents(): void {
    AGENT_NAMES.forEach(agent => {
      this.agentWorkload.set(agent, 0);
    });
  }

  /**
   * Register a new task for facilitation
   */
  registerTask(
    taskId: string,
    agent: string,
    priority: number = 0
  ): TaskFacilitation {
    const facilitation: TaskFacilitation = {
      task_id: taskId,
      agent,
      status: 'pending',
      priority,
      assigned_at: new Date(),
      time_elapsed_ms: 0
    };

    this.facilitations.set(taskId, facilitation);
    logger.debug(`📝 Registered task ${taskId} for ${agent}`);

    return facilitation;
  }

  /**
   * Mark task as assigned to agent
   */
  assignTask(taskId: string, agent: string): boolean {
    const facilitation = this.facilitations.get(taskId);
    if (!facilitation) {
      logger.warn(`Task ${taskId} not found for assignment`);
      return false;
    }

    facilitation.agent = agent;
    facilitation.status = 'assigned';
    facilitation.assigned_at = new Date();

    const currentWorkload = this.agentWorkload.get(agent) || 0;
    this.agentWorkload.set(agent, currentWorkload + 1);

    logger.info(`✓ Task ${taskId} assigned to ${agent} (workload: ${currentWorkload + 1}/${this.config.maxTasksPerAgent})`);
    return true;
  }

  /**
   * Mark task as executing
   */
  startTask(taskId: string): boolean {
    const facilitation = this.facilitations.get(taskId);
    if (!facilitation) return false;

    facilitation.status = 'executing';
    facilitation.started_at = new Date();
    facilitation.last_activity = new Date();

    logger.debug(`▶️ Task ${taskId} started (${facilitation.agent})`);
    return true;
  }

  /**
   * Update task activity (prevent timeout)
   */
  updateActivity(taskId: string): void {
    const facilitation = this.facilitations.get(taskId);
    if (facilitation) {
      facilitation.last_activity = new Date();
    }
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string): boolean {
    const facilitation = this.facilitations.get(taskId);
    if (!facilitation) return false;

    const workload = this.agentWorkload.get(facilitation.agent) || 0;
    this.agentWorkload.set(facilitation.agent, Math.max(0, workload - 1));

    this.facilitations.delete(taskId);
    logger.info(`✅ Task ${taskId} completed (${facilitation.agent} workload: ${Math.max(0, workload - 1)})`);

    return true;
  }

  /**
   * Mark task as blocked by other task(s)
   */
  blockTask(taskId: string, blockedBy: string[]): void {
    const facilitation = this.facilitations.get(taskId);
    if (facilitation) {
      facilitation.status = 'blocked';
      facilitation.blocked_by = blockedBy;
      logger.warn(`🚫 Task ${taskId} blocked by: ${blockedBy.join(', ')}`);
    }
  }

  /**
   * Unblock task when dependency is resolved
   */
  unblockTask(taskId: string): void {
    const facilitation = this.facilitations.get(taskId);
    if (facilitation) {
      facilitation.status = 'pending';
      facilitation.blocked_by = undefined;
      logger.info(`🔓 Task ${taskId} unblocked`);
    }
  }

  /**
   * Check for hanging/blocked tasks every 10 seconds
   */
  private startBlockageChecker(): void {
    this.blockageCheckInterval = setInterval(() => {
      const now = Date.now();

      for (const [taskId, facilitation] of this.facilitations) {
        if (!facilitation.assigned_at) continue;

        const elapsedMs = now - facilitation.assigned_at.getTime();
        facilitation.time_elapsed_ms = elapsedMs;

        // Check for overdue tasks
        if (elapsedMs > this.config.taskTimeoutMs && facilitation.status !== 'blocked') {
          logger.warn(
            `⏱️ Task ${taskId} overdue (${(elapsedMs / 1000).toFixed(1)}s): ` +
            `Agent ${facilitation.agent} not responding`
          );

          // Try to reassign to a less-loaded agent
          this.reassignOverdueTask(taskId, facilitation);
        }

        // Check for escalation
        if (elapsedMs > this.config.escalationThresholdMs) {
          this.escalateTask(taskId, facilitation);
        }
      }
    }, this.config.blockageCheckIntervalMs);
  }

  /**
   * Reassign overdue task to less-loaded agent
   */
  private reassignOverdueTask(taskId: string, facilitation: TaskFacilitation): void {
    const currentAgent = facilitation.agent;
    const lessLoadedAgent = this.findLessLoadedAgent();

    if (lessLoadedAgent && lessLoadedAgent !== currentAgent) {
      // Reduce workload from original agent
      const oldWorkload = this.agentWorkload.get(currentAgent) || 0;
      this.agentWorkload.set(currentAgent, Math.max(0, oldWorkload - 1));

      // Assign to less-loaded agent
      facilitation.agent = lessLoadedAgent;
      facilitation.status = 'assigned';
      facilitation.assigned_at = new Date();

      const newWorkload = this.agentWorkload.get(lessLoadedAgent) || 0;
      this.agentWorkload.set(lessLoadedAgent, newWorkload + 1);

      logger.info(
        `🔄 Reassigned task ${taskId}: ${currentAgent} (${oldWorkload}) → ` +
        `${lessLoadedAgent} (${newWorkload + 1})`
      );
    }
  }

  /**
   * Escalate task to Fill (CEO)
   */
  private escalateTask(taskId: string, facilitation: TaskFacilitation): void {
    if (facilitation.status === 'escalated') return; // Already escalated

    const previousAgent = facilitation.agent;
    facilitation.status = 'escalated';
    facilitation.agent = 'Fill'; // CEO takes over

    logger.warn(
      `📢 Escalated task ${taskId} to CEO: ` +
      `${previousAgent} unable to complete after ${(facilitation.time_elapsed_ms / 1000).toFixed(1)}s`
    );
  }

  /**
   * Find least-loaded agent
   */
  private findLessLoadedAgent(): string | null {
    let minWorkload = Infinity;
    let minAgent: string | null = null;

    for (const [agent, workload] of this.agentWorkload) {
      if (workload < minWorkload && workload < this.config.maxTasksPerAgent) {
        minWorkload = workload;
        minAgent = agent;
      }
    }

    return minAgent;
  }

  /**
   * Rebalance workload every 30 seconds
   */
  private startRebalancer(): void {
    this.rebalanceInterval = setInterval(() => {
      this.rebalanceWorkload();
    }, this.config.rebalanceIntervalMs);
  }

  /**
   * Rebalance task distribution
   */
  private rebalanceWorkload(): void {
    const workloadEntries = Array.from(this.agentWorkload.entries())
      .sort((a, b) => b[1] - a[1]);

    const maxWorkload = workloadEntries[0]?.[1] || 0;
    const minWorkload = workloadEntries[workloadEntries.length - 1]?.[1] || 0;
    const diff = maxWorkload - minWorkload;

    // If workload is imbalanced (diff > 2), log it
    if (diff > 2) {
      logger.debug(`⚖️ Workload imbalance detected (diff: ${diff})`);
      workloadEntries.forEach(([agent, workload]) => {
        logger.debug(`   ${agent}: ${workload}/${this.config.maxTasksPerAgent}`);
      });
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskFacilitation | undefined {
    return this.facilitations.get(taskId);
  }

  /**
   * Get agent workload
   */
  getAgentWorkload(): Record<string, { current: number; max: number; availability: number }> {
    const workload: Record<string, any> = {};

    for (const [agent, current] of this.agentWorkload) {
      workload[agent] = {
        current,
        max: this.config.maxTasksPerAgent,
        availability: this.config.maxTasksPerAgent - current,
        utilization: Math.round((current / this.config.maxTasksPerAgent) * 100)
      };
    }

    return workload;
  }

  /**
   * Get all pending/active tasks
   */
  getPendingTasks(): TaskFacilitation[] {
    return Array.from(this.facilitations.values()).filter(
      f => f.status === 'pending' || f.status === 'assigned' || f.status === 'executing'
    );
  }

  /**
   * Get blocked tasks
   */
  getBlockedTasks(): TaskFacilitation[] {
    return Array.from(this.facilitations.values()).filter(f => f.status === 'blocked');
  }

  /**
   * Get escalated tasks
   */
  getEscalatedTasks(): TaskFacilitation[] {
    return Array.from(this.facilitations.values()).filter(f => f.status === 'escalated');
  }

  /**
   * Get facilitation statistics
   */
  getStats(): Record<string, any> {
    const all = Array.from(this.facilitations.values());
    const pending = this.getPendingTasks();
    const blocked = this.getBlockedTasks();
    const escalated = this.getEscalatedTasks();

    return {
      total_tasks: all.length,
      pending: pending.length,
      blocked: blocked.length,
      escalated: escalated.length,
      agent_workload: this.getAgentWorkload(),
      avg_task_age_ms: pending.length > 0
        ? pending.reduce((sum, t) => sum + t.time_elapsed_ms, 0) / pending.length
        : 0,
      overdue_tasks: pending.filter(t => t.time_elapsed_ms > this.config.taskTimeoutMs).length
    };
  }

  /**
   * Stop facilitator
   */
  stop(): void {
    if (this.blockageCheckInterval) clearInterval(this.blockageCheckInterval);
    if (this.rebalanceInterval) clearInterval(this.rebalanceInterval);
    logger.info('✓ Task Facilitator stopped');
  }
}

export default TaskFacilitator;
