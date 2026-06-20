/**
 * ContainmentGuard MEGA — module entry point.
 *
 * Exposes the singleton `containmentGuard`, a couple of ergonomic helpers, and
 * `setupContainmentRoutes(app)` for the Express surface. Wiring to the kill
 * switch is opt-in (CONTAINMENT_KILL_ON_CRITICAL=true) so importing the module
 * can never, by itself, stop the platform.
 */

import type { Express, Request, Response } from 'express';
import { ContainmentGuard, ContainmentError } from './containment-guard';
import type { ContainmentAction, ContainmentResult } from './types';

export { ContainmentGuard, ContainmentError };
export * from './types';

/** Process-wide singleton. */
export const containmentGuard = new ContainmentGuard(undefined, {
  onBreach: (rec) => {
    const icon = rec.severity === 'critical' ? '⛔' : '⚠️';
    const tag = rec.blocked ? 'BLOCKED' : rec.decision.toUpperCase();
    // English, concise — never log the raw secret-bearing command.
    console.warn(`${icon} [containment ${tag}] ${rec.agent} · ${rec.category} · ${rec.reason} · «${rec.summary}»`);
  },
  onCritical: (rec) => {
    if (process.env.CONTAINMENT_KILL_ON_CRITICAL === 'true') {
      try {
        // Lazy require so the kill switch (which grabs the TTY) is only pulled
        // in when explicitly armed.
        const { killSwitch } = require('../openclaw-kill-switch');
        console.error(`⛔ [containment] critical breach by ${rec.agent} — tripping kill switch`);
        killSwitch.activateKillSwitch();
      } catch {
        /* kill switch unavailable — breach already recorded */
      }
    }
  },
});

/**
 * Convenience guard for shell commands. In enforce mode a denied command throws
 * ContainmentError; callers should let it propagate (don't execute). In monitor
 * mode it returns the result and the caller proceeds.
 */
export function guardCommand(agent: string, command: string, cwd?: string): ContainmentResult {
  return containmentGuard.assertAllowed({ kind: 'command', agent, command, cwd });
}

/** Same but never throws — returns the result for callers that branch on it. */
export function evaluateCommand(agent: string, command: string, cwd?: string): ContainmentResult {
  return containmentGuard.evaluate({ kind: 'command', agent, command, cwd });
}

/** Register the /api/containment/* surface. Mirrors setupGuardrailsRoutes style. */
export function setupContainmentRoutes(app: Express): void {
  // Live status + counters + policy summary.
  app.get('/api/containment/status', (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: containmentGuard.getStatus() });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Recent breach ledger (secret-safe summaries).
  app.get('/api/containment/breaches', (req: Request, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 1000);
      res.json({ success: true, data: containmentGuard.getBreaches(limit) });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Dry-run evaluation — agents/operators can pre-check an action without running it.
  app.post('/api/containment/evaluate', (req: Request, res: Response) => {
    try {
      const action = req.body as ContainmentAction;
      if (!action || !action.kind) {
        return res.status(400).json({ success: false, error: 'action.kind required' });
      }
      return res.json({ success: true, data: containmentGuard.evaluate(action) });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // Full policy (for the guardrails/admin UI).
  app.get('/api/containment/policy', (_req: Request, res: Response) => {
    try {
      const p = containmentGuard.getPolicy();
      res.json({
        success: true,
        data: {
          mode: p.mode,
          commandRules: p.commandRules.map((r) => ({ id: r.id, category: r.category, severity: r.severity, decision: r.decision, reason: r.reason, pattern: r.pattern.source })),
          allowedWriteRoots: p.allowedWriteRoots,
          protectedPaths: p.protectedPaths,
          egressMode: p.egressMode,
          egressAllowHosts: p.egressAllowHosts,
          egressDenyHosts: p.egressDenyHosts,
          maxCommandsPerMinute: p.maxCommandsPerMinute,
          maxProcessesPerAgent: p.maxProcessesPerAgent,
          agentTiers: p.agentTiers,
          tierCapabilities: p.tierCapabilities,
        },
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Switch monitor<->enforce. Guarded by the same internal-write auth the rest
  // of the write endpoints use (loopback or INTERNAL_WRITE_SERVICE_TOKEN); the
  // global internalWriteAuth middleware already covers /api/* POSTs.
  app.post('/api/containment/mode', (req: Request, res: Response) => {
    try {
      const mode = String(req.body?.mode || '');
      if (mode !== 'monitor' && mode !== 'enforce') {
        return res.status(400).json({ success: false, error: 'mode must be "monitor" or "enforce"' });
      }
      containmentGuard.setMode(mode);
      return res.json({ success: true, data: { mode } });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}
