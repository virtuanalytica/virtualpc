"use strict";
/**
 * Task Facilitator - Prevents tasks from hanging
 *
 * Ensures continuous agent work by:
 * - Actively distributing pending tasks
 * - Breaking blocked tasks into sub-tasks
 * - Escalating overdue tasks
 * - Maintaining workload balance
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskFacilitator = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const agent_registry_1 = require("../agent-registry");
class TaskFacilitator {
    constructor(config) {
        this.facilitations = new Map();
        this.agentWorkload = new Map();
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
        logger_1.default.info('✓ Task Facilitator initialized (prevents hanging tasks)');
    }
    /**
     * Initialize agent workload tracking
     */
    initializeAgents() {
        agent_registry_1.AGENT_NAMES.forEach(agent => {
            this.agentWorkload.set(agent, 0);
        });
    }
    /**
     * Register a new task for facilitation
     */
    registerTask(taskId, agent, priority = 0) {
        const facilitation = {
            task_id: taskId,
            agent,
            status: 'pending',
            priority,
            assigned_at: new Date(),
            time_elapsed_ms: 0
        };
        this.facilitations.set(taskId, facilitation);
        logger_1.default.debug(`📝 Registered task ${taskId} for ${agent}`);
        return facilitation;
    }
    /**
     * Mark task as assigned to agent
     */
    assignTask(taskId, agent) {
        const facilitation = this.facilitations.get(taskId);
        if (!facilitation) {
            logger_1.default.warn(`Task ${taskId} not found for assignment`);
            return false;
        }
        facilitation.agent = agent;
        facilitation.status = 'assigned';
        facilitation.assigned_at = new Date();
        const currentWorkload = this.agentWorkload.get(agent) || 0;
        this.agentWorkload.set(agent, currentWorkload + 1);
        logger_1.default.info(`✓ Task ${taskId} assigned to ${agent} (workload: ${currentWorkload + 1}/${this.config.maxTasksPerAgent})`);
        return true;
    }
    /**
     * Mark task as executing
     */
    startTask(taskId) {
        const facilitation = this.facilitations.get(taskId);
        if (!facilitation)
            return false;
        facilitation.status = 'executing';
        facilitation.started_at = new Date();
        facilitation.last_activity = new Date();
        logger_1.default.debug(`▶️ Task ${taskId} started (${facilitation.agent})`);
        return true;
    }
    /**
     * Update task activity (prevent timeout)
     */
    updateActivity(taskId) {
        const facilitation = this.facilitations.get(taskId);
        if (facilitation) {
            facilitation.last_activity = new Date();
        }
    }
    /**
     * Mark task as completed
     */
    completeTask(taskId) {
        const facilitation = this.facilitations.get(taskId);
        if (!facilitation)
            return false;
        const workload = this.agentWorkload.get(facilitation.agent) || 0;
        this.agentWorkload.set(facilitation.agent, Math.max(0, workload - 1));
        this.facilitations.delete(taskId);
        logger_1.default.info(`✅ Task ${taskId} completed (${facilitation.agent} workload: ${Math.max(0, workload - 1)})`);
        return true;
    }
    /**
     * Mark task as blocked by other task(s)
     */
    blockTask(taskId, blockedBy) {
        const facilitation = this.facilitations.get(taskId);
        if (facilitation) {
            facilitation.status = 'blocked';
            facilitation.blocked_by = blockedBy;
            logger_1.default.warn(`🚫 Task ${taskId} blocked by: ${blockedBy.join(', ')}`);
        }
    }
    /**
     * Unblock task when dependency is resolved
     */
    unblockTask(taskId) {
        const facilitation = this.facilitations.get(taskId);
        if (facilitation) {
            facilitation.status = 'pending';
            facilitation.blocked_by = undefined;
            logger_1.default.info(`🔓 Task ${taskId} unblocked`);
        }
    }
    /**
     * Check for hanging/blocked tasks every 10 seconds
     */
    startBlockageChecker() {
        this.blockageCheckInterval = setInterval(() => {
            const now = Date.now();
            for (const [taskId, facilitation] of this.facilitations) {
                if (!facilitation.assigned_at)
                    continue;
                const elapsedMs = now - facilitation.assigned_at.getTime();
                facilitation.time_elapsed_ms = elapsedMs;
                // Check for overdue tasks
                if (elapsedMs > this.config.taskTimeoutMs && facilitation.status !== 'blocked') {
                    logger_1.default.warn(`⏱️ Task ${taskId} overdue (${(elapsedMs / 1000).toFixed(1)}s): ` +
                        `Agent ${facilitation.agent} not responding`);
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
    reassignOverdueTask(taskId, facilitation) {
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
            logger_1.default.info(`🔄 Reassigned task ${taskId}: ${currentAgent} (${oldWorkload}) → ` +
                `${lessLoadedAgent} (${newWorkload + 1})`);
        }
    }
    /**
     * Escalate task to Fill (CEO)
     */
    escalateTask(taskId, facilitation) {
        if (facilitation.status === 'escalated')
            return; // Already escalated
        const previousAgent = facilitation.agent;
        facilitation.status = 'escalated';
        facilitation.agent = 'Fill'; // CEO takes over
        logger_1.default.warn(`📢 Escalated task ${taskId} to CEO: ` +
            `${previousAgent} unable to complete after ${(facilitation.time_elapsed_ms / 1000).toFixed(1)}s`);
    }
    /**
     * Find least-loaded agent
     */
    findLessLoadedAgent() {
        let minWorkload = Infinity;
        let minAgent = null;
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
    startRebalancer() {
        this.rebalanceInterval = setInterval(() => {
            this.rebalanceWorkload();
        }, this.config.rebalanceIntervalMs);
    }
    /**
     * Rebalance task distribution
     */
    rebalanceWorkload() {
        const workloadEntries = Array.from(this.agentWorkload.entries())
            .sort((a, b) => b[1] - a[1]);
        const maxWorkload = workloadEntries[0]?.[1] || 0;
        const minWorkload = workloadEntries[workloadEntries.length - 1]?.[1] || 0;
        const diff = maxWorkload - minWorkload;
        // If workload is imbalanced (diff > 2), log it
        if (diff > 2) {
            logger_1.default.debug(`⚖️ Workload imbalance detected (diff: ${diff})`);
            workloadEntries.forEach(([agent, workload]) => {
                logger_1.default.debug(`   ${agent}: ${workload}/${this.config.maxTasksPerAgent}`);
            });
        }
    }
    /**
     * Get task status
     */
    getTaskStatus(taskId) {
        return this.facilitations.get(taskId);
    }
    /**
     * Get agent workload
     */
    getAgentWorkload() {
        const workload = {};
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
    getPendingTasks() {
        return Array.from(this.facilitations.values()).filter(f => f.status === 'pending' || f.status === 'assigned' || f.status === 'executing');
    }
    /**
     * Get blocked tasks
     */
    getBlockedTasks() {
        return Array.from(this.facilitations.values()).filter(f => f.status === 'blocked');
    }
    /**
     * Get escalated tasks
     */
    getEscalatedTasks() {
        return Array.from(this.facilitations.values()).filter(f => f.status === 'escalated');
    }
    /**
     * Get facilitation statistics
     */
    getStats() {
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
    stop() {
        if (this.blockageCheckInterval)
            clearInterval(this.blockageCheckInterval);
        if (this.rebalanceInterval)
            clearInterval(this.rebalanceInterval);
        logger_1.default.info('✓ Task Facilitator stopped');
    }
}
exports.TaskFacilitator = TaskFacilitator;
exports.default = TaskFacilitator;
//# sourceMappingURL=task-facilitator.js.map