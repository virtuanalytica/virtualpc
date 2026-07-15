/**
 * GPU daemon — detect GPU availability on a schedule, drive dynamic model
 * fallback, and boot LM Studio when a GPU returns.
 *
 *  - Probes the hardware (nvidia-smi + /proc/driver/nvidia).
 *  - Checks every GPU_CHECK_INTERVAL_MS (default 3h).
 *  - On a down→up transition: runs the boot hook (scripts/boot-lmstudio.sh) to
 *    start LM Studio + warm the local models.
 *  - getGpuAvailable() is read by /api/models/config so agents on GPU-dependent
 *    models switch to the no-GPU flux fallback while the GPU is down.
 */
import type { Express } from 'express';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { GpuProbe, GpuState, evaluateProbe } from './availability';

const CHECK_INTERVAL_MS = Number(process.env.GPU_CHECK_INTERVAL_MS) || 3 * 60 * 60 * 1000; // 3h
const BOOT_HOOK = path.join(__dirname, '..', '..', 'scripts', 'boot-lmstudio.sh');

let state: GpuState = { available: false, gpuCount: 0, reason: 'not yet probed' };
let lastChecked: string | null = null;
const history: Array<{ ts: string; available: boolean; reason: string }> = [];

function probe(): GpuProbe {
  let smiOk = false, gpuCount = 0;
  try {
    const out = execSync('nvidia-smi --query-gpu=index --format=csv,noheader', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 });
    gpuCount = out.split('\n').filter(l => l.trim() !== '').length;
    smiOk = gpuCount > 0;
  } catch { /* driver down */ }
  const procPresent = fs.existsSync('/proc/driver/nvidia/version');
  return { smiOk, procPresent, gpuCount };
}

/** Boot LM Studio + warm local models (best-effort, detached). */
function runBootHook() {
  try {
    if (!fs.existsSync(BOOT_HOOK)) { logger.warn(`[gpu] boot hook missing: ${BOOT_HOOK}`); return; }
    const child = spawn('bash', [BOOT_HOOK], { detached: true, stdio: 'ignore' });
    child.unref();
    logger.info('[gpu] GPU returned → boot hook started (LM Studio + model warmup)');
  } catch (e: any) { logger.warn(`[gpu] boot hook failed: ${e.message}`); }
}

/** Probe now, update state, fire the boot hook on a down→up transition. */
export function check(): GpuState {
  const prev = state.available;
  const prevGpuCount = state.gpuCount;
  state = evaluateProbe(probe());
  lastChecked = new Date().toISOString();
  history.unshift({ ts: lastChecked, available: state.available, reason: state.reason });
  if (history.length > 50) history.pop();

  // Replan throughput governor if GPU state or count changed
  if (prev !== state.available || prevGpuCount !== state.gpuCount) {
    try {
      const { getGovernor } = require('../integrations/local-inference/throughput-governor');
      const newPlan = getGovernor().refreshProbe();
      logger.info(`[gpu] replan triggered: ${newPlan.reason}`);
    } catch (e: any) {
      logger.warn(`[gpu] governor replan failed: ${e.message}`);
    }
  }

  if (!prev && state.available) {
    logger.info(`[gpu] transition DOWN→UP (${state.reason}) — booting LM Studio`);
    runBootHook();
  } else if (prev && !state.available) {
    logger.warn(`[gpu] transition UP→DOWN (${state.reason}) — agents fall back to no-GPU models`);
  }
  return state;
}

export function getGpuAvailable(): boolean { return state.available; }
export function getGpuState(): { state: GpuState; lastChecked: string | null; intervalMs: number } {
  return { state, lastChecked, intervalMs: CHECK_INTERVAL_MS };
}

export function registerGpuRoutes(app: Express): void {
  app.get('/api/gpu/availability', (_req, res) => {
    res.json({ success: true, ...getGpuState(), history: history.slice(0, 10) });
  });
  app.post('/api/gpu/check', (_req, res) => {
    res.json({ success: true, state: check(), checkedAt: lastChecked });
  });

  try { check(); } catch (e: any) { logger.warn(`[gpu] initial probe failed: ${e.message}`); }
  const t = setInterval(() => { try { check(); } catch { /* keep daemon alive */ } }, CHECK_INTERVAL_MS);
  if (typeof (t as any).unref === 'function') (t as any).unref();
  logger.info(`[gpu] daemon online — available=${state.available} (${state.reason}); checking every ${Math.round(CHECK_INTERVAL_MS / 3600000)}h`);
}
