/**
 * Inference settings + compute-plan API — backs the options UI.
 *
 *   GET /api/inference/compute-plan  dynamic capacity estimate + live t/s
 *   GET /api/inference/settings      current settings + selectable roster
 *   PUT /api/inference/settings      update (usageMode, minTokensPerSec,
 *                                    activeAgents ≥ 5, maxConcurrentOverride)
 *   POST /api/inference/replan       re-probe the host (e.g. GPU hotplug)
 */

import { Express, Request, Response } from 'express';
import { AGENT_META } from '../../agent-registry';
import { getGovernor, MIN_ACTIVE_AGENTS } from './throughput-governor';

export function registerInferenceRoutes(app: Express): void {
  app.get('/api/inference/compute-plan', (_req: Request, res: Response) => {
    const g = getGovernor();
    res.json({
      success: true,
      plan: g.getPlan(),
      calibration_tps: g.getCalibration(),
      active_streams: g.getActiveStreams(),
      queue_depth: g.getQueueDepth(),
    });
  });

  app.get('/api/inference/settings', (_req: Request, res: Response) => {
    const g = getGovernor();
    const settings = g.getSettings();
    res.json({
      success: true,
      settings,
      min_active_agents: MIN_ACTIVE_AGENTS,
      usage_modes: ['light', 'balanced', 'heavy', 'custom'],
      agents: AGENT_META.map(a => ({
        name: a.name,
        role: a.role,
        avatar: a.avatar,
        kind: a.kind,
        active: g.isAgentActive(a.name),
      })),
    });
  });

  app.put('/api/inference/settings', (req: Request, res: Response) => {
    const g = getGovernor();
    const known = AGENT_META.map(a => a.name);
    const patch = req.body || {};
    try {
      const settings = g.updateSettings(
        {
          ...(patch.usageMode !== undefined && { usageMode: patch.usageMode }),
          ...(patch.customFactor !== undefined && { customFactor: Number(patch.customFactor) }),
          ...(patch.minTokensPerSec !== undefined && { minTokensPerSec: Number(patch.minTokensPerSec) }),
          ...(patch.activeAgents !== undefined && { activeAgents: patch.activeAgents }),
          ...(patch.maxConcurrentOverride !== undefined && {
            maxConcurrentOverride:
              patch.maxConcurrentOverride === null ? null : Number(patch.maxConcurrentOverride),
          }),
        },
        known
      );
      res.json({ success: true, settings, plan: g.getPlan() });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.post('/api/inference/replan', (_req: Request, res: Response) => {
    const g = getGovernor();
    res.json({ success: true, plan: g.refreshProbe() });
  });
}

export default registerInferenceRoutes;
