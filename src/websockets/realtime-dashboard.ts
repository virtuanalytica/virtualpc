/**
 * Real-time Dashboard Service
 *
 * WebSocket server for live agent status, task completion, and hive mind activity.
 * Integrates with Hive Mind + task-engine + agent-orchestrator.
 */

import { Server as SocketIOServer } from 'socket.io';
import logger from '../utils/logger';

export class RealtimeDashboard {
  private io: SocketIOServer;
  private realtimeData: any = {};

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupHandlers();
    this.startPolling();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info(`[Dashboard] Client connected: ${socket.id}`);

      socket.on('request-initial-state', () => {
        socket.emit('dashboard-state', this.buildDashboardState());
      });

      socket.on('disconnect', () => {
        logger.info(`[Dashboard] Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Periodically broadcast updates to all connected clients
   */
  private startPolling(): void {
    setInterval(() => {
      const state = this.buildDashboardState();

      // Only broadcast if state changed
      if (JSON.stringify(state) !== JSON.stringify(this.realtimeData)) {
        this.realtimeData = state;
        this.io.emit('dashboard-update', state);
      }
    }, 1000); // 1-second polling
  }

  /**
   * Build current dashboard state from all sources
   */
  private buildDashboardState(): any {
    try {
      // Lazy-load optional modules (only available after ClaudeClaw PRs merged)
      let hiveMindData = { recent_entries: [], inter_agent_tasks: [] };
      let tasksData = { all: [], summary: { total: 0, completed: 0, pending: 0 } };
      let agentStats = { active_sessions: 0, total_messages: 0, agents: {} };
      let tokenUsage = { agents: {}, recent_events: [], daily_total: 0, hourly_total: 0 };

      try {
        const { hiveMind } = require('../orchestration/hive-mind');
        if (hiveMind) {
          hiveMindData = {
            recent_entries: hiveMind.getRecentHiveMind(10),
            inter_agent_tasks: hiveMind.getInterAgentTasks({ status: 'pending' }),
          };
        }
      } catch (e) {
        // Hive Mind not yet merged; use empty data
      }

      try {
        const taskEngine = require('../task-engine');
        if (taskEngine) {
          tasksData = {
            all: taskEngine.getTasks?.() || [],
            summary: taskEngine.getTaskSummary?.() || { total: 0, completed: 0, pending: 0 },
          };
        }
      } catch (e) {
        // Task engine data unavailable
      }

      try {
        const { agentOrchestrator } = require('../orchestration/agent-orchestrator');
        if (agentOrchestrator) {
          agentStats = agentOrchestrator.getStats?.() || agentStats;
        }
      } catch (e) {
        // Agent orchestrator not yet merged; use empty data
      }

      try {
        const tokenTracker = require('../token-tracker');
        if (tokenTracker) {
          const agentSummary = tokenTracker.getAgentSummary?.();
          const recentEvents = tokenTracker.getRecentEvents?.(undefined, 5) || [];
          const hourlyUsage = tokenTracker.getHourlyUsage?.() || [];
          const dailyUsage = tokenTracker.getDailyUsage?.() || [];

          // Aggregate token costs from daily usage
          const dailyTotal = dailyUsage.length > 0
            ? dailyUsage[0]?.total_cost || 0
            : 0;

          // Aggregate token costs from hourly usage
          const hourlyTotal = hourlyUsage.length > 0
            ? hourlyUsage[0]?.total_cost || 0
            : 0;

          tokenUsage = {
            agents: agentSummary || {},
            recent_events: recentEvents,
            daily_total: dailyTotal,
            hourly_total: hourlyTotal,
          };
        }
      } catch (e) {
        // Token tracker data unavailable
      }

      return {
        timestamp: new Date().toISOString(),
        hive_mind: hiveMindData,
        tasks: tasksData,
        agents: agentStats,
        tokens: tokenUsage,
        meta: {
          server_uptime: process.uptime(),
          memory_usage: process.memoryUsage(),
        },
      };
    } catch (error: any) {
      logger.error(`[RealtimeDashboard] buildDashboardState error: ${error.message}`);
      return {
        timestamp: new Date().toISOString(),
        hive_mind: { recent_entries: [], inter_agent_tasks: [] },
        tasks: { all: [], summary: { total: 0, completed: 0, pending: 0 } },
        agents: { active_sessions: 0, total_messages: 0, agents: {} },
        tokens: { agents: {}, recent_events: [], daily_total: 0, hourly_total: 0 },
        meta: { server_uptime: process.uptime(), memory_usage: process.memoryUsage() },
      };
    }
  }

  /**
   * Broadcast a specific event to all clients
   */
  broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /**
   * Get socket.io instance for advanced usage
   */
  getInstance(): SocketIOServer {
    return this.io;
  }
}
