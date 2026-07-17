/**
 * Hive Mind — Shared Agent Memory Log
 *
 * A JSON-file-backed log of agent activities and inter-agent tasks.
 * Agents read recent hive-mind entries to understand what other agents
 * have done, enabling coordination without direct API calls.
 *
 * Based on ClaudeClaw's hive_mind + inter_agent_tasks tables,
 * ported to JSON file storage (no external DB dependency).
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { STATE_DIR } from '../config/paths';

export interface HiveMindEntry {
  id: string;
  timestamp: string;
  agentId: string;
  actionType: string;
  summary: string;
  metadata?: Record<string, any>;
}

export interface InterAgentTask {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  result?: string;
}

export class HiveMind {
  private hiveMindFile: string;
  private interAgentTasksFile: string;
  private hiveMindCache: HiveMindEntry[] = [];
  private interAgentTasksCache: InterAgentTask[] = [];

  constructor(stateDir: string = STATE_DIR) {
    this.hiveMindFile = path.join(stateDir, 'hive-mind.jsonl');
    this.interAgentTasksFile = path.join(stateDir, 'inter-agent-tasks.jsonl');
    this.loadFromDisk();
  }

  /**
   * Log a new hive-mind entry
   */
  logHiveMind(agentId: string, actionType: string, summary: string, metadata?: Record<string, any>): string {
    const entry: HiveMindEntry = {
      id: `hm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      agentId,
      actionType,
      summary,
      metadata,
    };

    this.hiveMindCache.push(entry);
    this.persistHiveMindEntry(entry);

    logger.info(`[HiveMind] ${agentId} ${actionType}: ${summary}`, {
      entryId: entry.id,
      ...metadata,
    });

    return entry.id;
  }

  /**
   * Get recent hive-mind entries (all agents)
   */
  getRecentHiveMind(limit = 50): HiveMindEntry[] {
    return this.hiveMindCache
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get hive-mind entries for a specific agent
   */
  getHiveByAgent(agentId: string, limit = 50): HiveMindEntry[] {
    return this.hiveMindCache
      .filter((e) => e.agentId === agentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Create an inter-agent task
   */
  createInterAgentTask(
    fromAgentId: string,
    toAgentId: string,
    title: string,
    description: string,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): InterAgentTask {
    const task: InterAgentTask = {
      id: `iat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromAgentId,
      toAgentId,
      title,
      description,
      priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.interAgentTasksCache.push(task);
    this.persistInterAgentTask(task);

    logger.info(`[InterAgentTask] ${fromAgentId} → ${toAgentId}: ${title}`, {
      taskId: task.id,
      priority,
    });

    return task;
  }

  /**
   * Complete an inter-agent task
   */
  completeInterAgentTask(taskId: string, result: string, status: 'completed' | 'failed' = 'completed'): void {
    const task = this.interAgentTasksCache.find((t) => t.id === taskId);
    if (!task) {
      logger.warn(`[InterAgentTask] Task not found: ${taskId}`);
      return;
    }

    task.status = status;
    task.completedAt = new Date().toISOString();
    task.result = result;

    this.persistInterAgentTask(task);
    logger.info(`[InterAgentTask] ${task.id} marked ${status}`, { result });
  }

  /**
   * Get all inter-agent tasks
   */
  getInterAgentTasks(filter?: { status?: string; fromAgent?: string; toAgent?: string }): InterAgentTask[] {
    let results = [...this.interAgentTasksCache];

    if (filter?.status) {
      results = results.filter((t) => t.status === filter.status);
    }
    if (filter?.fromAgent) {
      results = results.filter((t) => t.fromAgentId === filter.fromAgent);
    }
    if (filter?.toAgent) {
      results = results.filter((t) => t.toAgentId === filter.toAgent);
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Private: Load from disk on init
   */
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.hiveMindFile)) {
        const lines = fs.readFileSync(this.hiveMindFile, 'utf-8').split('\n').filter(Boolean);
        this.hiveMindCache = lines.map((line) => JSON.parse(line));
      }

      if (fs.existsSync(this.interAgentTasksFile)) {
        const lines = fs.readFileSync(this.interAgentTasksFile, 'utf-8').split('\n').filter(Boolean);
        this.interAgentTasksCache = lines.map((line) => JSON.parse(line));
      }

      logger.info(`[HiveMind] Loaded ${this.hiveMindCache.length} entries and ${this.interAgentTasksCache.length} tasks`, {
        hiveMindFile: this.hiveMindFile,
        interAgentTasksFile: this.interAgentTasksFile,
      });
    } catch (e: any) {
      logger.error(`[HiveMind] Failed to load from disk: ${e.message}`);
    }
  }

  /**
   * Private: Persist a single hive-mind entry
   */
  private persistHiveMindEntry(entry: HiveMindEntry): void {
    try {
      fs.appendFileSync(this.hiveMindFile, JSON.stringify(entry) + '\n');
    } catch (e: any) {
      logger.error(`[HiveMind] Failed to persist entry: ${e.message}`);
    }
  }

  /**
   * Private: Persist an inter-agent task
   */
  private persistInterAgentTask(task: InterAgentTask): void {
    try {
      // For simplicity, rewrite entire file on update
      // (In production, might use a better append-only strategy)
      const lines = this.interAgentTasksCache.map((t) => JSON.stringify(t));
      fs.writeFileSync(this.interAgentTasksFile, lines.join('\n') + '\n');
    } catch (e: any) {
      logger.error(`[HiveMind] Failed to persist task: ${e.message}`);
    }
  }
}

// Singleton instance
export const hiveMind = new HiveMind();
