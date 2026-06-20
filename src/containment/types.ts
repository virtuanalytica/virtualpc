/**
 * ContainmentGuard MEGA — Type Definitions
 *
 * Preventive containment layer for autonomous agents. Where the Guardrails
 * agent is REACTIVE (detects anomalies after they happen) and the Kill Switch
 * is a manual emergency stop, ContainmentGuard is PROACTIVE: every agent action
 * (shell command, filesystem access, network egress, process spawn) is evaluated
 * against policy BEFORE it executes, and is allowed / contained / denied.
 *
 * Severity is intentionally compatible with ../guardrails/types so breaches can
 * surface in the same operational vocabulary.
 */

import type { Severity } from '../guardrails/types';
export type { Severity };

/** What the guard decided about an action. Ordered allow < contain < deny. */
export type ContainmentDecision = 'allow' | 'contain' | 'deny';

/** The class of action being evaluated. */
export type ActionKind =
  | 'command' // a shell command line
  | 'process-spawn' // spawning a child process (argv)
  | 'fs-read'
  | 'fs-write'
  | 'network'; // an outbound connection / fetch

/** Trust tier assigned to an agent; gates which capabilities it may use. */
export type CapabilityTier = 'trusted' | 'standard' | 'restricted' | 'untrusted';

/** The reason-bucket a verdict falls into. */
export type ContainmentCategory =
  | 'dangerous-command'
  | 'privilege-escalation'
  | 'fs-jail'
  | 'secret-access'
  | 'network-egress'
  | 'resource-limit'
  | 'agent-loop'
  | 'capability';

/** Operating mode. monitor = log only (non-breaking); enforce = actually block. */
export type ContainmentMode = 'monitor' | 'enforce';

/** A single action submitted to the guard for evaluation. */
export interface ContainmentAction {
  kind: ActionKind;
  agent?: string;
  /** command line (kind=command) or argv joined (kind=process-spawn) */
  command?: string;
  /** filesystem path (kind=fs-read|fs-write) */
  path?: string;
  /** target host or URL (kind=network) */
  host?: string;
  /** working directory the action runs in */
  cwd?: string;
  /** free-form context for rules / audit */
  meta?: Record<string, any>;
}

/** One rule's opinion about an action. */
export interface RuleVerdict {
  ruleId: string;
  decision: ContainmentDecision;
  category: ContainmentCategory;
  severity: Severity;
  reason: string;
}

/** The combined result of evaluating an action against all applicable rules. */
export interface ContainmentResult {
  id: string;
  timestamp: number;
  mode: ContainmentMode;
  action: ContainmentAction;
  /** the most severe decision across all verdicts */
  decision: ContainmentDecision;
  verdicts: RuleVerdict[];
  /** true when mode=enforce AND decision=deny — i.e. the action was actually blocked */
  blocked: boolean;
  /** the highest severity among verdicts (for alerting) */
  severity: Severity;
}

/** A persisted record of a contained/denied action (the breach ledger). */
export interface BreachRecord {
  id: string;
  timestamp: number;
  agent: string;
  kind: ActionKind;
  decision: ContainmentDecision;
  category: ContainmentCategory;
  severity: Severity;
  reason: string;
  blocked: boolean;
  summary: string; // truncated action description (never raw secrets)
}

/** Per-tier capability grants. A missing/false flag means "deny that capability". */
export interface TierCapabilities {
  /** may run arbitrary shell commands at all */
  shell: boolean;
  /** may write to the filesystem (within the jail) */
  fsWrite: boolean;
  /** may make outbound network connections */
  network: boolean;
  /** may spawn child processes */
  spawn: boolean;
  /** commands-per-minute budget for this tier */
  maxCommandsPerMinute: number;
  /** concurrent-process budget for this tier */
  maxProcesses: number;
}

/** A compiled command-deny rule. */
export interface CommandRule {
  id: string;
  pattern: RegExp;
  category: ContainmentCategory;
  severity: Severity;
  decision: ContainmentDecision;
  reason: string;
}

export interface ContainmentPolicy {
  mode: ContainmentMode;

  // ── Command containment ────────────────────────────────────────────────
  commandRules: CommandRule[];

  // ── Filesystem jail ────────────────────────────────────────────────────
  /** absolute roots an agent may WRITE under; writes outside are contained */
  allowedWriteRoots: string[];
  /** paths (prefix match, post-normalisation) that may be NEITHER read nor written */
  protectedPaths: string[];

  // ── Network egress ─────────────────────────────────────────────────────
  egressMode: 'allow-all' | 'allow-list' | 'deny-all';
  egressAllowHosts: string[]; // substring/suffix match on hostname
  egressDenyHosts: string[]; // always denied (exfil/paste sinks)

  // ── Resource & loop limits (global defaults; tiers may tighten) ─────────
  maxCommandsPerMinute: number;
  maxProcessesPerAgent: number;
  /** identical command repeated N times within the window => agent-loop */
  loopRepeatThreshold: number;
  loopWindowMs: number;

  // ── Capability tiers ───────────────────────────────────────────────────
  agentTiers: Record<string, CapabilityTier>;
  defaultTier: CapabilityTier;
  tierCapabilities: Record<CapabilityTier, TierCapabilities>;
}

/** Public status surface for the /api/containment/status endpoint. */
export interface ContainmentStatus {
  mode: ContainmentMode;
  evaluated: number;
  allowed: number;
  contained: number;
  denied: number;
  blocked: number;
  breachesStored: number;
  policy: {
    commandRuleCount: number;
    allowedWriteRoots: string[];
    protectedPathCount: number;
    egressMode: string;
    maxCommandsPerMinute: number;
    maxProcessesPerAgent: number;
    tiers: string[];
  };
  activeAgents: Array<{ agent: string; commandsLastMinute: number; tier: CapabilityTier }>;
}
