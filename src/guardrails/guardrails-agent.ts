/**
 * 007
 * Monitors all virtualpc subsystems for suspicious activity,
 * raises alerts, tracks incidents, and exposes manual intervention controls.
 */

import { GuardrailsAlert, GuardrailsIncident, InterventionRecord, InterventionType,
         SystemHealth, AgentHealthSnapshot, DetectionRule, RuleContext } from './types';
import { DEFAULT_RULES } from './rules';
import logger from '../utils/logger';

// Lazy imports to avoid circular deps at module load time
let tokenTracker: any;
let approvalMonitor: any;
let lmStudio: any;
let taskEngine: any;
let killSwitch: any;

function ensureDeps() {
  if (!tokenTracker) {
    tokenTracker = require('../token-tracker');
    approvalMonitor = require('../approval-monitor');
    lmStudio = require('../lmstudio');
    taskEngine = require('../task-engine');
    killSwitch = require('../openclaw-kill-switch');
  }
}

export class GuardrailsAgent {
  private alerts: Map<string, GuardrailsAlert> = new Map();
  private incidents: Map<string, GuardrailsIncident> = new Map();
  private interventions: InterventionRecord[] = [];
  private rules: DetectionRule[] = [...DEFAULT_RULES];
  private pausedAgents: Set<string> = new Set();
  private blockedModels: Set<string> = new Set();
  private lastRuleRun = 0;
  private ruleCooldowns: Map<string, number> = new Map();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private pollIntervalMs = 15000) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    logger.info('[007] Agent started — polling every ' + this.pollIntervalMs + 'ms');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      logger.info('[007] Agent stopped');
    }
  }

  // ── Core Tick ──────────────────────────────────────────────────────
  private tick() {
    try {
      ensureDeps();
      this.runDetectionRules();
      this.promoteAlertsToIncidents();
      this.autoInterventions();
    } catch (e: any) {
      logger.error('[007] Tick error: ' + e.message);
    }
  }

  // ── Detection Engine ───────────────────────────────────────────────
  private runDetectionRules() {
    const now = Date.now();
    const ctx = this.buildRuleContext(now);

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      const last = this.ruleCooldowns.get(rule.id) || 0;
      if (now - last < rule.cooldownMs) continue;

      try {
        const alert = rule.check(ctx);
        if (alert) {
          this.alerts.set(alert.id, alert);
          this.ruleCooldowns.set(rule.id, now);
          logger.warn(`[007] ${alert.severity.toUpperCase()} alert: ${alert.message}`);
        }
      } catch (e: any) {
        logger.error(`[007] Rule ${rule.id} crashed: ${e.message}`);
      }
    }
  }

  private buildRuleContext(now: number): RuleContext {
    const tt = tokenTracker || {};
    const am = approvalMonitor || {};
    const te = taskEngine || {};
    const lm = lmStudio || {};
    const ks = killSwitch?.killSwitch || {};

    return {
      tokenEvents: tt.events || [],
      approvalEvents: Array.from(am.pendingApprovals?.values?.() || []),
      taskState: {
        tasks: te.tasks || [],
        proposals: te.getAllProposals?.() || [],
      },
      llmState: {
        lastThroughput: lm.getLastThroughput?.() || {},
        health: lm.healthCheck ? undefined : undefined, // async, skip for sync tick
      },
      killSwitchState: ks.getStatus ? ks.getStatus() : { isActive: false },
      now,
    };
  }

  // ── Incident Management ────────────────────────────────────────────
  private promoteAlertsToIncidents() {
    const unacked = Array.from(this.alerts.values()).filter(a => !a.acknowledged);
    const byKey = new Map<string, GuardrailsAlert[]>();

    for (const a of unacked) {
      const key = `${a.category}:${a.agent || 'system'}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(a);
    }

    for (const [key, alerts] of byKey) {
      if (alerts.length >= 3) {
        // Check if incident already open
        const existing = Array.from(this.incidents.values())
          .find(i => !i.resolved && i.category === alerts[0].category && i.agent === alerts[0].agent);
        if (!existing) {
          const inc: GuardrailsIncident = {
            id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            alertIds: alerts.map(a => a.id),
            startedAt: alerts[0].timestamp,
            agent: alerts[0].agent,
            category: alerts[0].category,
            severity: alerts[0].severity,
            summary: `${alerts.length} ${alerts[0].category} alerts for ${alerts[0].agent || 'system'}`,
            interventions: [],
            resolved: false,
          };
          this.incidents.set(inc.id, inc);
          logger.error(`[007] INCIDENT opened: ${inc.summary}`);
        }
      }
    }
  }

  private autoInterventions() {
    for (const inc of this.incidents.values()) {
      if (inc.resolved) continue;
      // Auto-pause agent on critical cost overrun or kill-switch
      if (inc.category === 'cost-overrun' && inc.severity === 'critical' && inc.agent) {
        if (!this.pausedAgents.has(inc.agent)) {
          this.intervene({
            type: 'pause-agent', initiatedBy: 'system', targetAgent: inc.agent,
            reason: `Auto-pause due to incident ${inc.id} (cost overrun)`,
          });
        }
      }
    }
  }

  // ── Public API: Queries ────────────────────────────────────────────
  getAlerts(opts?: { severity?: string; acknowledged?: boolean; agent?: string; limit?: number }): GuardrailsAlert[] {
    let list = Array.from(this.alerts.values());
    if (opts?.severity) list = list.filter(a => a.severity === opts.severity);
    if (opts?.acknowledged !== undefined) list = list.filter(a => a.acknowledged === opts.acknowledged);
    if (opts?.agent) list = list.filter(a => a.agent === opts.agent);
    list.sort((a, b) => b.timestamp - a.timestamp);
    return opts?.limit ? list.slice(0, opts.limit) : list;
  }

  getIncidents(opts?: { resolved?: boolean; agent?: string; limit?: number }): GuardrailsIncident[] {
    let list = Array.from(this.incidents.values());
    if (opts?.resolved !== undefined) list = list.filter(i => i.resolved === opts.resolved);
    if (opts?.agent) list = list.filter(i => i.agent === opts.agent);
    list.sort((a, b) => b.startedAt - a.startedAt);
    return opts?.limit ? list.slice(0, opts.limit) : list;
  }

  getInterventions(limit?: number): InterventionRecord[] {
    const list = [...this.interventions].sort((a, b) => b.timestamp - a.timestamp);
    return limit ? list.slice(0, limit) : list;
  }

  getSystemHealth(): SystemHealth {
    ensureDeps();
    const tt = tokenTracker || {};
    const am = approvalMonitor || {};
    const te = taskEngine || {};
    const ks = killSwitch?.killSwitch || {};

    const summary = tt.getAgentSummary?.() || {};
    const agentMap = summary.agents || {};
    const agentNames = Object.keys(agentMap);
    const pending = Array.from(am.pendingApprovals?.values?.() || []);
    const now = Date.now();

    const agentHealth: AgentHealthSnapshot[] = agentNames.map((name: string) => {
      const a = agentMap[name];
      const tasks = te.tasks || [];
      const myTask = tasks.find((t: any) => t.assigned_to === name && t.status === 'in-progress');
      const started = myTask?.started_at ? new Date(myTask.started_at).getTime() : 0;
      const stallMin = started ? Math.max(0, Math.floor((now - started) / 60000)) : 0;
      return {
        agent: name,
        status: this.pausedAgents.has(name) ? 'paused'
          : stallMin > 120 ? 'stalled'
          : 'healthy',
        currentTask: myTask?.title,
        taskStallMinutes: stallMin,
        tokensThisHour: a?.thisHour?.tokens || 0,
        costThisHour: a?.thisHour?.cost || 0,
        failedCallsLast10Min: 0, // TODO: explicit failure tracking
        lastActivityAt: started || now,
        approvedModels: [],
        blockedModels: Array.from(this.blockedModels),
      };
    });

    const allAlerts = Array.from(this.alerts.values()).filter(a => !a.acknowledged);
    const critical = allAlerts.filter(a => a.severity === 'critical').length;
    const stale = pending.filter((p: any) => (now - new Date(p.timestamp).getTime()) > 5 * 60 * 1000).length;

    const totalTokensThisHour = agentNames.reduce((s, n) => s + (agentMap[n]?.thisHour?.tokens || 0), 0);
    const totalCostThisHour = agentNames.reduce((s, n) => s + (agentMap[n]?.thisHour?.cost || 0), 0);

    return {
      overall: critical > 0 ? 'critical' : allAlerts.length > 0 ? 'degraded' : 'healthy',
      activeAlerts: allAlerts.length,
      criticalAlerts: critical,
      pendingApprovals: pending.length,
      staleApprovals: stale,
      totalTokensThisHour,
      totalCostThisHour,
      agents: agentHealth,
      killSwitchActive: ks.getStatus ? ks.getStatus().isActive : false,
      lastTickAt: this.lastRuleRun,
    };
  }

  // ── Public API: Actions ────────────────────────────────────────────
  acknowledgeAlert(alertId: string, by: string): boolean {
    const a = this.alerts.get(alertId);
    if (!a) return false;
    a.acknowledged = true;
    a.acknowledgedBy = by;
    a.acknowledgedAt = Date.now();
    logger.info(`[007] Alert ${alertId} acknowledged by ${by}`);
    return true;
  }

  intervene(opts: {
    type: InterventionType;
    initiatedBy: 'system' | 'user';
    targetAgent?: string;
    targetTask?: string;
    targetModel?: string;
    reason: string;
  }): InterventionRecord {
    const rec: InterventionRecord = {
      id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      timestamp: Date.now(),
      ...opts,
      result: 'pending',
    };

    try {
      switch (opts.type) {
        case 'pause-agent':
          if (opts.targetAgent) {
            this.pausedAgents.add(opts.targetAgent);
            rec.result = 'success';
            logger.warn(`[007] Agent ${opts.targetAgent} PAUSED by ${opts.initiatedBy}`);
          } else { rec.result = 'failed'; }
          break;
        case 'resume-agent':
          if (opts.targetAgent) {
            this.pausedAgents.delete(opts.targetAgent);
            rec.result = 'success';
            logger.info(`[007] Agent ${opts.targetAgent} RESUMED by ${opts.initiatedBy}`);
          } else { rec.result = 'failed'; }
          break;
        case 'kill-task':
          if (opts.targetTask && taskEngine?.setTaskStatus) {
            taskEngine.setTaskStatus(opts.targetTask, 'pending');
            rec.result = 'success';
          } else { rec.result = 'failed'; }
          break;
        case 'reassign-task':
          // TODO: implement if taskEngine supports reassignment
          rec.result = 'failed';
          break;
        case 'block-model':
          if (opts.targetModel) {
            this.blockedModels.add(opts.targetModel);
            rec.result = 'success';
          } else { rec.result = 'failed'; }
          break;
        case 'unblock-model':
          if (opts.targetModel) {
            this.blockedModels.delete(opts.targetModel);
            rec.result = 'success';
          } else { rec.result = 'failed'; }
          break;
        case 'clear-approvals':
          if (approvalMonitor?.clearExpired) {
            approvalMonitor.clearExpired(0);
            rec.result = 'success';
          } else { rec.result = 'failed'; }
          break;
        case 'acknowledge':
          rec.result = 'success';
          break;
      }
    } catch (e: any) {
      rec.result = 'failed';
      logger.error(`[007] Intervention ${opts.type} failed: ${e.message}`);
    }

    this.interventions.push(rec);

    // Attach to incident if matching
    for (const inc of this.incidents.values()) {
      if (!inc.resolved && inc.agent === opts.targetAgent) {
        inc.interventions.push(rec);
      }
    }

    return rec;
  }

  resolveIncident(incidentId: string): boolean {
    const inc = this.incidents.get(incidentId);
    if (!inc) return false;
    inc.resolved = true;
    inc.endedAt = Date.now();
    logger.info(`[007] Incident ${incidentId} resolved`);
    return true;
  }

  isAgentPaused(agent: string): boolean {
    return this.pausedAgents.has(agent);
  }

  isModelBlocked(model: string): boolean {
    return this.blockedModels.has(model);
  }

  // ── Rule Management ────────────────────────────────────────────────
  getRules(): DetectionRule[] {
    return this.rules.map(r => ({ ...r }));
  }

  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const r = this.rules.find(x => x.id === ruleId);
    if (!r) return false;
    r.enabled = enabled;
    return true;
  }
}

// Singleton export
export const guardrailsAgent = new GuardrailsAgent();
export default guardrailsAgent;
