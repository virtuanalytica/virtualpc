/**
 * ContainmentGuard MEGA — the engine.
 *
 * `evaluate(action)` runs an action through every applicable dimension
 * (command rules, fs jail, secret access, network egress, resource/loop limits,
 * capability tier) and returns a combined ContainmentResult. In `enforce` mode a
 * `deny` result means the caller MUST NOT execute the action; `assertAllowed()`
 * throws a ContainmentError to make that the path of least resistance.
 *
 * The guard is side-effecting only in safe ways: it records breaches in a bounded
 * ring buffer, writes an audit event, and — for critical breaches in enforce mode
 * — can trip the kill switch. It never executes anything itself.
 */

import * as path from 'path';
import * as os from 'os';
import type {
  ContainmentAction,
  ContainmentPolicy,
  ContainmentResult,
  ContainmentMode,
  ContainmentDecision,
  RuleVerdict,
  BreachRecord,
  CapabilityTier,
  ContainmentStatus,
  Severity,
} from './types';
import { buildDefaultPolicy } from './policy';

const DECISION_RANK: Record<ContainmentDecision, number> = { allow: 0, contain: 1, deny: 2 };
const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

export class ContainmentError extends Error {
  readonly result: ContainmentResult;
  constructor(result: ContainmentResult) {
    super(`ContainmentGuard denied ${result.action.kind} for agent "${result.action.agent || 'unknown'}": ${result.verdicts.find((v) => v.decision === 'deny')?.reason || 'policy violation'}`);
    this.name = 'ContainmentError';
    this.result = result;
  }
}

interface AgentRuntime {
  commandTimestamps: number[]; // epoch ms of recent commands (for rate)
  recent: Array<{ cmd: string; at: number }>; // for loop detection
  liveProcesses: number;
}

export interface ContainmentHooks {
  /** called for every contained/denied action (severity warning+) */
  onBreach?: (record: BreachRecord, result: ContainmentResult) => void;
  /** audit sink: (userId, action, resource, status, details) */
  audit?: (userId: string, action: string, resource: string, status: 'success' | 'failure', details?: any) => void;
  /** invoked for critical breaches in enforce mode */
  onCritical?: (record: BreachRecord) => void;
}

export class ContainmentGuard {
  private policy: ContainmentPolicy;
  private hooks: ContainmentHooks;
  private breaches: BreachRecord[] = [];
  private agents = new Map<string, AgentRuntime>();
  private counters = { evaluated: 0, allowed: 0, contained: 0, denied: 0, blocked: 0 };
  private readonly maxBreaches = 5000;

  constructor(policy?: Partial<ContainmentPolicy>, hooks: ContainmentHooks = {}) {
    this.policy = { ...buildDefaultPolicy(), ...(policy || {}) };
    this.hooks = hooks;
  }

  get mode(): ContainmentMode {
    return this.policy.mode;
  }
  setMode(mode: ContainmentMode): void {
    this.policy.mode = mode;
  }
  getPolicy(): ContainmentPolicy {
    return this.policy;
  }

  tierFor(agent?: string): CapabilityTier {
    if (!agent) return this.policy.defaultTier;
    return this.policy.agentTiers[agent] || this.policy.defaultTier;
  }

  private rt(agent: string): AgentRuntime {
    let r = this.agents.get(agent);
    if (!r) {
      r = { commandTimestamps: [], recent: [], liveProcesses: 0 };
      this.agents.set(agent, r);
    }
    return r;
  }

  // ── Public lifecycle for process accounting ──────────────────────────────
  noteProcessStarted(agent: string): void {
    this.rt(agent || 'unknown').liveProcesses++;
  }
  noteProcessEnded(agent: string): void {
    const r = this.rt(agent || 'unknown');
    r.liveProcesses = Math.max(0, r.liveProcesses - 1);
  }

  /**
   * Evaluate an action. Pure w.r.t. execution; records breaches + audit.
   */
  evaluate(action: ContainmentAction): ContainmentResult {
    const now = Date.now();
    const agent = action.agent || 'unknown';
    const verdicts: RuleVerdict[] = [];

    const caps = this.policy.tierCapabilities[this.tierFor(agent)];

    // 1) Capability gate (tier may forbid the whole class of action).
    if ((action.kind === 'command' || action.kind === 'process-spawn') && !caps.shell) {
      verdicts.push({ ruleId: 'cap-no-shell', decision: 'deny', category: 'capability', severity: 'critical', reason: `tier "${this.tierFor(agent)}" may not run shell commands` });
    }
    if (action.kind === 'fs-write' && !caps.fsWrite) {
      verdicts.push({ ruleId: 'cap-no-fswrite', decision: 'deny', category: 'capability', severity: 'critical', reason: `tier "${this.tierFor(agent)}" may not write files` });
    }
    if (action.kind === 'network' && !caps.network) {
      verdicts.push({ ruleId: 'cap-no-network', decision: 'deny', category: 'capability', severity: 'warning', reason: `tier "${this.tierFor(agent)}" may not use the network` });
    }
    if (action.kind === 'process-spawn' && !caps.spawn) {
      verdicts.push({ ruleId: 'cap-no-spawn', decision: 'deny', category: 'capability', severity: 'warning', reason: `tier "${this.tierFor(agent)}" may not spawn processes` });
    }

    // 2) Dimension-specific rules.
    if (action.kind === 'command' || action.kind === 'process-spawn') {
      this.checkCommand(action, agent, now, caps, verdicts);
    } else if (action.kind === 'fs-write' || action.kind === 'fs-read') {
      this.checkFs(action, verdicts);
    } else if (action.kind === 'network') {
      this.checkNetwork(action, verdicts);
    }

    // 3) Combine to the most severe decision + severity.
    let decision: ContainmentDecision = 'allow';
    let severity: Severity = 'info';
    for (const v of verdicts) {
      if (DECISION_RANK[v.decision] > DECISION_RANK[decision]) decision = v.decision;
      if (SEVERITY_RANK[v.severity] > SEVERITY_RANK[severity]) severity = v.severity;
    }

    const blocked = this.policy.mode === 'enforce' && decision === 'deny';
    const result: ContainmentResult = {
      id: `cg_${now}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      mode: this.policy.mode,
      action,
      decision,
      verdicts,
      blocked,
      severity,
    };

    // 4) Bookkeeping (after a decision so loops/rates count even when allowed).
    this.counters.evaluated++;
    if (decision === 'allow') this.counters.allowed++;
    else if (decision === 'contain') this.counters.contained++;
    else this.counters.denied++;
    if (blocked) this.counters.blocked++;

    if (action.kind === 'command' || action.kind === 'process-spawn') {
      const r = this.rt(agent);
      r.commandTimestamps.push(now);
      r.recent.push({ cmd: (action.command || '').trim(), at: now });
      // trim windows
      const cutoff = now - this.policy.loopWindowMs;
      r.commandTimestamps = r.commandTimestamps.filter((t) => t >= cutoff);
      r.recent = r.recent.filter((e) => e.at >= cutoff);
    }

    if (decision !== 'allow') this.record(result);
    return result;
  }

  /** Evaluate and throw in enforce mode when denied. Returns the result otherwise. */
  assertAllowed(action: ContainmentAction): ContainmentResult {
    const result = this.evaluate(action);
    if (result.blocked) throw new ContainmentError(result);
    return result;
  }

  // ── Dimension checks ─────────────────────────────────────────────────────

  private checkCommand(action: ContainmentAction, agent: string, now: number, caps: { maxCommandsPerMinute: number; maxProcesses: number }, verdicts: RuleVerdict[]): void {
    const cmd = (action.command || '').trim();
    if (!cmd) return;

    for (const rule of this.policy.commandRules) {
      if (rule.pattern.test(cmd)) {
        verdicts.push({ ruleId: rule.id, decision: rule.decision, category: rule.category, severity: rule.severity, reason: rule.reason });
      }
    }

    // Rate limit (tier-tightened).
    const r = this.rt(agent);
    const cutoff = now - this.policy.loopWindowMs;
    const inWindow = r.commandTimestamps.filter((t) => t >= cutoff).length;
    const limit = Math.min(this.policy.maxCommandsPerMinute, caps.maxCommandsPerMinute);
    if (inWindow >= limit) {
      verdicts.push({ ruleId: 'rate-limit', decision: 'contain', category: 'resource-limit', severity: 'warning', reason: `command rate ${inWindow}/min exceeds ${limit}/min for agent "${agent}"` });
    }

    // Loop detection: identical command repeated within the window.
    const same = r.recent.filter((e) => e.cmd === cmd && e.at >= cutoff).length;
    if (same >= this.policy.loopRepeatThreshold) {
      verdicts.push({ ruleId: 'agent-loop', decision: 'contain', category: 'agent-loop', severity: 'warning', reason: `identical command repeated ${same}x within ${Math.round(this.policy.loopWindowMs / 1000)}s — probable loop` });
    }

    // Concurrent-process budget.
    const procLimit = Math.min(this.policy.maxProcessesPerAgent, caps.maxProcesses);
    if (r.liveProcesses >= procLimit) {
      verdicts.push({ ruleId: 'process-budget', decision: 'contain', category: 'resource-limit', severity: 'warning', reason: `agent "${agent}" already holds ${r.liveProcesses}/${procLimit} live processes` });
    }
  }

  private checkFs(action: ContainmentAction, verdicts: RuleVerdict[]): void {
    if (!action.path) return;
    const abs = this.resolvePath(action.path, action.cwd);

    // Protected paths: deny read AND write.
    for (const p of this.policy.protectedPaths) {
      const pp = this.resolvePath(p);
      if (abs === pp || abs.startsWith(pp + path.sep)) {
        verdicts.push({ ruleId: 'protected-path', decision: 'deny', category: 'secret-access', severity: 'critical', reason: `access to protected path ${p}` });
        return;
      }
    }

    // Write jail: writes must be under an allowed root.
    if (action.kind === 'fs-write') {
      const ok = this.policy.allowedWriteRoots.some((root) => {
        const rr = this.resolvePath(root);
        return abs === rr || abs.startsWith(rr + path.sep);
      });
      if (!ok) {
        verdicts.push({ ruleId: 'fs-jail', decision: 'contain', category: 'fs-jail', severity: 'warning', reason: `write outside allowed roots: ${abs}` });
      }
    }
  }

  private checkNetwork(action: ContainmentAction, verdicts: RuleVerdict[]): void {
    const host = this.hostOf(action.host || '');
    if (!host) return;

    // Always-deny sinks first (apply even in allow-all).
    if (this.policy.egressDenyHosts.some((h) => this.hostMatches(host, h))) {
      verdicts.push({ ruleId: 'egress-deny', decision: 'deny', category: 'network-egress', severity: 'critical', reason: `egress to denied host ${host}` });
      return;
    }
    if (this.policy.egressMode === 'deny-all') {
      verdicts.push({ ruleId: 'egress-deny-all', decision: 'deny', category: 'network-egress', severity: 'warning', reason: `egress disabled (deny-all): ${host}` });
    } else if (this.policy.egressMode === 'allow-list') {
      const ok = this.policy.egressAllowHosts.some((h) => this.hostMatches(host, h));
      if (!ok) {
        verdicts.push({ ruleId: 'egress-not-allowlisted', decision: 'contain', category: 'network-egress', severity: 'warning', reason: `egress to non-allowlisted host ${host}` });
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private resolvePath(p: string, cwd?: string): string {
    let s = p.trim();
    if (s.startsWith('~')) s = path.join(os.homedir(), s.slice(1));
    if (!path.isAbsolute(s)) s = path.resolve(cwd || process.cwd(), s);
    return path.normalize(s);
  }

  private hostOf(hostOrUrl: string): string {
    let h = hostOrUrl.trim();
    try {
      if (/^[a-z]+:\/\//i.test(h)) h = new URL(h).hostname;
    } catch {
      /* fall through to raw */
    }
    return h.replace(/:\d+$/, '').toLowerCase();
  }

  private hostMatches(host: string, pattern: string): boolean {
    const p = pattern.toLowerCase();
    return host === p || host.endsWith('.' + p) || host.endsWith(p);
  }

  private record(result: ContainmentResult): void {
    const worst = [...result.verdicts].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || DECISION_RANK[b.decision] - DECISION_RANK[a.decision])[0];
    const rec: BreachRecord = {
      id: result.id,
      timestamp: result.timestamp,
      agent: result.action.agent || 'unknown',
      kind: result.action.kind,
      decision: result.decision,
      category: worst?.category || 'capability',
      severity: result.severity,
      reason: worst?.reason || 'policy violation',
      blocked: result.blocked,
      summary: this.summarize(result.action),
    };
    this.breaches.push(rec);
    if (this.breaches.length > this.maxBreaches) this.breaches.shift();

    try {
      this.hooks.onBreach?.(rec, result);
      this.hooks.audit?.(rec.agent, `containment:${rec.decision}`, `${rec.kind}:${rec.category}`, rec.blocked ? 'failure' : 'success', { description: rec.reason, changes: { summary: rec.summary, mode: result.mode } });
      if (rec.severity === 'critical' && result.blocked) this.hooks.onCritical?.(rec);
    } catch {
      /* hooks must never break evaluation */
    }
  }

  /** Truncated, secret-safe description of an action for the breach ledger. */
  private summarize(a: ContainmentAction): string {
    const raw = a.command || a.path || a.host || '';
    const redacted = raw.replace(/(token|secret|password|api[_-]?key)=\S+/gi, '$1=***');
    return redacted.length > 200 ? redacted.slice(0, 197) + '...' : redacted;
  }

  // ── Introspection ──────────────────────────────────────────────────────

  getBreaches(limit = 100): BreachRecord[] {
    return this.breaches.slice(-limit).reverse();
  }

  getStatus(): ContainmentStatus {
    const now = Date.now();
    const cutoff = now - this.policy.loopWindowMs;
    const activeAgents = Array.from(this.agents.entries())
      .map(([agent, r]) => ({ agent, commandsLastMinute: r.commandTimestamps.filter((t) => t >= cutoff).length, tier: this.tierFor(agent) }))
      .filter((a) => a.commandsLastMinute > 0)
      .sort((a, b) => b.commandsLastMinute - a.commandsLastMinute);

    return {
      mode: this.policy.mode,
      evaluated: this.counters.evaluated,
      allowed: this.counters.allowed,
      contained: this.counters.contained,
      denied: this.counters.denied,
      blocked: this.counters.blocked,
      breachesStored: this.breaches.length,
      policy: {
        commandRuleCount: this.policy.commandRules.length,
        allowedWriteRoots: this.policy.allowedWriteRoots,
        protectedPathCount: this.policy.protectedPaths.length,
        egressMode: this.policy.egressMode,
        maxCommandsPerMinute: this.policy.maxCommandsPerMinute,
        maxProcessesPerAgent: this.policy.maxProcessesPerAgent,
        tiers: Object.keys(this.policy.tierCapabilities),
      },
      activeAgents,
    };
  }
}
