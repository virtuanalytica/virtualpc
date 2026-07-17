/**
 * Audit Trail System
 *
 * Tracks all critical actions in VirtualPC for compliance,
 * security investigation, and operational accountability.
 */

import logger from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  agentId?: string;
  action: 'user_access' | 'deployment' | 'config_change' | 'secrets_access' | 'task_create' | 'task_complete' | 'session_start' | 'session_end';
  resource: string;
  details: Record<string, any>;
  status: 'success' | 'failure';
  ipAddress?: string;
  metadata?: Record<string, any>;
}

export class AuditTrail {
  private entries: AuditEntry[] = [];
  private auditDir: string;
  private currentDayFile: string = '';
  private maxEntriesInMemory = 10000;

  constructor(auditDir: string = '/media/knight2/EDS2/virtualpc-audit') {
    this.auditDir = auditDir;
    this.ensureAuditDir();
    this.rotateLogIfNeeded();
  }

  /**
   * Log an audit event
   */
  log(
    action: AuditEntry['action'],
    resource: string,
    status: 'success' | 'failure' = 'success',
    details: Record<string, any> = {},
    options?: {
      userId?: string;
      agentId?: string;
      ipAddress?: string;
      metadata?: Record<string, any>;
    }
  ): string {
    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      userId: options?.userId || 'system',
      agentId: options?.agentId,
      action,
      resource,
      status,
      details,
      ipAddress: options?.ipAddress,
      metadata: options?.metadata,
    };

    this.entries.push(entry);

    // Persist to disk
    this.persistEntry(entry);

    // Log to application logger
    logger.info(`[AUDIT] ${action} on ${resource}: ${status}`, {
      auditId: entry.id,
      userId: entry.userId,
      ...details,
    });

    // If memory is full, rotate to file
    if (this.entries.length > this.maxEntriesInMemory) {
      this.rotateLog();
    }

    return entry.id;
  }

  /**
   * Log user access (login, permission change, etc.)
   */
  logUserAccess(userId: string, action: string, ipAddress?: string, success = true): string {
    return this.log('user_access', userId, success ? 'success' : 'failure', {
      action,
      ipAddress,
    });
  }

  /**
   * Log deployment event
   */
  logDeployment(
    service: string,
    version: string,
    userId: string,
    success = true,
    error?: string
  ): string {
    return this.log(
      'deployment',
      service,
      success ? 'success' : 'failure',
      { version, error },
      { userId }
    );
  }

  /**
   * Log configuration change
   */
  logConfigChange(
    configKey: string,
    oldValue: any,
    newValue: any,
    userId: string,
    reason?: string
  ): string {
    return this.log(
      'config_change',
      configKey,
      'success',
      { oldValue, newValue, reason },
      { userId }
    );
  }

  /**
   * Log secrets access
   */
  logSecretsAccess(secretKey: string, userId: string, action: 'read' | 'write', ipAddress?: string): string {
    return this.log(
      'secrets_access',
      secretKey,
      'success',
      { action },
      { userId, ipAddress }
    );
  }

  /**
   * Log task creation
   */
  logTaskCreate(taskId: string, agentId: string, priority: string, userId: string): string {
    return this.log(
      'task_create',
      taskId,
      'success',
      { agentId, priority },
      { userId }
    );
  }

  /**
   * Log task completion
   */
  logTaskComplete(taskId: string, agentId: string, userId: string, success = true): string {
    return this.log(
      'task_complete',
      taskId,
      success ? 'success' : 'failure',
      { agentId },
      { userId }
    );
  }

  /**
   * Get audit entries with filtering
   */
  getEntries(filter?: {
    action?: AuditEntry['action'];
    resource?: string;
    userId?: string;
    since?: Date;
    limit?: number;
  }): AuditEntry[] {
    let results = [...this.entries];

    if (filter?.action) {
      results = results.filter((e) => e.action === filter.action);
    }

    if (filter?.resource) {
      results = results.filter((e) => e.resource === filter.resource);
    }

    if (filter?.userId) {
      results = results.filter((e) => e.userId === filter.userId);
    }

    if (filter?.since) {
      results = results.filter((e) => new Date(e.timestamp) >= filter.since!);
    }

    // Most recent first
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Get summary statistics
   */
  getStats(timewindowHours = 24): {
    totalActions: number;
    successCount: number;
    failureCount: number;
    byAction: Record<string, number>;
    byUser: Record<string, number>;
  } {
    const since = new Date(Date.now() - timewindowHours * 60 * 60 * 1000);
    const recent = this.getEntries({ since });

    const stats = {
      totalActions: recent.length,
      successCount: recent.filter((e) => e.status === 'success').length,
      failureCount: recent.filter((e) => e.status === 'failure').length,
      byAction: {} as Record<string, number>,
      byUser: {} as Record<string, number>,
    };

    for (const entry of recent) {
      stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
      stats.byUser[entry.userId] = (stats.byUser[entry.userId] || 0) + 1;
    }

    return stats;
  }

  /**
   * Export audit trail to JSON
   */
  exportToJSON(filter?: Parameters<typeof this.getEntries>[0]): string {
    const entries = this.getEntries(filter);
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Export audit trail to CSV
   */
  exportToCSV(filter?: Parameters<typeof this.getEntries>[0]): string {
    const entries = this.getEntries(filter);
    const headers = ['Timestamp', 'Action', 'Resource', 'User', 'Status', 'Details'];
    const rows = entries.map((e) => [
      e.timestamp,
      e.action,
      e.resource,
      e.userId,
      e.status,
      JSON.stringify(e.details),
    ]);

    return [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
  }

  /**
   * Private: Ensure audit directory exists
   */
  private ensureAuditDir(): void {
    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
      logger.info(`[AuditTrail] Created audit directory: ${this.auditDir}`);
    }
  }

  /**
   * Private: Persist entry to disk
   */
  private persistEntry(entry: AuditEntry): void {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.auditDir, `audit_${today}.jsonl`);

      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (e: any) {
      logger.error(`[AuditTrail] Failed to persist entry: ${e.message}`);
    }
  }

  /**
   * Private: Rotate log when in-memory buffer is full
   */
  private rotateLog(): void {
    if (this.entries.length === 0) return;

    try {
      const archiveFile = path.join(this.auditDir, `audit_archive_${Date.now()}.jsonl`);
      const lines = this.entries.map((e) => JSON.stringify(e));
      fs.writeFileSync(archiveFile, lines.join('\n'));

      this.entries = [];
      logger.info(`[AuditTrail] Rotated log to archive: ${archiveFile}`);
    } catch (e: any) {
      logger.error(`[AuditTrail] Failed to rotate log: ${e.message}`);
    }
  }

  /**
   * Private: Check if log needs rotation (new day)
   */
  private rotateLogIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.currentDayFile !== today) {
      this.currentDayFile = today;
      this.rotateLog();
    }
  }
}

// Singleton instance
export const auditTrail = new AuditTrail();
