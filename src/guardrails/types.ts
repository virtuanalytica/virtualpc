/**
 * Guardrails Agent — Type Definitions
 * Suspicious-activity detection, incident tracking, and manual intervention
 */

export type Severity = 'info' | 'warning' | 'critical';
export type AlertCategory =
  | 'token-spike'
  | 'cost-overrun'
  | 'approval-stale'
  | 'task-stagnation'
  | 'inference-failure'
  | 'routing-anomaly'
  | 'kill-switch'
  | 'content-policy'
  | 'rate-limit'
  | 'agent-loop';

export type InterventionType =
  | 'pause-agent'
  | 'resume-agent'
  | 'kill-task'
  | 'reassign-task'
  | 'block-model'
  | 'unblock-model'
  | 'clear-approvals'
  | 'acknowledge';

export interface GuardrailsAlert {
  id: string;
  timestamp: number;
  category: AlertCategory;
  severity: Severity;
  agent?: string;
  taskId?: string;
  model?: string;
  message: string;
  details: Record<string, any>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

export interface GuardrailsIncident {
  id: string;
  alertIds: string[];
  startedAt: number;
  endedAt?: number;
  agent?: string;
  category: AlertCategory;
  severity: Severity;
  summary: string;
  interventions: InterventionRecord[];
  resolved: boolean;
}

export interface InterventionRecord {
  id: string;
  timestamp: number;
  type: InterventionType;
  initiatedBy: 'system' | 'user';
  targetAgent?: string;
  targetTask?: string;
  targetModel?: string;
  reason: string;
  result: 'success' | 'failed' | 'pending';
}

export interface AgentHealthSnapshot {
  agent: string;
  status: 'healthy' | 'paused' | 'stalled' | 'error';
  currentTask?: string;
  taskStallMinutes: number;
  tokensThisHour: number;
  costThisHour: number;
  failedCallsLast10Min: number;
  lastActivityAt: number;
  approvedModels: string[];
  blockedModels: string[];
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  activeAlerts: number;
  criticalAlerts: number;
  pendingApprovals: number;
  staleApprovals: number;
  totalTokensThisHour: number;
  totalCostThisHour: number;
  agents: AgentHealthSnapshot[];
  killSwitchActive: boolean;
  lastTickAt: number;
}

export interface DetectionRule {
  id: string;
  name: string;
  category: AlertCategory;
  severity: Severity;
  enabled: boolean;
  cooldownMs: number;
  check: (ctx: RuleContext) => GuardrailsAlert | null;
}

export interface RuleContext {
  agent?: string;
  tokenEvents: any[];
  approvalEvents: any[];
  taskState: any;
  llmState: any;
  killSwitchState: any;
  now: number;
}
