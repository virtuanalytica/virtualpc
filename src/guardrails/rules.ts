/**
 * Guardrails Agent — Detection Rules
 * Each rule inspects system state and emits an alert when thresholds are crossed.
 */

import { DetectionRule, RuleContext, GuardrailsAlert, Severity, AlertCategory } from './types';

function makeAlert(
  category: AlertCategory,
  severity: Severity,
  message: string,
  agent: string | undefined,
  details: Record<string, any>
): GuardrailsAlert {
  return {
    id: `${category}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    category,
    severity,
    agent,
    message,
    details,
    acknowledged: false,
  };
}

export const DEFAULT_RULES: DetectionRule[] = [
  // ── Token / Cost Overruns ──────────────────────────────────────────
  {
    id: 'rule-cost-hourly-cap',
    name: 'Hourly cost cap per agent',
    category: 'cost-overrun',
    severity: 'critical',
    enabled: true,
    cooldownMs: 5 * 60 * 1000,
    check: (ctx: RuleContext) => {
      const HOURLY_CAP_USD = 2.0;
      const summaries = ctx.tokenEvents as any[];
      for (const s of summaries) {
        if (s.thisHour?.cost > HOURLY_CAP_USD) {
          return makeAlert('cost-overrun', 'critical',
            `Agent ${s.name} burned $${s.thisHour.cost.toFixed(3)} this hour (cap $${HOURLY_CAP_USD})`,
            s.name,
            { hourlyCost: s.thisHour.cost, cap: HOURLY_CAP_USD, model: s.primaryModel }
          );
        }
      }
      return null;
    },
  },
  {
    id: 'rule-token-spike-5min',
    name: 'Token spike in 5-minute window',
    category: 'token-spike',
    severity: 'warning',
    enabled: true,
    cooldownMs: 2 * 60 * 1000,
    check: (ctx: RuleContext) => {
      const SPIKE_TOKENS = 8000;
      const events = ctx.tokenEvents as any[];
      const cutoff = ctx.now - 5 * 60 * 1000;
      const byAgent: Record<string, number> = {};
      for (const ev of events) {
        if (ev.timestamp > cutoff) {
          byAgent[ev.agent] = (byAgent[ev.agent] || 0) + (ev.totalTokens || 0);
        }
      }
      for (const [agent, total] of Object.entries(byAgent)) {
        if (total > SPIKE_TOKENS) {
          return makeAlert('token-spike', 'warning',
            `Agent ${agent} consumed ${total} tokens in 5 min (threshold ${SPIKE_TOKENS})`,
            agent,
            { tokens5Min: total, threshold: SPIKE_TOKENS }
          );
        }
      }
      return null;
    },
  },

  // ── Approval Staleness ─────────────────────────────────────────────
  {
    id: 'rule-approval-stale',
    name: 'Pending approval older than 5 minutes',
    category: 'approval-stale',
    severity: 'warning',
    enabled: true,
    cooldownMs: 60 * 1000,
    check: (ctx: RuleContext) => {
      const MAX_AGE_MS = 5 * 60 * 1000;
      const pending = ctx.approvalEvents as any[];
      for (const a of pending) {
        const age = ctx.now - new Date(a.timestamp).getTime();
        if (age > MAX_AGE_MS) {
          return makeAlert('approval-stale', 'warning',
            `Approval from ${a.source} is stale (${Math.round(age / 1000)}s): "${a.question.slice(0, 80)}..."`,
            undefined,
            { approvalId: a.id, source: a.source, ageSeconds: Math.round(age / 1000), urgency: a.urgency }
          );
        }
      }
      return null;
    },
  },
  {
    id: 'rule-critical-unapproved',
    name: 'Critical approval pending >1 minute',
    category: 'approval-stale',
    severity: 'critical',
    enabled: true,
    cooldownMs: 30 * 1000,
    check: (ctx: RuleContext) => {
      const MAX_AGE_MS = 60 * 1000;
      const pending = ctx.approvalEvents as any[];
      for (const a of pending) {
        if (a.urgency !== 'critical') continue;
        const age = ctx.now - new Date(a.timestamp).getTime();
        if (age > MAX_AGE_MS) {
          return makeAlert('approval-stale', 'critical',
            `CRITICAL approval from ${a.source} unhandled for ${Math.round(age / 1000)}s`,
            undefined,
            { approvalId: a.id, source: a.source, ageSeconds: Math.round(age / 1000) }
          );
        }
      }
      return null;
    },
  },

  // ── Task Stagnation ────────────────────────────────────────────────
  {
    id: 'rule-task-stall-2h',
    name: 'Agent stuck on same task for 2+ hours',
    category: 'task-stagnation',
    severity: 'warning',
    enabled: true,
    cooldownMs: 10 * 60 * 1000,
    check: (ctx: RuleContext) => {
      const STALL_MS = 2 * 60 * 60 * 1000;
      const tasks = ctx.taskState?.tasks || [];
      for (const t of tasks) {
        if (t.status !== 'in-progress') continue;
        const started = t.started_at ? new Date(t.started_at).getTime() : 0;
        if (started && (ctx.now - started) > STALL_MS) {
          return makeAlert('task-stagnation', 'warning',
            `Agent ${t.assigned_to} has been on "${t.title}" for ${Math.round((ctx.now - started) / 3600000)}h with no completion`,
            t.assigned_to,
            { taskId: t.id, taskTitle: t.title, startedAt: t.started_at, progress: t.progress }
          );
        }
      }
      return null;
    },
  },
  {
    id: 'rule-zero-progress-30min',
    name: 'Task in-progress but 0% progress for 30 min',
    category: 'task-stagnation',
    severity: 'critical',
    enabled: true,
    cooldownMs: 5 * 60 * 1000,
    check: (ctx: RuleContext) => {
      const STALL_MS = 30 * 60 * 1000;
      const tasks = ctx.taskState?.tasks || [];
      for (const t of tasks) {
        if (t.status !== 'in-progress' || t.progress > 0) continue;
        const started = t.started_at ? new Date(t.started_at).getTime() : 0;
        if (started && (ctx.now - started) > STALL_MS) {
          return makeAlert('task-stagnation', 'critical',
            `Agent ${t.assigned_to} task "${t.title}" is 0% complete after ${Math.round((ctx.now - started) / 60000)} min — possible loop or crash`,
            t.assigned_to,
            { taskId: t.id, taskTitle: t.title, startedAt: t.started_at }
          );
        }
      }
      return null;
    },
  },

  // ── Inference Failures ─────────────────────────────────────────────
  {
    id: 'rule-inference-cascade',
    name: '5+ LLM failures in 10 minutes',
    category: 'inference-failure',
    severity: 'critical',
    enabled: true,
    cooldownMs: 5 * 60 * 1000,
    check: (ctx: RuleContext) => {
      const THRESHOLD = 5;
      const WINDOW_MS = 10 * 60 * 1000;
      const llm = ctx.llmState;
      const throughput = llm?.lastThroughput || {};
      let failures = 0;
      // We approximate failures by looking for agents with zero throughput + recent errors
      // Real implementation should track explicit failure events
      const events = ctx.tokenEvents as any[];
      const cutoff = ctx.now - WINDOW_MS;
      for (const ev of events) {
        if (ev.timestamp > cutoff && ev.action?.includes('failure')) failures++;
      }
      if (failures >= THRESHOLD) {
        return makeAlert('inference-failure', 'critical',
          `${failures} LLM failures in the last 10 minutes — gateway may be down or overloaded`,
          undefined,
          { failures, threshold: THRESHOLD, windowMinutes: 10 }
        );
      }
      return null;
    },
  },

  // ── Routing Anomalies ──────────────────────────────────────────────
  {
    id: 'rule-tier3-for-trivial',
    name: 'Tier-3 model used for trivial task',
    category: 'routing-anomaly',
    severity: 'warning',
    enabled: true,
    cooldownMs: 5 * 60 * 1000,
    check: (ctx: RuleContext) => {
      const events = ctx.tokenEvents as any[];
      const cutoff = ctx.now - 10 * 60 * 1000;
      for (const ev of events) {
        if (ev.timestamp > cutoff && ev.tier === 3 && ev.action?.includes('trivial')) {
          return makeAlert('routing-anomaly', 'warning',
            `Agent ${ev.agent} used tier-3 model ${ev.model} for a trivial task`,
            ev.agent,
            { model: ev.model, tier: ev.tier, action: ev.action }
          );
        }
      }
      return null;
    },
  },

  // ── Kill Switch ────────────────────────────────────────────────────
  {
    id: 'rule-kill-switch-active',
    name: 'Kill switch activated',
    category: 'kill-switch',
    severity: 'critical',
    enabled: true,
    cooldownMs: 60 * 1000,
    check: (ctx: RuleContext) => {
      if (ctx.killSwitchState?.isActive) {
        return makeAlert('kill-switch', 'critical',
          'OpenClaw kill switch is ACTIVE — automation processes terminated',
          undefined,
          { activatedAt: ctx.killSwitchState.lastActivatedAt }
        );
      }
      return null;
    },
  },

  // ── Agent Loop Detection ───────────────────────────────────────────
  {
    id: 'rule-agent-loop',
    name: 'Agent proposing to itself repeatedly',
    category: 'agent-loop',
    severity: 'warning',
    enabled: true,
    cooldownMs: 10 * 60 * 1000,
    check: (ctx: RuleContext) => {
      const proposals = ctx.taskState?.proposals || [];
      const cutoff = ctx.now - 30 * 60 * 1000;
      const selfProposals: Record<string, number> = {};
      for (const p of proposals) {
        if (new Date(p.timestamp).getTime() > cutoff && p.from === p.to) {
          selfProposals[p.from] = (selfProposals[p.from] || 0) + 1;
        }
      }
      for (const [agent, count] of Object.entries(selfProposals)) {
        if (count >= 3) {
          return makeAlert('agent-loop', 'warning',
            `Agent ${agent} sent ${count} self-proposals in 30 min — possible loop`,
            agent,
            { selfProposalCount: count, windowMinutes: 30 }
          );
        }
      }
      return null;
    },
  },
];
